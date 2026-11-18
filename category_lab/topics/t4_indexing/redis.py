"""Redis side of indexing (dataset, I2-I5, I7). Keys live in lab:indexing:* (deleted by the runner after the
topic); RediSearch indexes are named lab:indexing:idx:* and dropped in every scenario's teardown
(dataset.drop_search_indexes). I5 also removes the SearchText field it adds to the Hashes.

Redis has no secondary index of its own: a Hash is found only by its key. Each scenario compares, for the
same query as the SQL side:
  scan          SCAN the keyspace and test every Hash (lua/scan_filter.lua): the "no index" baseline
  manual_*      Sets / Sorted sets the application writes next to every Hash (redisidx, common.build_manual)
  search_*      a RediSearch index over the Hashes (FT.CREATE ... PREFIX lab:indexing:s<n>:story:)
Every query reads the same fields as the SQL query, so "find the rows" and "read the rows" are both timed.
Expected results come from the same generated rows as on the SQL side.
"""
import secrets
import time

from lab.framework import Ctx, redis_probe, scenario

from . import common, copies, dataset, picks, redisidx, textsearch
from .copies import label, num
from .dataset import SIZES

LARGEST = SIZES[-1]


def _teardown(ctx: Ctx) -> None:
    dataset.drop_search_indexes(ctx)


# --- dataset ---------------------------------------------------------------------------------------
@scenario(title="Dữ liệu thí nghiệm: Story 1k / 10k / 50k và điều kiện của Redis", pair="dataset",
          repeat=1, warmup=0)
