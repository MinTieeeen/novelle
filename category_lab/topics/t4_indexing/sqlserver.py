"""SQL Server side of indexing (dataset, I2-I5, I7). Every scenario works on lab.indexing__Story_<n> (see
dataset.py), which only has its clustered primary key; a variant creates the indexes it studies
(common.indexes) and drops them afterwards, so every variant starts from "PK only".

For every variant: the result is first compared with the expected stories (computed on the client from the
copy rules), then measured (common.measure: server-side time of the timing form, logical reads, the access
path of the actual plan, rows read, lookups).
"""
import secrets
import time

from lab.framework import Ctx, scenario

from . import common, copies, dataset, picks, plans, redisidx, textsearch
from .copies import label, num
from .dataset import SIZES
from .ddl import Index

LARGEST = SIZES[-1]
ENV_LABELS = {
    "fulltext_installed": "Full-Text Search được cài (I5)",
    "vietnamese_word_breaker": "Có word breaker tiếng Việt, lcid 1066 (I5)",
    "novelle_catalog_exists": "Có catalog ftc_Novelle (I5)",
    "catalog_references": "Login lab có quyền REFERENCES trên ftc_Novelle (I5)",
    "view_database_state": "Login lab có VIEW DATABASE STATE (đo dung lượng index, I4 / I7)",
    "create_table": "Login lab có CREATE TABLE (bảng sandbox)",
}


# --- dataset ---------------------------------------------------------------------------------------
@scenario(title="Dữ liệu thí nghiệm: Story 1k / 10k / 50k và điều kiện của RDS", pair="dataset",
          repeat=1, warmup=0)
def dataset_story(ctx: Ctx):
    """Builds lab.indexing__Story_<n> for every size, checks it against the copy rules and records its size.
    Nothing is timed here."""
    env = dataset.environment(ctx)
    ctx.capture("environment", env)
    ctx.observe(f"SQL Server {env['product_version']} ({env['edition']}), collation của database: "
                f"{env['db_collation']}.")
    missing = [text for key, text in ENV_LABELS.items() if not env.get(key)]
    ctx.observe("Điều kiện cho các phase sau: " + ("đủ cả." if not missing else "THIẾU: " + "; ".join(missing) + "."))
    ctx.check(bool(env.get("create_table")), "login lab tạo được bảng sandbox lab.indexing__*")

    base, max_author = dataset.source(ctx)
    ctx.metric("source_rows", len(base), "dòng", better="none", note="số dòng dbo.Story được nhân bản")
    for n in SIZES:
        table = dataset.story_table(ctx, n)
        expected = copies.fingerprint(copies.copy_rows(base, n, max_author))
        actual = dataset.sql_fingerprint(ctx, table)
        same = actual == expected
        if not same:
            ctx.capture(f"fingerprint_{n}", {"sql": actual, "copy_rules": expected})
        ctx.check(same, f"{num(n)} truyện: {table} khớp quy tắc nhân bản của copies.py "
                        "(cùng dữ liệu với phía Redis)")

        extra = ctx.sql.scalar(f"SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID(N'{table}') "
                               "AND index_id > 1")
        ctx.check(extra == 0, f"{num(n)} truyện: bảng gốc chỉ có clustered PK, không có index phụ nào")

        lbl = label("Story", n)
        ctx.metric("rows", actual["rows"], "dòng", label=lbl, better="none")
        ctx.metric("public_share", 100 * actual["public_rows"] / actual["rows"], "%", label=lbl, better="none",
                   note="PUBLISHED và chưa xoá (RB3): phần dữ liệu filtered index của I4 chứa")
        size = dataset.table_size(ctx, table)
        if size:
            clustered = size[0]
            ctx.metric("data_pages", clustered["in_row_pages"], "trang", label=lbl, better="none",
                       note="trang 8 KB của clustered index (chính là bảng), không tính LOB")
            ctx.metric("data_mb", clustered["used_pages"] * 8 / 1024, "MB", label=lbl, better="none",
                       note="used_page_count × 8 KB, gồm cả trang LOB")
    if not env.get("view_database_state"):
        ctx.observe("Không có VIEW DATABASE STATE nên chưa đo được số trang; cần cấp quyền này trước I4 / I7.")


