"""Redis side of indexing (dataset, I1-I5, I7), on lab:indexing:s<n>:story:<id>, n = 100 / 1.000.

Redis has no secondary index of its own: a Hash is found only by its key. For the same query as the SQL side,
each scenario compares:
  scan       SCAN the keyspace and test every Hash (Lua): the "no index" baseline
  manual_*   Sets / Sorted sets the application writes next to every Hash (redisidx, common.build_manual)
  search_*   a RediSearch index over the Hashes (FT.CREATE ... PREFIX lab:indexing:s<n>:story:)
Each scenario ends with ONE check: every variant returned the expected stories (I1-I5), or, for I7, that the
application-kept index is still in step with the Hash after the writes.

Keys live in lab:indexing:* (deleted by the runner); RediSearch indexes (lab:indexing:idx:*) are dropped in each
scenario's teardown, and I5 removes the SearchText field it adds.
"""
from lab.framework import Ctx, scenario

from . import common, copies, dataset, picks, redisidx, textsearch
from .copies import label, num
from .dataset import SIZES

LARGEST = SIZES[-1]
PAGE = 20


def _teardown(ctx: Ctx) -> None:
    dataset.drop_search_indexes(ctx)


def _scan(ctx: Ctx, lbl: str, n: int, *conditions: str) -> set[int]:
    """Timed lua/scan_filter.lua; returns the matching ids."""
    keyspace, _, found = common.run_lua(ctx, lbl, "scan_filter", dataset.story_prefix(ctx, n) + "*", "ids",
                                        *conditions)
    ctx.metric("keyspace", keyspace, "key", label=lbl, better="none",
               note="DBSIZE: SCAN duyệt mọi key của database, không chỉ key khớp MATCH")
    return {int(x) for x in found}


def _search(ctx: Ctx, lbl: str, args: list) -> tuple[int, list[int]]:
    """Timed FT.SEARCH; returns (total, ids of the returned page)."""
    ctx.bench_redis(lbl, lambda r: r.execute_command(*args))
    return common.search_ids(ctx, args)


# --- dataset ---------------------------------------------------------------------------------------
@scenario(title="Dữ liệu thí nghiệm: Story 100 / 1.000 dòng và điều kiện của Redis", pair="dataset",
          repeat=1, warmup=0)