def dataset_story(ctx: Ctx):
    """Loads lab:indexing:s<n>:story:<id> for every size and checks it against the copy rules."""
    search = dataset.search_module(ctx)
    version = ctx.redis.info("server").get("redis_version")
    ctx.observe(f"Redis {version}; RediSearch: {search or 'KHÔNG có (I2-I5, I7 cần module search)'}; "
                f"MAXSEARCHRESULTS = {common.max_search_results(ctx) if search else '-'}.")
    ctx.check(search is not None, "module RediSearch (search) đã được nạp")
    dropped = dataset.drop_search_indexes(ctx)
    if dropped:
        ctx.observe(f"Đã xoá {len(dropped)} index RediSearch còn sót từ lần chạy trước: {', '.join(dropped)}.")

    for n in SIZES:
        generated = dataset.load_redis(ctx, n)
        keys = dataset.count_story_keys(ctx, n)
        ctx.check(keys == n, f"{num(n)} truyện: có đúng {num(n)} Hash story")

        samples = [generated[0], generated[len(generated) // 2], generated[-1]]
        same = all(ctx.redis.hgetall(dataset.story_key(ctx, n, r["StoryId"])) == copies.to_hash(r) for r in samples)
        ctx.check(same, f"{num(n)} truyện: Hash của truyện đầu, giữa và cuối đúng như quy tắc nhân bản")

        lbl = label("Story", n)
        ctx.metric("rows", keys, "dòng", label=lbl, better="none")
        mem = redis_probe.namespace_memory(ctx.redis, f"s{n}:story:*")
        ctx.metric("data_mb", mem["memory_bytes"] / 1024 / 1024, "MB", label=lbl, better="none",
                   note="tổng MEMORY USAGE của các Hash story (chưa có index phụ nào)")
        ctx.inspect_redis_key(lbl, dataset.story_key(ctx, n, 1))
    ctx.observe("Phía SQL Server kiểm tra cùng quy tắc nhân bản bằng fingerprint, nên hai DBMS giữ cùng một "
                "tập truyện ở mọi kích thước.")


def _scan(ctx: Ctx, lbl: str, n: int, *conditions: str) -> set[int]:
    """Timed scan_filter.lua; records the keyspace it had to walk. Returns the matching ids."""
    keyspace, _, found = common.run_lua(ctx, lbl, "scan_filter", dataset.story_prefix(ctx, n) + "*", "ids",
                                        *conditions)
    ctx.metric("keyspace", keyspace, "key", label=lbl, better="none",
               note="DBSIZE: SCAN duyệt mọi key của database, không chỉ key khớp MATCH")
    return {int(x) for x in found}


def _search(ctx: Ctx, lbl: str, args: list) -> tuple[int, list[int]]:
    """Timed FT.SEARCH; returns (total, ids of the page)."""
    ctx.bench_redis(lbl, lambda r: r.execute_command(*args))
    return common.search_ids(ctx, args)


# --- I2 composite / tipping point ------------------------------------------------------------------
I2_FIELDS = ("StoryId", "Title", "RatingAvg", "ChapterCount")
TIP_FIELDS = ("StoryId", "Title", "ChapterCount")


@scenario(title="I2 Index nhiều cột: thứ tự cột, Key Lookup, covering index và tipping point (F2 bộ lọc)",
          pair="i2_composite", repeat=10, warmup=2)
def i2_composite(ctx: Ctx):
    """CompletionStatus = @st AND RatingAvg >= @r: SCAN, two single-column indexes intersected by the
    application, one Sorted set per status ("composite"), and RediSearch TAG + NUMERIC. Then the share of
    matching rows is swept on the largest size: Redis has no optimizer, so there is no tipping point."""
    for n in SIZES:
        rows = dataset.load_redis(ctx, n)
        common.build_manual(ctx, n, rows, ("by_rating", "status", "by_rating_status"))
        prefix = dataset.story_prefix(ctx, n)
        index = common.create_search(ctx, n, "i2", ["CompletionStatus", "TAG", "RatingAvg", "NUMERIC"],
                                     label=label("search", n))
        common.search_memory(ctx, index, label("search", n))
        for kind in ("by_rating", "status", "by_rating_status"):
            common.manual_memory(ctx, n, kind, label(kind, n))

        status, t, want = picks.catalog_filter(rows)
        lbl = label("scan", n)
        common.same_ids(ctx, want, _scan(ctx, lbl, n, "CompletionStatus", "eq", status, "RatingAvg", "ge", str(t)), lbl)

        lbl = label("zset_intersect", n)
        visited, found = common.run_lua(ctx, lbl, "zset_intersect", common.manual_key(ctx, n, "by_rating"),
                                        common.manual_key(ctx, n, "status", status), str(t), prefix, *I2_FIELDS)
        common.same_ids(ctx, want, {int(x) for x in found}, lbl)
        ctx.metric("rows_read", visited, "dòng", label=lbl,
                   note="số id trong khoảng rating phải kiểm tra với Set trạng thái")

        lbl = label("zset_per_status", n)
        found = common.run_lua(ctx, lbl, "zrange_fetch", common.manual_key(ctx, n, "by_rating", status), str(t),
                               "+inf", prefix, *I2_FIELDS)
        common.same_ids(ctx, want, {int(x) for x in found}, lbl)
        ctx.metric("rows_read", len(found), "dòng", label=lbl, note="chỉ duyệt đúng các id khớp")

        lbl = label("search", n)
        total, found = _search(ctx, lbl, common.search_args(
            index, f"@CompletionStatus:{{{redisidx.escape_tag(status)}}} @RatingAvg:[{t} +inf]", I2_FIELDS,
            count=max(len(want), 1)))
        common.same_ids(ctx, want, set(found), lbl)
        ctx.observe(f"{num(n)} truyện, {status} và RatingAvg ≥ {t}: {len(want)} truyện "
                    f"({picks.pct(len(want), n)}); khoảng rating của by_rating có {visited} id.")

    _tipping_point(ctx, LARGEST)


def _tipping_point(ctx: Ctx, n: int) -> None:
    rows = dataset.load_redis(ctx, n)
    prefix = dataset.story_prefix(ctx, n)
    index = common.create_search(ctx, n, "i2tip", ["RatingAvg", "NUMERIC"])
    cap = common.max_search_results(ctx)
    lines = []
    for t, count in picks.thresholds([r["RatingAvg"] for r in rows], picks.TIP_FRACTIONS):
        share = picks.pct(count, n)
        want = {r["StoryId"] for r in rows if r["RatingAvg"] >= t}
        lbl = label(f"tip/zset/{share}", n)
        found = common.run_lua(ctx, lbl, "zrange_fetch", common.manual_key(ctx, n, "by_rating"), str(t), "+inf",
                               prefix, *TIP_FIELDS)
        common.same_ids(ctx, want, {int(x) for x in found}, lbl)
        ctx.metric("match_pct", 100 * count / n, "%", label=lbl, better="none")
        zset_ms = common.p50(ctx, lbl)

        lbl = label(f"tip/search/{share}", n)
        limit = min(count, cap)
        total, found = _search(ctx, lbl, common.search_args(index, f"@RatingAvg:[{t} +inf]", TIP_FIELDS, count=limit))
        ctx.check(total == count, f"{lbl}: FT.SEARCH đếm đúng {count} truyện khớp")
        search_ms = common.p50(ctx, lbl)
        lines.append(f"{share}: ZSET {zset_ms:.2f} ms, FT.SEARCH {search_ms:.2f} ms"
                     + (f" (chỉ trả {cap} dòng đầu: MAXSEARCHRESULTS)" if count > cap else ""))
    ctx.observe(f"Quét tỉ lệ dòng khớp trên {num(n)} truyện: " + "; ".join(lines) + ". Redis không có optimizer: "
                "lệnh luôn đi theo index đã chọn, thời gian tăng theo số dòng khớp, không có điểm chuyển sang quét.")


i2_composite.teardown(_teardown)


# --- I3 sort + paging ------------------------------------------------------------------------------
I3_FIELDS = ("StoryId", "Title", "ChapterCount", "LastChapterAt")
PAGE = 20


@scenario(title="I3 Sắp xếp và phân trang: truyện mới cập nhật (F1), OFFSET so với keyset",
          pair="i3_sort_paging", repeat=10, warmup=2)
def i3_sort_paging(ctx: Ctx):
    """A Sorted set of the listed stories (score = LastChapterAt) read by rank (ZRANGE ... REV) or from the
    last score of the previous page (keyset), vs FT.SEARCH ... SORTBY LastChapterAt DESC LIMIT offset 20."""
    cap = common.max_search_results(ctx)
    for n in SIZES:
        rows = dataset.load_redis(ctx, n)
        common.build_manual(ctx, n, rows, ("public_by_last",))
        prefix = dataset.story_prefix(ctx, n)
        zkey = common.manual_key(ctx, n, "public", "by_last")
        listed = redisidx.newest_first(rows)
        ordered = [r["StoryId"] for r in listed]
        common.manual_memory(ctx, n, "public_by_last", label("zset", n))
        # A NULL LastChapterAt is "" in the Hash: RediSearch cannot index it as NUMERIC and skips the document,
        # which is exactly "has a chapter"; the TAGs keep the public stories.
        index = common.create_search(ctx, n, "i3", ["PublishStatus", "TAG", "IsDeleted", "TAG",
                                                     "LastChapterAt", "NUMERIC", "SORTABLE"], label=label("search", n))
        common.search_memory(ctx, index, label("search", n))
        query = "@PublishStatus:{PUBLISHED} @IsDeleted:{0} @LastChapterAt:[-inf +inf]"
        lines = []
        for p, off in picks.page_offsets(len(ordered), size=PAGE):
            want = ordered[off:off + PAGE]
            lbl = label(f"zset_rank/p{p}", n)
            found = common.run_lua(ctx, lbl, "page_fetch", zkey, "rank", off, "", PAGE, prefix, *I3_FIELDS)
            common.same_order(ctx, want, [int(x) for x in found], lbl)
            rank_ms = common.p50(ctx, lbl)
            text = f"trang {p}%: ZSET theo hạng {rank_ms:.3f} ms"

            if off > 0:
                last = listed[off - 1]
                lbl = label(f"zset_keyset/p{p}", n)
                found = common.run_lua(ctx, lbl, "page_fetch", zkey, "keyset",
                                       repr(float(copies.epoch_ms(last["LastChapterAt"]))),
                                       redisidx.pad(last["StoryId"]), PAGE, prefix, *I3_FIELDS)
                common.same_order(ctx, want, [int(x) for x in found], lbl)
                text += f", keyset {common.p50(ctx, lbl):.3f} ms"

            lbl = label(f"search_sortby/p{p}", n)
            if off + PAGE > cap:
                text += f", FT.SEARCH không lấy được (offset + 20 > MAXSEARCHRESULTS = {cap})"
                ctx.metric("unreachable", 1, "trang", label=lbl, note="LIMIT vượt MAXSEARCHRESULTS")
            else:
                total, found = _search(ctx, lbl, common.search_args(index, query, I3_FIELDS, offset=off, count=PAGE,
                                                                    sortby="LastChapterAt DESC"))
                ctx.check(total == len(ordered), f"{lbl}: FT.SEARCH thấy đúng {len(ordered)} truyện trong danh sách")
                # SORTBY has a single key: rows with the same LastChapterAt may come in another order.
                common.same_ids(ctx, set(want), set(found), lbl)
                text += f", FT.SEARCH {common.p50(ctx, lbl):.3f} ms"
            lines.append(text)
        ctx.observe(f"{num(n)} truyện, {num(len(ordered))} truyện trong danh sách: " + "; ".join(lines) + ".")


i3_sort_paging.teardown(_teardown)


# --- I4 filtered index -----------------------------------------------------------------------------
PUBLIC_FILTER = "@PublishStatus=='PUBLISHED' && @IsDeleted=='0'"


@scenario(title="I4 Filtered index: index chỉ chứa truyện công khai (IX_Story_Public_LastChapter của web)",
          pair="i4_filtered", repeat=10, warmup=2)
def i4_filtered(ctx: Ctx):
    """Page 1 of the F1 list: a Sorted set of ALL stories checked one by one (unfiltered index + residual
    predicate) vs a Sorted set of the listed stories only (the application keeps it: ZADD on publish, ZREM on
    hide) vs RediSearch with the status as TAGs vs RediSearch with FT.CREATE ... FILTER (a filtered index)."""
    for n in SIZES:
        rows = dataset.load_redis(ctx, n)
        common.build_manual(ctx, n, rows, ("by_last", "public_by_last"))
        prefix = dataset.story_prefix(ctx, n)
        listed = redisidx.newest_first(rows)
        want = [r["StoryId"] for r in listed][:PAGE]
        public = sum(1 for r in rows if copies.is_public(r))
        lines = []

        lbl = label("zset_all_filter", n)
        looked, found = common.run_lua(ctx, lbl, "zset_filter_page", common.manual_key(ctx, n, "by_last"), PAGE,
                                       prefix, *I3_FIELDS)
        common.same_order(ctx, want, [int(x) for x in found], lbl)
        ctx.metric("rows_read", looked, "dòng", label=lbl, note="số truyện phải xem để có 20 truyện công khai")
        all_mb = common.manual_memory(ctx, n, "by_last", lbl) / 1024 / 1024
        lines.append(f"ZSET mọi truyện + kiểm tra trạng thái: xem {looked} truyện, {common.p50(ctx, lbl):.3f} ms, "
                     f"{all_mb:.2f} MB")

        lbl = label("zset_public", n)
        found = common.run_lua(ctx, lbl, "page_fetch", common.manual_key(ctx, n, "public", "by_last"), "rank", 0, "",
                               PAGE, prefix, *I3_FIELDS)
        common.same_order(ctx, want, [int(x) for x in found], lbl)
        public_mb = common.manual_memory(ctx, n, "public_by_last", lbl) / 1024 / 1024
        lines.append(f"ZSET chỉ truyện công khai: {common.p50(ctx, lbl):.3f} ms, {public_mb:.2f} MB")
        ctx.check(public_mb < all_mb, f"{num(n)}: ZSET chỉ chứa truyện công khai nhỏ hơn ZSET mọi truyện")

        docs = {}
        for variant, schema, flt, query in (
                ("search_tags", ["PublishStatus", "TAG", "IsDeleted", "TAG", "LastChapterAt", "NUMERIC", "SORTABLE"],
                 None, "@PublishStatus:{PUBLISHED} @IsDeleted:{0} @LastChapterAt:[-inf +inf]"),
                ("search_filter", ["LastChapterAt", "NUMERIC", "SORTABLE"], PUBLIC_FILTER,
                 "@LastChapterAt:[-inf +inf]")):
            lbl = label(variant, n)
            index = common.create_search(ctx, n, f"i4_{variant}", schema, filter=flt, label=lbl)
            mb = common.search_memory(ctx, index, lbl)
            info = common.search_info(ctx, index)
            docs[variant] = (int(info.get("num_docs", 0)), mb)
            total, found = _search(ctx, lbl, common.search_args(index, query, I3_FIELDS, count=PAGE,
                                                                sortby="LastChapterAt DESC"))
            common.same_ids(ctx, set(want), set(found), lbl)
            ctx.check(total == len(listed), f"{lbl}: thấy đúng {len(listed)} truyện trong danh sách")
            lines.append(f"{variant}: index {docs[variant][0]} document, {mb:.2f} MB, {common.p50(ctx, lbl):.3f} ms")
            common.drop_search(ctx, index)
        ctx.check(docs["search_filter"][0] < docs["search_tags"][0],
                  f"{num(n)}: index có FILTER chỉ chứa truyện công khai (ít document hơn index không FILTER)")
        ctx.observe(f"{num(n)} truyện, {num(public)} công khai, {num(len(listed))} trong danh sách: "
                    + "; ".join(lines) + ".")


i4_filtered.teardown(_teardown)


# --- I5 full-text search ---------------------------------------------------------------------------
I5_FIELDS = ("StoryId", "Title")
NO_STOPWORDS = ("STOPWORDS", "0")      # folded Vietnamese words can be English stopwords ("thế" -> "the")


def _score(ctx: Ctx, lbl: str, found: set[int], expected: set[int]) -> tuple[float, float]:
    recall, precision = textsearch.recall_precision(found, expected)
    ctx.metric("results", len(found), "truyện", label=lbl, better="none")
    ctx.metric("recall_pct", 100 * recall, "%", label=lbl, better="higher",
               note="phần truyện cần tìm (có từ bắt đầu bằng từ khoá, bỏ dấu) mà biến thể tìm thấy")
    ctx.metric("precision_pct", 100 * precision, "%", label=lbl, better="higher",
               note="phần kết quả đúng là truyện cần tìm")
    return recall, precision


def _add_search_text(ctx: Ctx, n: int, rows: list[dict]) -> int:
    """HSET SearchText (folded Title + Description) on every story of size n; returns the bytes added."""
    added = 0
    for i in range(0, len(rows), dataset.REDIS_BATCH):
        pipe = ctx.redis.pipeline(transaction=False)
        for row in rows[i:i + dataset.REDIS_BATCH]:
            text = textsearch.search_text(row)
            added += len(text.encode("utf-8"))
            pipe.hset(dataset.story_key(ctx, n, row["StoryId"]), "SearchText", text)
        pipe.execute()
    return added


def _drop_search_text(ctx: Ctx) -> None:
    for n in SIZES:
        for start in range(1, n + 1, dataset.REDIS_BATCH):
            pipe = ctx.redis.pipeline(transaction=False)
            for story_id in range(start, min(n, start + dataset.REDIS_BATCH - 1) + 1):
                pipe.hdel(dataset.story_key(ctx, n, story_id), "SearchText")
            pipe.execute()


@scenario(title="I5 Tìm kiếm toàn văn (F2 ô tìm kiếm): quét chuỗi so với RediSearch",
          pair="i5_fulltext", repeat=10, warmup=2)
def i5_fulltext(ctx: Ctx):
    """Same keywords as the SQL side: SCAN + string.find in Lua, FT.SEARCH 'w*' on Title / Description, and
    FT.SEARCH on an extra field holding the text without diacritics (written by the application). Each result
    is scored against the reference. Then: is a new story found by the very next search?"""
    base, _ = dataset.source(ctx)
    terms = textsearch.choose_terms(base)
    cap = common.max_search_results(ctx)
    ctx.observe(f"Từ khoá (chọn từ dữ liệu, giống phía SQL): phổ biến '{terms['common']}', gõ không dấu "
                f"'{terms['unaccented']}', hiếm '{terms['rare']}'.")
    for n in SIZES:
        rows = dataset.load_redis(ctx, n)
        prefix = dataset.story_prefix(ctx, n)
        expected = {kind: textsearch.reference(rows, term) for kind, term in terms.items()}
        added = _add_search_text(ctx, n, rows)
        ctx.metric("searchtext_mb", added / 1024 / 1024, "MB", label=label("search_unaccented", n),
                   note="dữ liệu thêm vào Hash: bản bỏ dấu của Title + Description")
        lines = []

        for kind, term in terms.items():
            lbl = label(f"scan/{kind}", n)
            keyspace, found = common.run_lua(ctx, lbl, "scan_text", prefix + "*", term)
            ctx.metric("keyspace", keyspace, "key", label=lbl, better="none")
            found = {int(x) for x in found}
            r, p = _score(ctx, lbl, found, expected[kind])
            lines.append(f"scan '{term}': {len(found)} truyện, recall {r:.0%}, precision {p:.0%}, "
                         f"{common.p50(ctx, lbl):.1f} ms")

        plain = common.create_search(ctx, n, "i5", ["Title", "TEXT", "NOSTEM", "Description", "TEXT", "NOSTEM"],
                                     label=label("search", n), options=NO_STOPWORDS)
        ascii_ = common.create_search(ctx, n, "i5ascii", ["SearchText", "TEXT", "NOSTEM"],
                                      label=label("search_unaccented", n), options=NO_STOPWORDS)
        lines.append(f"index: {common.search_memory(ctx, plain, label('search', n)):.2f} MB có dấu, "
                     f"{common.search_memory(ctx, ascii_, label('search_unaccented', n)):.2f} MB bỏ dấu")
        for kind, term in terms.items():
            for variant, index, query in (("search", plain, f"{term}*"),
                                          ("search_unaccented", ascii_, f"{textsearch.fold(term)}*")):
                lbl = label(f"{variant}/{kind}", n)
                total, found = _search(ctx, lbl, common.search_args(index, query, I5_FIELDS,
                                                                    count=min(cap, max(1, len(rows)))))
                r, p = _score(ctx, lbl, set(found), expected[kind])
                ctx.metric("total", total, "truyện", label=lbl, better="none")
                lines.append(f"{variant} '{query}': {total} truyện, recall {r:.0%}, precision {p:.0%}, "
                             f"{common.p50(ctx, lbl):.3f} ms")
                if variant == "search" and kind == "common":
                    ctx.check(total > 0, f"{lbl}: RediSearch tìm được từ phổ biến có dấu")
                if variant == "search_unaccented" and total <= cap:
                    ctx.check(r >= 0.99, f"{lbl}: field bỏ dấu tìm được (gần) đủ truyện cần tìm")
        if n == LARGEST:
            _search_freshness(ctx, n, rows[0], plain)
        common.drop_search(ctx, plain)
        common.drop_search(ctx, ascii_)
        ctx.observe(f"{num(n)} truyện (cần tìm: {len(expected['common'])} / {len(expected['unaccented'])} / "
                    f"{len(expected['rare'])}): " + "; ".join(lines) + ".")


def _search_freshness(ctx: Ctx, n: int, template: dict, index: str) -> None:
    """HSET a new story with a new word, then search for it right away (RediSearch indexes inside HSET)."""
    word = "labfresh" + "".join(secrets.choice("bcdfghjklmnpqrstvwxz") for _ in range(8))
    key = dataset.story_key(ctx, n, n + 1)
    row = dict(template, StoryId=n + 1, Title=f"{word} mới")
    lbl = label("search/freshness", n)
    try:
        started = time.perf_counter()
        ctx.redis.hset(key, mapping=copies.to_hash(row))
        total, found = common.search_ids(ctx, common.search_args(index, word, I5_FIELDS, count=10))
        elapsed = time.perf_counter() - started
    finally:
        ctx.redis.delete(key)
    ok = (n + 1) in found
    ctx.metric("freshness_ms", 1000 * elapsed, "ms", label=lbl,
               note="HSET rồi FT.SEARCH ngay lần đầu (đo ở client, gồm 2 vòng mạng tới Redis)")
    ctx.metric("polls", 1, "lần", label=lbl)
    ctx.check(ok, f"{lbl}: truyện vừa HSET tìm thấy ngay ở lần FT.SEARCH đầu tiên")
    ctx.observe(f"Độ tươi của RediSearch ({num(n)} truyện): truyện vừa HSET "
                + ("tìm thấy ngay ở lần tìm đầu tiên" if ok else "KHÔNG thấy ở lần tìm đầu tiên")
                + f" ({1000 * elapsed:.1f} ms gồm cả mạng): index được cập nhật ngay trong lệnh HSET.")


def _i5_teardown(ctx: Ctx) -> None:
    dataset.drop_search_indexes(ctx)
    _drop_search_text(ctx)


i5_fulltext.teardown(_i5_teardown)


# --- I7 write cost and size --------------------------------------------------------------------------
I7_OPS = ("insert", "update_rating", "update_views", "update_description")
INSERT_BASE = 100_000          # inserted stories get ids n + INSERT_BASE + 1, ... (never a real story)


def _i7_ops(ctx: Ctx, n: int, story: dict, kinds: tuple[str, ...], inserted: list[int]) -> dict:
    """The four writes as callables for bench_redis. `kinds` = the application-kept structures to keep in step
    (empty for "hash only" and for the RediSearch variants, where the module indexes inside HSET). Writes that
    touch a structure are wrapped in MULTI / EXEC, as an application would do to keep them consistent.
    Returns {op: (fn, commands per call)}."""
    key = dataset.story_key(ctx, n, story["StoryId"])
    member = redisidx.pad(story["StoryId"])
    state = {"rating": story["RatingAvg"], "first": "#", "next_id": n + INSERT_BASE + len(inserted)}
    rating_kinds = [k for k in kinds if k in redisidx.RATING_KINDS]
    view_kinds = [k for k in kinds if k in redisidx.VIEW_KINDS]
    insert_count = 1 + len(redisidx.entries(story, kinds)) + (1 if kinds else 0)

    def insert(r):
        state["next_id"] += 1
        sid = state["next_id"]
        inserted.append(sid)
        row = dict(story, StoryId=sid, Slug=f"{story['Slug']}--ins{sid}")
        p = r.pipeline(transaction=bool(kinds))
        p.hset(dataset.story_key(ctx, n, sid), mapping=copies.to_hash(row))
        for e in redisidx.entries(row, kinds):
            p.execute_command(*redisidx.command_args(e, common.manual_key(ctx, n, *e.key)))
        p.execute()

    def update_rating(r):
        state["rating"] = redisidx.next_rating(state["rating"])
        value = str(state["rating"])
        p = r.pipeline(transaction=bool(rating_kinds))
        p.hset(key, "RatingAvg", value)
        for k in rating_kinds:
            parts = ("by_rating",) if k == "by_rating" else ("by_rating", story["CompletionStatus"])
            p.zadd(common.manual_key(ctx, n, *parts), {member: float(value)})
        p.execute()

    def update_views(r):
        p = r.pipeline(transaction=bool(view_kinds))
        p.hincrby(key, "ViewCount", 1)
        for _ in view_kinds:
            p.zincrby(common.manual_key(ctx, n, "by_view"), 1, member)
        p.execute()

    def update_description(r):
        state["first"] = "@" if state["first"] == "#" else "#"
        r.hset(key, "Description", state["first"] + (story["Description"] or "")[1:])

    return {"insert": (insert, insert_count),
            "update_rating": (update_rating, 1 + len(rating_kinds) + (1 if rating_kinds else 0)),
            "update_views": (update_views, 1 + len(view_kinds) + (1 if view_kinds else 0)),
            "update_description": (update_description, 1)}


@scenario(title="I7 Chi phí của index: dung lượng và thời gian ghi khi có 0 / 1 / 3 / 6 index",
          pair="i7_write_cost", repeat=10, warmup=2)
def i7_write_cost(ctx: Ctx):
    """Memory of the application-kept structures and of RediSearch indexes with 1 / 3 / 6 fields at 1k / 10k /
    50k, then, on 50k, the server time of the same four writes as the SQL side: HSET alone, HSET + the
    structures of 1 / 3 / 6 "indexes" in MULTI, and HSET with a RediSearch index of 1 / 3 / 6 fields."""
    for n in SIZES:
        rows = dataset.load_redis(ctx, n)
        common.build_manual(ctx, n, rows, redisidx.KINDS)
        data_mb = redis_probe.namespace_memory(ctx.redis, f"s{n}:story:*")["memory_bytes"] / 1024 / 1024
        ctx.metric("data_mb", data_mb, "MB", label=label("table", n), better="none",
                   note="tổng MEMORY USAGE của các Hash story")
        kind_mb = {k: common.manual_memory(ctx, n, k, label(f"index/{k}", n)) / 1024 / 1024
                   for k in redisidx.SET_KINDS[6]}
        manual, search = {}, {}
        for k in (1, 3, 6):
            manual[k] = sum(kind_mb[kind] for kind in redisidx.SET_KINDS[k])
            ctx.metric("indexes_mb", manual[k], "MB", label=label(f"manual_{k}", n),
                       note="tổng MEMORY USAGE của các cấu trúc phụ do ứng dụng giữ")
            index = common.create_search(ctx, n, f"i7_{k}", redisidx.SET_SCHEMA[k], label=label(f"search_{k}", n))
            search[k] = common.search_memory(ctx, index, label(f"search_{k}", n))
            ctx.metric("indexes_mb", search[k], "MB", label=label(f"search_{k}", n), note="FT.INFO")
            common.drop_search(ctx, index)
        ctx.check(manual[6] > manual[1] > 0, f"{num(n)}: thêm cấu trúc phụ thì tốn thêm bộ nhớ")
        ctx.check(search[6] > search[1] > 0, f"{num(n)}: index RediSearch nhiều field hơn thì tốn thêm bộ nhớ")
        ctx.observe(f"{num(n)} truyện: Hash {data_mb:.1f} MB; " + "; ".join(
            f"{k} {mb:.2f} MB" for k, mb in kind_mb.items())
            + f"; tự quản lý 1 / 3 / 6 = {manual[1]:.2f} / {manual[3]:.2f} / {manual[6]:.2f} MB; RediSearch 1 / 3 / 6 "
              f"field = {search[1]:.2f} / {search[3]:.2f} / {search[6]:.2f} MB.")

    n = LARGEST
    rows = dataset.load_redis(ctx, n)
    story = picks.write_target(rows)
    inserted: list[int] = []
    times: dict[tuple[str, str], float] = {}
    variants = [(f"manual_{k}", redisidx.SET_KINDS[k], None) for k in (0, 1, 3, 6)] + \
               [(f"search_{k}", (), k) for k in (1, 3, 6)]
    for variant, kinds, schema_k in variants:
        index = (common.create_search(ctx, n, f"i7w_{schema_k}", redisidx.SET_SCHEMA[schema_k])
                 if schema_k else None)
        try:
            for op, (fn, commands) in _i7_ops(ctx, n, story, kinds, inserted).items():
                lbl = label(f"{op}/{variant}", n)
                times[(op, variant)] = ctx.bench_redis(lbl, fn).p50
                ctx.metric("commands", commands, "lệnh", label=lbl, note="số lệnh gửi cho mỗi lần ghi (gồm MULTI)")
        finally:
            if index:
                common.drop_search(ctx, index)
            for start in range(0, len(inserted), 500):
                ctx.redis.delete(*(dataset.story_key(ctx, n, sid) for sid in inserted[start:start + 500]))
            inserted.clear()

    names = [v for v, _, _ in variants]
    for op in I7_OPS:
        ctx.observe(f"{op} (truyện {story['StoryId']}, {num(n)} truyện): "
                    + "; ".join(f"{v} {1000 * times[(op, v)]:.1f} µs" for v in names) + ".")
    ctx.check(times[("insert", "search_6")] > times[("insert", "manual_0")],
              "insert: RediSearch index ngay trong HSET nên HSET chậm hơn khi không có index")
    ctx.check(times[("insert", "manual_6")] > times[("insert", "manual_0")],
              "insert: giữ 6 cấu trúc phụ trong MULTI tốn thêm lệnh và thời gian")


i7_write_cost.teardown(_teardown)