# --- I2 composite / covering / tipping point -------------------------------------------------------
I2_COLUMNS = {"StoryId": "INT", "Title": "NVARCHAR(300)", "RatingAvg": "DECIMAL(3,2)", "ChapterCount": "INT"}
TIP_COLUMNS = {"StoryId": "INT", "Title": "NVARCHAR(300)", "ChapterCount": "INT"}
IX_RATING = Index("IX_Rating", key=("RatingAvg",))
IX_STATUS_RATING = Index("IX_Status_Rating", key=("CompletionStatus", "RatingAvg"))
IX_RATING_STATUS = Index("IX_Rating_Status", key=("RatingAvg", "CompletionStatus"))
IX_COVER = Index("IX_Status_Rating_Cover", key=("CompletionStatus", "RatingAvg"), include=("Title", "ChapterCount"))
I2_VARIANTS = (("no_index", ()), ("single", (IX_RATING,)), ("composite_eq_range", (IX_STATUS_RATING,)),
               ("composite_range_eq", (IX_RATING_STATUS,)), ("covering", (IX_COVER,)))


@scenario(title="I2 Index nhiều cột: thứ tự cột, Key Lookup, covering index và tipping point (F2 bộ lọc)",
          pair="i2_composite", repeat=10, warmup=2)
def i2_composite(ctx: Ctx):
    """CompletionStatus = @st AND RatingAvg >= @r with no index, one column, the two column orders and a
    covering index; then, on the largest table, the share of matching rows at which the optimizer stops
    using a non-covering index."""
    for n in SIZES:
        table = dataset.story_table(ctx, n)
        rows = dataset.rows(ctx, n)
        status, t, want = picks.catalog_filter(rows)
        sql = common.query_text(ctx, "i2_filter", table)
        results: dict[str, common.Measured] = {}
        for variant, defs in I2_VARIANTS:
            lbl = label(variant, n)
            with common.indexes(ctx, table, *defs, label=lbl):
                common.same_ids(ctx, want, common.ids(ctx, sql, status, t), lbl)
                m = common.measure(ctx, lbl, sql, I2_COLUMNS, status, t)
                if defs:
                    common.index_size(ctx, table, defs[0].name, lbl)
            results[variant] = m
            if variant == "composite_eq_range" and m.access and m.access[0].index == IX_STATUS_RATING.name:
                ctx.check({"CompletionStatus", "RatingAvg"} <= set(m.access[0].seek_columns),
                          f"{lbl}: cột bằng đứng trước nên seek được trên cả hai cột")
            if variant == "covering":
                ctx.check(m.lookups == 0, f"{lbl}: covering index trả lời truy vấn mà không cần Key Lookup")
        ctx.observe(f"{num(n)} truyện, {status} và RatingAvg ≥ {t}: {len(want)} truyện "
                    f"({picks.pct(len(want), n)}). " + "; ".join(
                        f"{v}: {m.logical_reads} trang, {m.lookups} lookup, p50 {m.stats.p50:.3f} ms ({m.describe()})"
                        for v, m in results.items()) + ".")
        ctx.check(results["covering"].logical_reads < results["no_index"].logical_reads,
                  f"{num(n)}: covering index đọc ít trang hơn không có index")

    _tipping_point(ctx, LARGEST)