def dataset_story(ctx: Ctx):
    """Loads lab:indexing:s<n>:story:<id> for every size and checks it against the copy rules."""
    search = dataset.search_module(ctx)
    ctx.observe(f"Redis {ctx.redis.info('server').get('redis_version')}; RediSearch: {search or 'KHÔNG có'}.")
    dataset.drop_search_indexes(ctx)
    ok = search is not None
    for n in SIZES:
        generated = dataset.load_redis(ctx, n)
        keys = dataset.count_story_keys(ctx, n)
        samples = (generated[0], generated[len(generated) // 2], generated[-1])
        ok &= keys == n and all(ctx.redis.hgetall(dataset.story_key(ctx, n, r["StoryId"])) == copies.to_hash(r)
                                for r in samples)
        ctx.metric("rows", keys, "dòng", label=label("Story", n), better="none")
    ctx.check(ok, "có RediSearch, và đúng 100 / 1.000 Hash story theo quy tắc nhân bản")


# --- I1 single-column lookup -----------------------------------------------------------------------
I1_FIELDS = ("StoryId", "Title", "Slug", "CompletionStatus", "ChapterCount", "RatingAvg")


@scenario(title="I1 Tra cứu theo một cột: mở truyện theo Slug, truyện của một tác giả",
          pair="i1_single_column", repeat=10, warmup=2)
def i1_single_column(ctx: Ctx):
    """SCAN vs an index kept by the application (String slug -> id, Set of an author's ids) vs RediSearch TAG."""
    fetch = common.lua_source("fetch_members")
    ok = True
    for n in SIZES:
        rows = dataset.load_redis(ctx, n)
        common.build_manual(ctx, n, rows, ("slug", "author"))
        prefix = dataset.story_prefix(ctx, n)
        index = common.create_search(ctx, n, "i1", ["Slug", "TAG", "AuthorId", "TAG"], label=label("search_tag", n))
        target = picks.middle_row(rows)
        author, _ = picks.median_author(rows)
        slug_key = common.manual_key(ctx, n, "slug", target["Slug"])
        author_key = common.manual_key(ctx, n, "author", author)
        cases = {
            "slug": ({target["StoryId"]}, ("Slug", "eq", target["Slug"]),
                     lambda r: r.hmget(prefix + str(r.get(slug_key)), I1_FIELDS),
                     lambda: {int(ctx.redis.get(slug_key))},
                     f"@Slug:{{{redisidx.escape_tag(target['Slug'])}}}"),
            "author": ({r["StoryId"] for r in rows if r["AuthorId"] == author}, ("AuthorId", "eq", str(author)),
                       lambda r: r.eval(fetch, 0, prefix, len(I1_FIELDS), *I1_FIELDS, *r.smembers(author_key)),
                       lambda: {int(x) for x in ctx.redis.eval(fetch, 0, prefix, len(I1_FIELDS), *I1_FIELDS,
                                                                *ctx.redis.smembers(author_key))},
                       f"@AuthorId:{{{author}}}"),
        }
        for qname, (want, condition, manual_fn, manual_ids, query) in cases.items():
            lbl = label(f"{qname}/scan", n)
            ok &= common.equal_sets(ctx, want, _scan(ctx, lbl, n, *condition), lbl)
            lbl = label(f"{qname}/manual_index", n)
            ctx.bench_redis(lbl, manual_fn)
            ok &= common.equal_sets(ctx, want, manual_ids(), lbl)
            lbl = label(f"{qname}/search_tag", n)
            _, found = _search(ctx, lbl, common.search_args(index, query, I1_FIELDS, count=n))
            ok &= common.equal_sets(ctx, want, set(found), lbl)
            ctx.observe(f"{qname} · {num(n)} truyện: SCAN {common.p50(ctx, label(f'{qname}/scan', n)):.3f} ms, "
                        f"index tự quản lý {common.p50(ctx, label(f'{qname}/manual_index', n)):.3f} ms, "
                        f"RediSearch {common.p50(ctx, lbl):.3f} ms.")
    ctx.check(ok, "I1: SCAN, index tự quản lý và RediSearch đều trả đúng truyện cần tìm")


i1_single_column.teardown(_teardown)


# --- I2 composite ----------------------------------------------------------------------------------
I2_FIELDS = ("StoryId", "Title", "RatingAvg", "ChapterCount")


@scenario(title="I2 Index nhiều cột: composite và covering index (bộ lọc trạng thái + rating)",
          pair="i2_composite", repeat=10, warmup=2)
def i2_composite(ctx: Ctx):
    """CompletionStatus = ? AND RatingAvg >= ?: SCAN, one Sorted set per status (key = equality column, score =
    range column: the Redis shape of a composite index), RediSearch TAG + NUMERIC."""
    ok = True
    for n in SIZES:
        rows = dataset.load_redis(ctx, n)
        common.build_manual(ctx, n, rows, ("by_rating_status",))
        prefix = dataset.story_prefix(ctx, n)
        index = common.create_search(ctx, n, "i2", ["CompletionStatus", "TAG", "RatingAvg", "NUMERIC"],
                                     label=label("search", n))
        status, t, want = picks.catalog_filter(rows)

        lbl = label("scan", n)
        ok &= common.equal_sets(ctx, want, _scan(ctx, lbl, n, "CompletionStatus", "eq", status,
                                                 "RatingAvg", "ge", str(t)), lbl)
        lbl = label("zset_per_status", n)
        found = common.run_lua(ctx, lbl, "zrange_fetch", common.manual_key(ctx, n, "by_rating", status), str(t),
                               "+inf", prefix, *I2_FIELDS)
        ok &= common.equal_sets(ctx, want, {int(x) for x in found}, lbl)
        lbl = label("search", n)
        _, found = _search(ctx, lbl, common.search_args(
            index, f"@CompletionStatus:{{{redisidx.escape_tag(status)}}} @RatingAvg:[{t} +inf]", I2_FIELDS,
            count=max(1, len(want))))
        ok &= common.equal_sets(ctx, want, set(found), lbl)
        ctx.observe(f"{num(n)} truyện, {status} và RatingAvg ≥ {t}: {len(want)} truyện. SCAN "
                    f"{common.p50(ctx, label('scan', n)):.3f} ms, ZSET theo trạng thái "
                    f"{common.p50(ctx, label('zset_per_status', n)):.3f} ms, RediSearch {common.p50(ctx, lbl):.3f} ms.")
    ctx.check(ok, "I2: SCAN, ZSET theo trạng thái và RediSearch đều trả đúng tập truyện của bộ lọc")


i2_composite.teardown(_teardown)


# --- I3 sort + paging ------------------------------------------------------------------------------
I3_FIELDS = ("StoryId", "Title", "ChapterCount", "LastChapterAt")
LISTED_QUERY = "@PublishStatus:{PUBLISHED} @IsDeleted:{0} @LastChapterAt:[-inf +inf]"
LISTED_SCHEMA = ["PublishStatus", "TAG", "IsDeleted", "TAG", "LastChapterAt", "NUMERIC", "SORTABLE"]


@scenario(title="I3 Sắp xếp và phân trang: truyện mới cập nhật, OFFSET so với keyset",
          pair="i3_sort_paging", repeat=10, warmup=2)
def i3_sort_paging(ctx: Ctx):
    """A Sorted set of the listed stories (score = LastChapterAt) read by rank or from the last row of the
    previous page (keyset), vs FT.SEARCH ... SORTBY LastChapterAt DESC LIMIT offset 20."""
    ok = True
    for n in SIZES:
        rows = dataset.load_redis(ctx, n)
        common.build_manual(ctx, n, rows, ("public_by_last",))
        prefix = dataset.story_prefix(ctx, n)
        zkey = common.manual_key(ctx, n, "public", "by_last")
        listed = redisidx.newest_first(rows)
        ordered = [r["StoryId"] for r in listed]
        index = common.create_search(ctx, n, "i3", LISTED_SCHEMA, label=label("search", n))
        lines = []
        for p, off in picks.page_offsets(len(ordered), (0, 50), PAGE):
            want = ordered[off:off + PAGE]
            lbl = label(f"zset_rank/p{p}", n)
            found = common.run_lua(ctx, lbl, "page_fetch", zkey, "rank", off, "", PAGE, prefix, *I3_FIELDS)
            ok &= common.equal_lists(ctx, want, [int(x) for x in found], lbl)
            text = f"trang {p}%: ZSET theo hạng {common.p50(ctx, lbl):.3f} ms"
            if off > 0:
                last = listed[off - 1]
                lbl = label(f"zset_keyset/p{p}", n)
                found = common.run_lua(ctx, lbl, "page_fetch", zkey, "keyset",
                                       repr(float(copies.epoch_ms(last["LastChapterAt"]))),
                                       redisidx.pad(last["StoryId"]), PAGE, prefix, *I3_FIELDS)
                ok &= common.equal_lists(ctx, want, [int(x) for x in found], lbl)
                text += f", keyset {common.p50(ctx, lbl):.3f} ms"
            lbl = label(f"search_sortby/p{p}", n)
            _, found = _search(ctx, lbl, common.search_args(index, LISTED_QUERY, I3_FIELDS, offset=off, count=PAGE,
                                                            sortby="LastChapterAt DESC"))
            ok &= common.equal_sets(ctx, set(want), set(found), lbl)    # one sort key: ties may swap
            lines.append(text + f", FT.SEARCH {common.p50(ctx, lbl):.3f} ms")
        ctx.observe(f"{num(n)} truyện, {len(ordered)} trong danh sách: " + "; ".join(lines) + ".")
    ctx.check(ok, "I3: mọi trang đúng 20 truyện (ZSET đúng cả thứ tự) ở mọi biến thể")


i3_sort_paging.teardown(_teardown)


# --- I4 filtered index -----------------------------------------------------------------------------
PUBLIC_FILTER = "@PublishStatus=='PUBLISHED' && @IsDeleted=='0'"


@scenario(title="I4 Filtered index: index chỉ chứa truyện công khai", pair="i4_filtered", repeat=10, warmup=2)
def i4_filtered(ctx: Ctx):
    """Page 1 of the list: a Sorted set of ALL stories checked one by one vs a Sorted set of the listed stories
    only vs RediSearch with FT.CREATE ... FILTER (the Redis form of a filtered index)."""
    ok = True
    for n in SIZES:
        rows = dataset.load_redis(ctx, n)
        common.build_manual(ctx, n, rows, ("by_last", "public_by_last"))
        prefix = dataset.story_prefix(ctx, n)
        want = [r["StoryId"] for r in redisidx.newest_first(rows)][:PAGE]

        lbl = label("zset_all_filter", n)
        looked, found = common.run_lua(ctx, lbl, "zset_filter_page", common.manual_key(ctx, n, "by_last"), PAGE,
                                       prefix, *I3_FIELDS)
        ok &= common.equal_lists(ctx, want, [int(x) for x in found], lbl)
        all_mb = common.manual_memory(ctx, n, "by_last", lbl) / 1024 / 1024

        lbl = label("zset_public", n)
        found = common.run_lua(ctx, lbl, "page_fetch", common.manual_key(ctx, n, "public", "by_last"), "rank", 0, "",
                               PAGE, prefix, *I3_FIELDS)
        ok &= common.equal_lists(ctx, want, [int(x) for x in found], lbl)
        public_mb = common.manual_memory(ctx, n, "public_by_last", lbl) / 1024 / 1024

        lbl = label("search_filter", n)
        index = common.create_search(ctx, n, "i4", ["LastChapterAt", "NUMERIC", "SORTABLE"], filter=PUBLIC_FILTER,
                                     label=lbl)
        filter_mb = common.search_memory(ctx, index, lbl)
        _, found = _search(ctx, lbl, common.search_args(index, "@LastChapterAt:[-inf +inf]", I3_FIELDS, count=PAGE,
                                                        sortby="LastChapterAt DESC"))
        ok &= common.equal_sets(ctx, set(want), set(found), lbl)
        ctx.observe(f"{num(n)} truyện: ZSET mọi truyện xem {looked} truyện, {all_mb:.3f} MB; ZSET công khai "
                    f"{public_mb:.3f} MB; RediSearch FILTER {filter_mb:.3f} MB.")
    ctx.check(ok, "I4: ZSET mọi truyện, ZSET công khai và RediSearch FILTER cho cùng trang 1")


i4_filtered.teardown(_teardown)


# --- I5 full-text search ---------------------------------------------------------------------------
I5_FIELDS = ("StoryId", "Title")
NO_STOPWORDS = ("STOPWORDS", "0")      # folded Vietnamese words can be English stopwords ("thế" -> "the")


def _score(ctx: Ctx, lbl: str, found: set[int], expected: set[int]) -> float:
    recall, precision = textsearch.recall_precision(found, expected)
    ctx.metric("results", len(found), "truyện", label=lbl, better="none")
    ctx.metric("recall_pct", 100 * recall, "%", label=lbl, better="higher")
    ctx.metric("precision_pct", 100 * precision, "%", label=lbl, better="higher")
    return recall


def _set_search_text(ctx: Ctx, n: int, rows: list[dict], add: bool) -> None:
    """HSET (or HDEL) SearchText = Title + Description without diacritics, on every story of size n."""
    pipe = ctx.redis.pipeline(transaction=False)
    for row in rows:
        key = dataset.story_key(ctx, n, row["StoryId"])
        if add:
            pipe.hset(key, "SearchText", textsearch.search_text(row))
        else:
            pipe.hdel(key, "SearchText")
    pipe.execute()


@scenario(title="I5 Tìm kiếm toàn văn: quét chuỗi so với RediSearch", pair="i5_fulltext", repeat=10, warmup=2)
def i5_fulltext(ctx: Ctx):
    """Same keywords as the SQL side: SCAN + string.find, FT.SEARCH 'w*' on Title / Description, and FT.SEARCH on a
    field holding the text without diacritics (written by the application)."""
    base, _ = dataset.source(ctx)
    terms = textsearch.choose_terms(base)
    terms = {"common": terms["common"], "unaccented": terms["unaccented"]}
    ok = True
    for n in SIZES:
        rows = dataset.load_redis(ctx, n)
        prefix = dataset.story_prefix(ctx, n)
        _set_search_text(ctx, n, rows, add=True)
        plain = common.create_search(ctx, n, "i5", ["Title", "TEXT", "NOSTEM", "Description", "TEXT", "NOSTEM"],
                                     label=label("search", n), options=NO_STOPWORDS)
        folded = common.create_search(ctx, n, "i5ascii", ["SearchText", "TEXT", "NOSTEM"],
                                      label=label("search_unaccented", n), options=NO_STOPWORDS)
        lines = []
        for kind, term in terms.items():
            expected = textsearch.reference(rows, term)
            lbl = label(f"scan/{kind}", n)
            _, found = common.run_lua(ctx, lbl, "scan_text", prefix + "*", term)
            recall = _score(ctx, lbl, {int(x) for x in found}, expected)
            text = f"'{term}': scan recall {recall:.0%}"
            for variant, index, query in (("search", plain, f"{term}*"),
                                          ("search_unaccented", folded, f"{textsearch.fold(term)}*")):
                lbl = label(f"{variant}/{kind}", n)
                _, found = _search(ctx, lbl, common.search_args(index, query, I5_FIELDS, count=n))
                recall = _score(ctx, lbl, set(found), expected)
                if variant == "search_unaccented":
                    ok &= recall == 1.0
                text += f", {variant} recall {recall:.0%} ({common.p50(ctx, lbl):.3f} ms)"
            lines.append(text)
        ctx.observe(f"{num(n)} truyện: " + "; ".join(lines) + ".")
    ctx.check(ok, "I5: field bỏ dấu + RediSearch tìm thấy mọi truyện cần tìm, gõ có dấu hay không dấu")


def _i5_teardown(ctx: Ctx) -> None:
    dataset.drop_search_indexes(ctx)
    for n in SIZES:
        _set_search_text(ctx, n, [{"StoryId": i} for i in range(1, n + 1)], add=False)


i5_fulltext.teardown(_i5_teardown)


# --- I7 write cost ----------------------------------------------------------------------------------
INSERT_BASE = 100_000          # inserted stories get ids n + INSERT_BASE + 1, ... (never a real story)
I7_KINDS = redisidx.SET_KINDS[3]          # by_rating, author, slug: the 3 indexes of the SQL side


def _i7_ops(ctx: Ctx, n: int, story: dict, kinds: tuple[str, ...], inserted: list[int]) -> dict:
    """INSERT and UPDATE RatingAvg as callables for bench_redis. `kinds` = the application-kept structures to keep
    in step (wrapped in MULTI / EXEC with the HSET); empty for "Hash only" and for the RediSearch variant."""
    key = dataset.story_key(ctx, n, story["StoryId"])
    member = redisidx.pad(story["StoryId"])
    state = {"rating": story["RatingAvg"], "next_id": n + INSERT_BASE + len(inserted)}

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
        p = r.pipeline(transaction="by_rating" in kinds)
        p.hset(key, "RatingAvg", value)
        if "by_rating" in kinds:
            p.zadd(common.manual_key(ctx, n, "by_rating"), {member: float(value)})
        p.execute()

    return {"insert": insert, "update_rating": update_rating}


@scenario(title="I7 Chi phí của index: INSERT / UPDATE khi có 0 và 3 index", pair="i7_write_cost",
          repeat=10, warmup=2)
def i7_write_cost(ctx: Ctx):
    """On 1.000 stories: the same INSERT and UPDATE RatingAvg with the Hash only, with the Hash + 3 structures kept
    by the application in MULTI, and with a RediSearch index of 3 fields (indexing happens inside HSET)."""
    n = LARGEST
    rows = dataset.load_redis(ctx, n)
    common.build_manual(ctx, n, rows, I7_KINDS)
    for kind in I7_KINDS:
        common.manual_memory(ctx, n, kind, label(f"index/{kind}", n))
    story = picks.write_target(rows)
    member = redisidx.pad(story["StoryId"])
    inserted: list[int] = []
    in_step = False
    lines = []
    for variant, kinds, search in (("manual_0", (), False), ("manual_3", I7_KINDS, False), ("search_3", (), True)):
        index = common.create_search(ctx, n, "i7", redisidx.SET_SCHEMA[3], label=label(variant, n)) if search else None
        try:
            for op, fn in _i7_ops(ctx, n, story, kinds, inserted).items():
                lbl = label(f"{op}/{variant}", n)
                lines.append(f"{op} {variant}: {1000 * ctx.bench_redis(lbl, fn).p50:.1f} µs")
            if variant == "manual_3":
                score = ctx.redis.zscore(common.manual_key(ctx, n, "by_rating"), member)
                rating = ctx.redis.hget(dataset.story_key(ctx, n, story["StoryId"]), "RatingAvg")
                in_step = score is not None and abs(score - float(rating)) < 1e-9
        finally:
            if index:
                common.search_memory(ctx, index, label(variant, n))
                common.drop_search(ctx, index)
            if inserted:
                ctx.redis.delete(*(dataset.story_key(ctx, n, sid) for sid in inserted))
                inserted.clear()
    ctx.observe(f"Truyện {story['StoryId']}, {num(n)} truyện: " + "; ".join(lines) + ".")
    ctx.check(in_step, "I7: sau các lệnh ghi trong MULTI, index tự quản lý (ZSET by_rating) vẫn khớp với Hash")


i7_write_cost.teardown(_teardown)