def _tipping_point(ctx: Ctx, n: int) -> None:
    table = dataset.story_table(ctx, n)
    rows = dataset.rows(ctx, n)
    sql_auto = common.query_text(ctx, "i2_tipping", table)
    sql_forced = common.query_text(ctx, "i2_tipping", table, hint=f"WITH (INDEX({IX_RATING.name}))")
    sweep = picks.thresholds([r["RatingAvg"] for r in rows], picks.TIP_FRACTIONS)
    lines, tipping = [], None
    with common.indexes(ctx, table, IX_RATING, label=label("tip", n)):
        for t, count in sweep:
            share = picks.pct(count, n)
            want = {r["StoryId"] for r in rows if r["RatingAvg"] >= t}
            auto = common.measure(ctx, label(f"tip/auto/{share}", n), sql_auto, TIP_COLUMNS, t)
            forced = common.measure(ctx, label(f"tip/forced/{share}", n), sql_forced, TIP_COLUMNS, t)
            common.same_ids(ctx, want, common.ids(ctx, sql_auto, t), label(f"tip/auto/{share}", n))
            ctx.metric("match_pct", 100 * count / n, "%", label=label(f"tip/auto/{share}", n), better="none")
            used = plans.uses_index(auto.access, IX_RATING.name)
            if not used and tipping is None:
                tipping = (share, count)
            lines.append(f"{share} ({count} truyện): optimizer {'dùng index' if used else 'quét bảng'}, "
                         f"{auto.logical_reads} trang; ép dùng index: {forced.logical_reads} trang")
    ctx.observe(f"Tipping point trên {num(n)} truyện, index IX_Rating không covering: " + "; ".join(lines) + ".")
    if tipping:
        ctx.metric("tipping_pct", 100 * tipping[1] / n, "%", label=label("tip", n), better="none",
                   note="tỉ lệ dòng khớp nhỏ nhất mà optimizer bỏ index để quét bảng")
        ctx.observe(f"Optimizer bỏ index từ khoảng {tipping[0]} số dòng: lúc đó mỗi dòng khớp tốn một Key Lookup "
                    "(vài trang), đắt hơn đọc tuần tự cả bảng.")
    ctx.check(tipping is not None, f"{num(n)}: có một tỉ lệ dòng khớp mà optimizer chuyển từ Seek + Lookup sang Scan")


# --- I3 sort + paging ------------------------------------------------------------------------------
I3_COLUMNS = {"StoryId": "INT", "Title": "NVARCHAR(300)", "ChapterCount": "INT", "LastChapterAt": "DATETIME2(3)"}
IX_PUBLIC_LAST = Index("IX_Public_Last", key=("PublishStatus", "IsDeleted", "LastChapterAt DESC", "StoryId DESC"),
                       include=("Title", "ChapterCount"))
PAGE = 20
# Without an index every page is a Top N Sort of offset + 20 rows. The instance grants very little memory for
# sorts (t3 met RESOURCE_SEMAPHORE), so the no-index variant only sorts pages that need at most this many rows.
NO_INDEX_MAX_SORT = 10_000


@scenario(title="I3 Sắp xếp và phân trang: truyện mới cập nhật (F1), OFFSET so với keyset",
          pair="i3_sort_paging", repeat=10, warmup=2)
def i3_sort_paging(ctx: Ctx):
    """ORDER BY LastChapterAt DESC, StoryId DESC with no index (Sort), with an index in that order (no Sort)
    using OFFSET, and the same index with keyset paging, for pages at 0 / 10 / 50 / 90% of the list."""
    for n in SIZES:
        table = dataset.story_table(ctx, n)
        rows = dataset.rows(ctx, n)
        ordered = [r["StoryId"] for r in redisidx.newest_first(rows)]
        by_id = {r["StoryId"]: r for r in rows}
        offset_sql = common.query_text(ctx, "i3_page_offset", table)
        keyset_sql = common.query_text(ctx, "i3_page_keyset", table)
        pages = picks.page_offsets(len(ordered), size=PAGE)
        lines = []

        with common.indexes(ctx, table, label=label("no_index", n)):
            for p, off in pages:
                if off + PAGE > NO_INDEX_MAX_SORT:
                    continue
                lbl = label(f"no_index/p{p}", n)
                common.same_order(ctx, ordered[off:off + PAGE], common.id_list(ctx, offset_sql, off), lbl)
                m = common.measure(ctx, lbl, offset_sql, I3_COLUMNS, off)
                ctx.check(m.has_sort, f"{lbl}: không có index đúng thứ tự thì phải Sort")
                lines.append(f"no_index trang {p}%: {m.logical_reads} trang, p50 {m.stats.p50:.3f} ms")

        with common.indexes(ctx, table, IX_PUBLIC_LAST, label=label("index", n)):
            common.index_size(ctx, table, IX_PUBLIC_LAST.name, label("index", n))
            for p, off in pages:
                lbl = label(f"index_offset/p{p}", n)
                common.same_order(ctx, ordered[off:off + PAGE], common.id_list(ctx, offset_sql, off), lbl)
                m = common.measure(ctx, lbl, offset_sql, I3_COLUMNS, off)
                ctx.check(not m.has_sort, f"{lbl}: index đã đúng thứ tự ORDER BY nên không còn Sort")
                lines.append(f"offset trang {p}%: đọc {plans.rows_read(m.access)} dòng, "
                             f"{m.logical_reads} trang, p50 {m.stats.p50:.3f} ms")
                if off == 0:
                    continue
                last = by_id[ordered[off - 1]]
                params = (last["LastChapterAt"], last["LastChapterAt"], last["StoryId"])
                lbl = label(f"index_keyset/p{p}", n)
                common.same_order(ctx, ordered[off:off + PAGE], common.id_list(ctx, keyset_sql, *params), lbl)
                k = common.measure(ctx, lbl, keyset_sql, I3_COLUMNS, *params)
                ctx.check(plans.rows_read(k.access) <= 3 * PAGE,
                          f"{lbl}: keyset chỉ đọc khoảng một trang dữ liệu, không phụ thuộc độ sâu")
                lines.append(f"keyset trang {p}%: đọc {plans.rows_read(k.access)} dòng, "
                             f"{k.logical_reads} trang, p50 {k.stats.p50:.3f} ms")
        ctx.observe(f"{num(n)} truyện, {num(len(ordered))} truyện trong danh sách: " + "; ".join(lines) + ".")


# --- I4 filtered index -----------------------------------------------------------------------------
IX_PUBLIC_LAST_FILTERED = Index("IX_Public_Last_Filtered", key=("LastChapterAt DESC", "StoryId DESC"),
                                include=("Title", "ChapterCount"),
                                where="PublishStatus = 'PUBLISHED' AND IsDeleted = 0")


@scenario(title="I4 Filtered index: index chỉ chứa truyện công khai (IX_Story_Public_LastChapter của web)",
          pair="i4_filtered", repeat=10, warmup=2)
def i4_filtered(ctx: Ctx):
    """Page 1 of the F1 list with the full index of I3 vs a filtered index on the public stories only (size,
    pages read), and the filtered index when the status comes as parameters (UnmatchedIndexes) or with
    OPTION (RECOMPILE)."""
    for n in SIZES:
        table = dataset.story_table(ctx, n)
        rows = dataset.rows(ctx, n)
        want = [r["StoryId"] for r in redisidx.newest_first(rows)][:PAGE]
        public = sum(1 for r in rows if copies.is_public(r))
        literal_sql = common.query_text(ctx, "i3_page_offset", table)
        param_sql = common.query_text(ctx, "i4_page_param", table)
        pages: dict[str, int] = {}
        lines = []

        for variant, idx in (("full_index", IX_PUBLIC_LAST), ("filtered", IX_PUBLIC_LAST_FILTERED)):
            lbl = label(variant, n)
            with common.indexes(ctx, table, idx, label=lbl):
                size = common.index_size(ctx, table, idx.name, lbl)
                common.same_order(ctx, want, common.id_list(ctx, literal_sql, 0), lbl)
                m = common.measure(ctx, lbl, literal_sql, I3_COLUMNS, 0)
                ctx.check(plans.uses_index(m.access, idx.name), f"{lbl}: truy vấn dùng {idx.name}")
                text = f"{variant}: trang 1 đọc {m.logical_reads} trang, p50 {m.stats.p50:.3f} ms"
                if size:
                    pages[variant] = size["used_pages"]
                    text = f"{variant}: index {size['rows']} dòng, {size['used_pages']} trang; " + text.split(": ", 1)[1]
                lines.append(text)
                if variant != "filtered":
                    continue
                if size:
                    ctx.check(size["rows"] == public,
                              f"{lbl}: filtered index chỉ chứa {public} truyện công khai ({picks.pct(public, n)})")
                for pv, hint in (("filtered_param", ""), ("filtered_param_recompile", "OPTION (RECOMPILE)")):
                    plbl = label(pv, n)
                    common.same_order(ctx, want, common.id_list(ctx, f"{param_sql}\n{hint}", "PUBLISHED", 0), plbl)
                    pm = common.measure(ctx, plbl, param_sql, I3_COLUMNS, "PUBLISHED", 0, hint=hint)
                    used = plans.uses_index(pm.access, idx.name)
                    unmatched = any("UnmatchedIndexes" in w for w in pm.warnings)
                    if hint:
                        ctx.check(used, f"{plbl}: có OPTION (RECOMPILE) thì dùng lại được filtered index")
                    else:
                        ctx.check(not used, f"{plbl}: trạng thái là tham số nên optimizer không dùng filtered index")
                    lines.append(f"{pv}: {'dùng' if used else 'không dùng'} filtered index"
                                 + (" (plan báo UnmatchedIndexes)" if unmatched else "")
                                 + f", {pm.logical_reads} trang, p50 {pm.stats.p50:.3f} ms")
        ctx.observe(f"{num(n)} truyện, {num(public)} công khai ({picks.pct(public, n)}): " + "; ".join(lines) + ".")
        if len(pages) == 2:
            ctx.check(pages["filtered"] < pages["full_index"], f"{num(n)}: filtered index nhỏ hơn index đầy đủ")


# --- I5 full-text search ---------------------------------------------------------------------------
I5_COLUMNS = {"StoryId": ("s.StoryId", "INT"), "Title": ("s.Title", "NVARCHAR(300)")}
I5_PLAIN_COLUMNS = {"StoryId": "INT", "Title": "NVARCHAR(300)"}
IX_TITLE = Index("IX_Title", key=("Title",))
FRESH_TIMEOUT_S = 120


def _score(ctx: Ctx, lbl: str, found: set[int], expected: set[int]) -> tuple[float, float]:
    recall, precision = textsearch.recall_precision(found, expected)
    ctx.metric("results", len(found), "truyện", label=lbl, better="none")
    ctx.metric("recall_pct", 100 * recall, "%", label=lbl, better="higher",
               note="phần truyện cần tìm (có từ bắt đầu bằng từ khoá, bỏ dấu) mà biến thể tìm thấy")
    ctx.metric("precision_pct", 100 * precision, "%", label=lbl, better="higher",
               note="phần kết quả đúng là truyện cần tìm")
    return recall, precision


@scenario(title="I5 Tìm kiếm toàn văn (F2 ô tìm kiếm): LIKE so với full-text CONTAINSTABLE",
          pair="i5_fulltext", repeat=10, warmup=2)
def i5_fulltext(ctx: Ctx):
    """For a common accented word, the same word typed without diacritics and a rare word: LIKE '%w%' (scan),
    "title starts with" on an index, and CONTAINSTABLE '"w*"' on a full-text index. Each result is scored
    against the reference (textsearch.reference). Then: how long until a new story can be found."""
    env = dataset.environment(ctx)
    fulltext_ok = bool(env.get("fulltext_installed")) and bool(env.get("novelle_catalog_exists")) \
        and bool(env.get("catalog_references"))
    lcid = 1066 if env.get("vietnamese_word_breaker") else 0
    base, _ = dataset.source(ctx)
    terms = textsearch.choose_terms(base)
    ctx.observe(f"Từ khoá (chọn từ dữ liệu): phổ biến '{terms['common']}', gõ không dấu '{terms['unaccented']}', "
                f"hiếm '{terms['rare']}'. Full-text: "
                + (f"word breaker lcid {lcid} ({'tiếng Việt' if lcid else 'trung tính'})." if fulltext_ok
                   else "KHÔNG dùng được (thiếu Full-Text Search, catalog ftc_Novelle hoặc quyền REFERENCES)."))
    ctx.check(fulltext_ok, "RDS có Full-Text Search và login lab dùng được catalog ftc_Novelle")

    for n in SIZES:
        table = dataset.copy_of(ctx, n, "Ft")
        rows = dataset.rows(ctx, n)
        like_sql = common.query_text(ctx, "i5_like", table)
        prefix_sql = common.query_text(ctx, "i5_title_prefix", table)
        ft_sql = common.query_text(ctx, "i5_fulltext", table)
        expected = {kind: textsearch.reference(rows, term) for kind, term in terms.items()}
        lines = []

        with common.indexes(ctx, table, label=label("like", n)):
            for kind, term in terms.items():
                lbl = label(f"like/{kind}", n)
                pattern = f"%{term}%"
                found = common.ids(ctx, like_sql, pattern, pattern)
                r, p = _score(ctx, lbl, found, expected[kind])
                m = common.measure(ctx, lbl, like_sql, I5_PLAIN_COLUMNS, pattern, pattern)
                lines.append(f"LIKE '%{term}%': {len(found)} truyện, recall {r:.0%}, precision {p:.0%}, "
                             f"{m.logical_reads} trang, p50 {m.stats.p50:.2f} ms")

        with common.indexes(ctx, table, IX_TITLE, label=label("title_prefix", n)):
            term = terms["common"]
            lbl = label("title_prefix/common", n)
            found = common.ids(ctx, prefix_sql, f"{term}%")
            ctx.metric("results", len(found), "truyện", label=lbl, better="none")
            m = common.measure(ctx, lbl, prefix_sql, I5_PLAIN_COLUMNS, f"{term}%")
            lines.append(f"Title LIKE '{term}%' (index IX_Title, chỉ từ đầu tiên của tiêu đề): {len(found)} truyện, "
                         f"{m.describe()}, {m.logical_reads} trang, p50 {m.stats.p50:.3f} ms")

        if fulltext_ok:
            status = common.create_fulltext(ctx, table, f"PK_{ctx.scenario.topic}__StoryFt_{n}", lcid,
                                            label("fulltext", n))
            build_s = next(x.value for x in reversed(ctx.metrics) if x.name == "build_s")
            lines.append(f"full-text: tạo + populate {build_s:.1f} s, {float(status['fragments_kb']) / 1024:.2f} MB")
            for kind, term in terms.items():
                lbl = label(f"fulltext/{kind}", n)
                condition = f'"{term}*"'
                found = common.ids(ctx, ft_sql, condition)
                r, p = _score(ctx, lbl, found, expected[kind])
                m = common.measure(ctx, lbl, ft_sql, I5_COLUMNS, condition)
                lines.append(f"CONTAINSTABLE '{condition}': {len(found)} truyện, recall {r:.0%}, precision {p:.0%}, "
                             f"p50 {m.stats.p50:.2f} ms")
                if kind == "common":
                    ctx.check(len(found) > 0, f"{lbl}: full-text tìm được từ phổ biến có dấu")
            if n == LARGEST:
                _fulltext_freshness(ctx, table, ft_sql, n)
            common.reset_indexes(ctx, table)
        ctx.observe(f"{num(n)} truyện (cần tìm: {len(expected['common'])} / {len(expected['unaccented'])} / "
                    f"{len(expected['rare'])}): " + "; ".join(lines) + ".")


def _fulltext_freshness(ctx: Ctx, table: str, ft_sql: str, n: int) -> None:
    """Insert a story with a new word and poll CONTAINSTABLE until it is found (CHANGE_TRACKING AUTO)."""
    word = "labfresh" + "".join(secrets.choice("bcdfghjklmnpqrstvwxz") for _ in range(8))
    lbl = label("fulltext/freshness", n)
    ctx.sql.exec(common.query_text(ctx, "i5_fresh_insert", table), f"{word} mới")
    new_id = ctx.sql.scalar(f"SELECT MAX(StoryId) FROM {table}")
    started, polls, found = time.perf_counter(), 0, False
    try:
        while time.perf_counter() - started < FRESH_TIMEOUT_S:
            polls += 1
            if new_id in common.ids(ctx, ft_sql, f'"{word}"'):
                found = True
                break
            time.sleep(0.05)
        elapsed = time.perf_counter() - started
    finally:
        ctx.sql.exec(f"DELETE FROM {table} WHERE StoryId = ?", new_id)
    ctx.metric("freshness_ms", 1000 * elapsed, "ms", label=lbl,
               note="từ lúc INSERT commit tới lần CONTAINSTABLE đầu tiên thấy truyện mới (đo ở client: gồm cả "
                    "vòng mạng tới RDS mỗi lần hỏi)")
    ctx.metric("polls", polls, "lần", label=lbl)
    ctx.check(found, f"{lbl}: truyện mới tìm được bằng full-text trong {FRESH_TIMEOUT_S} s")
    ctx.observe(f"Độ tươi của full-text ({num(n)} truyện): truyện vừa INSERT "
                + (f"tìm thấy sau {1000 * elapsed:.0f} ms ({polls} lần hỏi)" if found
                   else f"chưa tìm thấy sau {FRESH_TIMEOUT_S} s")
                + ". CHANGE_TRACKING AUTO cập nhật index ở nền, không nằm trong câu INSERT.")


# --- I7 write cost and size --------------------------------------------------------------------------
IX_AUTHOR = Index("IX_Author", key=("AuthorId",))
UX_SLUG = Index("UX_Slug", key=("Slug",), unique=True)
IX_VIEWS = Index("IX_ViewCount", key=("ViewCount DESC",))
# 0 / 1 / 3 / 6 secondary indexes; 6 is close to the web's set on dbo.Story (02_indexes.sql).
I7_SETS = {
    0: (),
    1: (IX_RATING,),
    3: (IX_RATING, IX_AUTHOR, UX_SLUG),
    6: (IX_RATING, IX_AUTHOR, UX_SLUG, IX_VIEWS, IX_COVER, IX_PUBLIC_LAST_FILTERED),
}
I7_OPS = ("insert", "update_rating", "update_views", "update_description")
# Each sample runs the write 50 times in one batch: a single-row write takes well under the ~1 ms step of
# SYSDATETIME on RDS, so inner=1 would only measure the clock. The four statements are written to be
# repeatable (see sql/i7_*.sql); the inserted rows are deleted after each set.
WRITE_INNER = 50


@scenario(title="I7 Chi phí của index: dung lượng và thời gian ghi khi có 0 / 1 / 3 / 6 index",
          pair="i7_write_cost", repeat=10, warmup=2)
def i7_write_cost(ctx: Ctx):
    """Size of every index at 1k / 10k / 50k (and of the sets 1 / 3 / 6 next to the table), then, on 50k, the
    server time and the pages touched by an INSERT and three kinds of UPDATE with each set of indexes."""
    for n in SIZES:
        table = dataset.copy_of(ctx, n, "W")
        with common.indexes(ctx, table, *I7_SETS[6], label=label("indexes_6", n)):
            sizes = {r["index_name"]: r for r in dataset.table_size(ctx, table) or []}
        if not sizes:
            ctx.observe("Không có VIEW DATABASE STATE nên không đo được dung lượng index.")
            break
        data_mb = sizes[f"PK_{ctx.scenario.topic}__StoryW_{n}"]["used_pages"] * 8 / 1024
        ctx.metric("data_mb", data_mb, "MB", label=label("table", n), better="none",
                   note="clustered index = bảng (gồm trang LOB)")
        per_index = []
        for d in I7_SETS[6]:
            mb = sizes[d.name]["used_pages"] * 8 / 1024
            ctx.metric("index_mb", mb, "MB", label=label(f"index/{d.name}", n))
            per_index.append(f"{d.name} {mb:.2f} MB ({sizes[d.name]['rows']} dòng)")
        totals = {}
        for k, defs in I7_SETS.items():
            totals[k] = sum(sizes[d.name]["used_pages"] for d in defs) * 8 / 1024
            ctx.metric("indexes_mb", totals[k], "MB", label=label(f"indexes_{k}", n),
                       note="tổng dung lượng các index phụ của bộ")
            ctx.metric("indexes_pct", 100 * totals[k] / data_mb, "%", label=label(f"indexes_{k}", n),
                       note="so với dung lượng bảng")
        ctx.check(totals[6] > totals[1] > 0, f"{num(n)}: thêm index thì tốn thêm dung lượng")
        ctx.observe(f"{num(n)} truyện: bảng {data_mb:.1f} MB; " + "; ".join(per_index)
                    + f"; bộ 1 / 3 / 6 index = {totals[1]:.2f} / {totals[3]:.2f} / {totals[6]:.2f} MB "
                      f"({100 * totals[6] / data_mb:.0f}% dung lượng bảng với 6 index).")

    n = LARGEST
    table = dataset.copy_of(ctx, n, "W")
    story = picks.write_target(dataset.rows(ctx, n))
    reads: dict[tuple[str, int], int] = {}
    times: dict[tuple[str, int], float] = {}
    for k, defs in I7_SETS.items():
        with common.indexes(ctx, table, *defs, label=label(f"indexes_{k}", n)):
            for op in I7_OPS:
                lbl = label(f"{op}/indexes_{k}", n)
                sql = common.query_text(ctx, f"i7_{op}", table)
                stats = ctx.bench_sql(lbl, sql, story["StoryId"], inner=WRITE_INNER,
                                      note=f"SQL Server: {WRITE_INNER} lần ghi trong 1 batch giữa 2 lần SYSDATETIME(), "
                                           f"chia {WRITE_INNER}; lệnh được viết để lặp lại được")
                info = ctx.inspect_sql(lbl, sql, story["StoryId"])
                reads[(op, k)], times[(op, k)] = info.logical_reads, stats.p50
            ctx.sql.exec(f"DELETE FROM {table} WHERE StoryId > ?", n)

    for op in I7_OPS:
        ctx.observe(f"{op} (truyện {story['StoryId']}, {num(n)} truyện): " + "; ".join(
            f"{k} index: {times[(op, k)]:.3f} ms, {reads[(op, k)]} trang" for k in I7_SETS) + ".")
    ctx.check(reads[("update_rating", 6)] > reads[("update_rating", 0)],
              "update_rating: RatingAvg là khoá của 2 index trong bộ 6, nên phải đọc/ghi thêm trang")
    ctx.check(reads[("insert", 6)] > reads[("insert", 0)], "insert: mỗi index phụ thêm một entry nên tốn thêm trang")
    ctx.check(reads[("update_description", 6)] <= reads[("update_description", 0)] + 2,
              "update_description: không index phụ nào chứa Description nên số index gần như không ảnh hưởng")
