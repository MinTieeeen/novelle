"""SQL Server side of indexing (dataset, I1-I5, I7).

Every scenario works on lab.indexing__Story_<n>, n = 100 / 1.000 (see dataset.py), which only has its clustered
primary key; a variant creates the indexes it studies (common.indexes) and drops them afterwards.

Each variant is measured with common.measure (server-side time, logical reads, access path of the actual plan)
and its result is compared with the stories expected from the copy rules. Each scenario ends with ONE check:
every variant returned the expected stories (I1-I5), or the basic cost claim of I7.
"""
from lab.framework import Ctx, scenario

from . import common, copies, dataset, picks, redisidx, textsearch
from .copies import label, num
from .dataset import SIZES
from .ddl import Index

LARGEST = SIZES[-1]
PAGE = 20
ENV_LABELS = {
    "fulltext_installed": "Full-Text Search được cài (I5)",
    "novelle_catalog_exists": "Có catalog ftc_Novelle (I5)",
    "catalog_references": "Login lab có quyền REFERENCES trên ftc_Novelle (I5)",
    "view_database_state": "Login lab có VIEW DATABASE STATE (dung lượng index)",
}


# --- dataset ---------------------------------------------------------------------------------------
@scenario(title="Dữ liệu thí nghiệm: Story 100 / 1.000 dòng và điều kiện của RDS", pair="dataset",
          repeat=1, warmup=0)
def dataset_story(ctx: Ctx):
    """Builds lab.indexing__Story_<n> for every size and checks it against the copy rules (fingerprint)."""
    env = dataset.environment(ctx)
    ctx.capture("environment", env)
    missing = [text for key, text in ENV_LABELS.items() if not env.get(key)]
    ctx.observe(f"SQL Server {env['product_version']} ({env['edition']}), collation {env['db_collation']}. "
                + ("Đủ điều kiện cho mọi scenario." if not missing else "THIẾU: " + "; ".join(missing) + "."))

    base, max_author = dataset.source(ctx)
    ok = True
    for n in SIZES:
        table = dataset.story_table(ctx, n)
        expected = copies.fingerprint(copies.copy_rows(base, n, max_author))
        actual = dataset.sql_fingerprint(ctx, table)
        if actual != expected:
            ctx.capture(f"fingerprint_{n}", {"sql": actual, "copy_rules": expected})
            ok = False
        lbl = label("Story", n)
        ctx.metric("rows", actual["rows"], "dòng", label=lbl, better="none")
        ctx.metric("public_share", 100 * actual["public_rows"] / max(1, actual["rows"]), "%", label=lbl,
                   better="none", note="PUBLISHED và chưa xoá (RB3)")
    ctx.check(ok, "bảng 100 / 1.000 truyện khớp quy tắc nhân bản (cùng dữ liệu với phía Redis)")


# --- I1 single-column lookup -----------------------------------------------------------------------
I1_COLUMNS = {"StoryId": "INT", "Title": "NVARCHAR(300)", "Slug": "VARCHAR(350)",
              "CompletionStatus": "VARCHAR(10)", "ChapterCount": "INT", "RatingAvg": "DECIMAL(3,2)"}
IX_SLUG = Index("IX_Slug", key=("Slug",))
IX_AUTHOR = Index("IX_Author", key=("AuthorId",))


@scenario(title="I1 Tra cứu theo một cột: mở truyện theo Slug, truyện của một tác giả",
          pair="i1_single_column", repeat=10, warmup=2)
def i1_single_column(ctx: Ctx):
    """WHERE Slug = ? and WHERE AuthorId = ?: no index (scan) vs a nonclustered index (seek + key lookup)."""
    ok = True
    for n in SIZES:
        table = dataset.story_table(ctx, n)
        rows = dataset.rows(ctx, n)
        target = picks.middle_row(rows)
        author, _ = picks.median_author(rows)
        cases = (("slug", "i1_by_slug", target["Slug"], {target["StoryId"]}, IX_SLUG),
                 ("author", "i1_by_author", author, {r["StoryId"] for r in rows if r["AuthorId"] == author}, IX_AUTHOR))
        for qname, file, param, want, idx in cases:
            sql = common.query_text(ctx, file, table)
            lines = []
            for variant, defs in (("no_index", ()), ("nonclustered", (idx,))):
                lbl = label(f"{qname}/{variant}", n)
                with common.indexes(ctx, table, *defs, label=lbl):
                    ok &= common.equal_sets(ctx, want, common.ids(ctx, sql, param), lbl)
                    m = common.measure(ctx, lbl, sql, I1_COLUMNS, param)
                lines.append(f"{variant}: {m.logical_reads} trang, p50 {m.stats.p50:.3f} ms ({m.describe()})")
            ctx.observe(f"{qname} · {num(n)} truyện: " + "; ".join(lines) + ".")
    ctx.check(ok, "I1: có và không có index đều trả đúng truyện cần tìm")


# --- I2 composite / covering -----------------------------------------------------------------------
I2_COLUMNS = {"StoryId": "INT", "Title": "NVARCHAR(300)", "RatingAvg": "DECIMAL(3,2)", "ChapterCount": "INT"}
IX_RATING = Index("IX_Rating", key=("RatingAvg",))
IX_STATUS_RATING = Index("IX_Status_Rating", key=("CompletionStatus", "RatingAvg"))
IX_COVER = Index("IX_Status_Rating_Cover", key=("CompletionStatus", "RatingAvg"), include=("Title", "ChapterCount"))
I2_VARIANTS = (("no_index", ()), ("composite", (IX_STATUS_RATING,)), ("covering", (IX_COVER,)))


@scenario(title="I2 Index nhiều cột: composite và covering index (bộ lọc trạng thái + rating)",
          pair="i2_composite", repeat=10, warmup=2)
def i2_composite(ctx: Ctx):
    """CompletionStatus = ? AND RatingAvg >= ?: no index, composite (status, rating), covering index."""
    ok = True
    for n in SIZES:
        table = dataset.story_table(ctx, n)
        status, t, want = picks.catalog_filter(dataset.rows(ctx, n))
        sql = common.query_text(ctx, "i2_filter", table)
        lines = []
        for variant, defs in I2_VARIANTS:
            lbl = label(variant, n)
            with common.indexes(ctx, table, *defs, label=lbl):
                ok &= common.equal_sets(ctx, want, common.ids(ctx, sql, status, t), lbl)
                m = common.measure(ctx, lbl, sql, I2_COLUMNS, status, t)
            lines.append(f"{variant}: {m.logical_reads} trang, {m.lookups} lookup, p50 {m.stats.p50:.3f} ms "
                         f"({m.describe()})")
        ctx.observe(f"{num(n)} truyện, {status} và RatingAvg ≥ {t}: {len(want)} truyện. " + "; ".join(lines) + ".")
    ctx.check(ok, "I2: mọi biến thể index trả đúng tập truyện của bộ lọc")


# --- I3 sort + paging ------------------------------------------------------------------------------
I3_COLUMNS = {"StoryId": "INT", "Title": "NVARCHAR(300)", "ChapterCount": "INT", "LastChapterAt": "DATETIME2(3)"}
IX_PUBLIC_LAST = Index("IX_Public_Last", key=("PublishStatus", "IsDeleted", "LastChapterAt DESC", "StoryId DESC"),
                       include=("Title", "ChapterCount"))


@scenario(title="I3 Sắp xếp và phân trang: truyện mới cập nhật, OFFSET so với keyset",
          pair="i3_sort_paging", repeat=10, warmup=2)
def i3_sort_paging(ctx: Ctx):
    """ORDER BY LastChapterAt DESC, StoryId DESC: no index (Sort) vs an index in that order with OFFSET and with
    keyset paging, for the first page and the page in the middle of the list."""
    ok = True
    for n in SIZES:
        table = dataset.story_table(ctx, n)
        rows = dataset.rows(ctx, n)
        ordered = [r["StoryId"] for r in redisidx.newest_first(rows)]
        by_id = {r["StoryId"]: r for r in rows}
        offset_sql = common.query_text(ctx, "i3_page_offset", table)
        keyset_sql = common.query_text(ctx, "i3_page_keyset", table)
        pages = picks.page_offsets(len(ordered), (0, 50), PAGE)
        lines = []
        for variant, defs in (("no_index", ()), ("index_offset", (IX_PUBLIC_LAST,))):
            with common.indexes(ctx, table, *defs, label=label(variant, n)):
                for p, off in pages:
                    want = ordered[off:off + PAGE]
                    lbl = label(f"{variant}/p{p}", n)
                    ok &= common.equal_lists(ctx, want, common.id_list(ctx, offset_sql, off), lbl)
                    m = common.measure(ctx, lbl, offset_sql, I3_COLUMNS, off)
                    lines.append(f"{variant} trang {p}%: {m.logical_reads} trang, sort={m.has_sort}, "
                                 f"p50 {m.stats.p50:.3f} ms")
                    if defs and off > 0:
                        last = by_id[ordered[off - 1]]
                        params = (last["LastChapterAt"], last["LastChapterAt"], last["StoryId"])
                        lbl = label(f"index_keyset/p{p}", n)
                        ok &= common.equal_lists(ctx, want, common.id_list(ctx, keyset_sql, *params), lbl)
                        k = common.measure(ctx, lbl, keyset_sql, I3_COLUMNS, *params)
                        lines.append(f"keyset trang {p}%: {k.logical_reads} trang, p50 {k.stats.p50:.3f} ms")
        ctx.observe(f"{num(n)} truyện, {len(ordered)} trong danh sách: " + "; ".join(lines) + ".")
    ctx.check(ok, "I3: mọi trang đúng 20 truyện, đúng thứ tự, ở mọi biến thể")


# --- I4 filtered index -----------------------------------------------------------------------------
IX_PUBLIC_LAST_FILTERED = Index("IX_Public_Last_Filtered", key=("LastChapterAt DESC", "StoryId DESC"),
                                include=("Title", "ChapterCount"),
                                where="PublishStatus = 'PUBLISHED' AND IsDeleted = 0")


@scenario(title="I4 Filtered index: index chỉ chứa truyện công khai", pair="i4_filtered", repeat=10, warmup=2)
def i4_filtered(ctx: Ctx):
    """Page 1 of the list with the full index of I3 vs a filtered index on the public stories (size, pages)."""
    ok = True
    for n in SIZES:
        table = dataset.story_table(ctx, n)
        want = [r["StoryId"] for r in redisidx.newest_first(dataset.rows(ctx, n))][:PAGE]
        sql = common.query_text(ctx, "i3_page_offset", table)
        lines = []
        for variant, idx in (("full_index", IX_PUBLIC_LAST), ("filtered", IX_PUBLIC_LAST_FILTERED)):
            lbl = label(variant, n)
            with common.indexes(ctx, table, idx, label=lbl):
                size = common.index_size(ctx, table, idx.name, lbl)
                ok &= common.equal_lists(ctx, want, common.id_list(ctx, sql, 0), lbl)
                m = common.measure(ctx, lbl, sql, I3_COLUMNS, 0)
            lines.append(f"{variant}: " + (f"index {size['rows']} dòng, {size['used_pages']} trang; " if size else "")
                         + f"đọc {m.logical_reads} trang, p50 {m.stats.p50:.3f} ms ({m.describe()})")
        ctx.observe(f"{num(n)} truyện: " + "; ".join(lines) + ".")
    ctx.check(ok, "I4: index đầy đủ và filtered index cho cùng trang 1")


# --- I5 full-text search ---------------------------------------------------------------------------
I5_COLUMNS = {"StoryId": ("s.StoryId", "INT"), "Title": ("s.Title", "NVARCHAR(300)")}
I5_PLAIN_COLUMNS = {"StoryId": "INT", "Title": "NVARCHAR(300)"}


def _score(ctx: Ctx, lbl: str, found: set[int], expected: set[int]) -> float:
    recall, precision = textsearch.recall_precision(found, expected)
    ctx.metric("results", len(found), "truyện", label=lbl, better="none")
    ctx.metric("recall_pct", 100 * recall, "%", label=lbl, better="higher")
    ctx.metric("precision_pct", 100 * precision, "%", label=lbl, better="higher")
    return recall


@scenario(title="I5 Tìm kiếm toàn văn: LIKE so với full-text CONTAINSTABLE", pair="i5_fulltext",
          repeat=10, warmup=2)
def i5_fulltext(ctx: Ctx):
    """A common accented word and the same word without diacritics: LIKE '%w%' (scan) and, when the instance
    allows it, CONTAINSTABLE '"w*"' on a full-text index. Results are scored against textsearch.reference."""
    env = dataset.environment(ctx)
    fulltext_ok = all(env.get(k) for k in ("fulltext_installed", "novelle_catalog_exists", "catalog_references"))
    lcid = 1066 if env.get("vietnamese_word_breaker") else 0
    base, _ = dataset.source(ctx)
    terms = textsearch.choose_terms(base)
    terms = {"common": terms["common"], "unaccented": terms["unaccented"]}
    ctx.observe(f"Từ khoá: '{terms['common']}' và gõ không dấu '{terms['unaccented']}'. Full-text: "
                + (f"có, word breaker lcid {lcid}." if fulltext_ok else "không dùng được trên instance này."))
    ok = True
    for n in SIZES:
        table = dataset.copy_of(ctx, n, "Ft")
        rows = dataset.rows(ctx, n)
        like_sql = common.query_text(ctx, "i5_like", table)
        ft_sql = common.query_text(ctx, "i5_fulltext", table)
        lines = []
        for kind, term in terms.items():
            expected = textsearch.reference(rows, term)
            lbl = label(f"like/{kind}", n)
            pattern = f"%{term}%"
            found = common.ids(ctx, like_sql, pattern, pattern)
            recall = _score(ctx, lbl, found, expected)
            if kind == "common":       # every story that contains the exact word must be found
                exact = {r["StoryId"] for r in rows if term in textsearch.doc_text(r).lower()}
                ok &= common.equal_sets(ctx, exact, found & exact, lbl)
            m = common.measure(ctx, lbl, like_sql, I5_PLAIN_COLUMNS, pattern, pattern)
            lines.append(f"LIKE '%{term}%': recall {recall:.0%}, {m.logical_reads} trang, p50 {m.stats.p50:.2f} ms")
        if fulltext_ok:
            common.create_fulltext(ctx, table, f"PK_{ctx.scenario.topic}__StoryFt_{n}", lcid, label("fulltext", n))
            for kind, term in terms.items():
                lbl = label(f"fulltext/{kind}", n)
                condition = f'"{term}*"'
                recall = _score(ctx, lbl, common.ids(ctx, ft_sql, condition), textsearch.reference(rows, term))
                m = common.measure(ctx, lbl, ft_sql, I5_COLUMNS, condition)
                lines.append(f"CONTAINSTABLE {condition}: recall {recall:.0%}, p50 {m.stats.p50:.2f} ms")
            common.reset_indexes(ctx, table)
        ctx.observe(f"{num(n)} truyện: " + "; ".join(lines) + ".")
    ctx.check(ok, "I5: LIKE '%từ%' tìm thấy mọi truyện chứa đúng từ khoá phổ biến (có dấu)")


# --- I7 write cost ----------------------------------------------------------------------------------
UX_SLUG = Index("UX_Slug", key=("Slug",), unique=True)
I7_SETS = {0: (), 3: (IX_RATING, IX_AUTHOR, UX_SLUG)}
I7_OPS = ("insert", "update_rating")
# A single-row write is faster than the ~1 ms step of SYSDATETIME on RDS: each sample runs it 50 times in one
# batch. Both statements are repeatable (sql/i7_*.sql); the inserted rows are deleted after each set.
WRITE_INNER = 50


@scenario(title="I7 Chi phí của index: INSERT / UPDATE khi có 0 và 3 index", pair="i7_write_cost",
          repeat=10, warmup=2)
def i7_write_cost(ctx: Ctx):
    """On the 1.000-story copy: the same INSERT and UPDATE RatingAvg with no secondary index and with three
    (RatingAvg, AuthorId, unique Slug); server time and pages touched, plus the size of the three indexes."""
    n = LARGEST
    table = dataset.copy_of(ctx, n, "W")
    story = picks.write_target(dataset.rows(ctx, n))
    reads: dict[tuple[str, int], int] = {}
    lines = []
    for k, defs in I7_SETS.items():
        with common.indexes(ctx, table, *defs, label=label(f"indexes_{k}", n)):
            for d in defs:
                common.index_size(ctx, table, d.name, label(f"index/{d.name}", n))
            for op in I7_OPS:
                lbl = label(f"{op}/indexes_{k}", n)
                sql = common.query_text(ctx, f"i7_{op}", table)
                stats = ctx.bench_sql(lbl, sql, story["StoryId"], inner=WRITE_INNER,
                                      note=f"{WRITE_INNER} lần ghi trong 1 batch, chia {WRITE_INNER}")
                reads[(op, k)] = ctx.inspect_sql(lbl, sql, story["StoryId"]).logical_reads
                lines.append(f"{op} với {k} index: p50 {stats.p50:.3f} ms, {reads[(op, k)]} trang")
            ctx.sql.exec(f"DELETE FROM {table} WHERE StoryId > ?", n)
    ctx.observe(f"Truyện {story['StoryId']}, {num(n)} truyện: " + "; ".join(lines) + ".")
    ctx.check(reads[("insert", 3)] > reads[("insert", 0)],
              "I7: INSERT phải ghi thêm vào mỗi index phụ, nên đọc nhiều trang hơn khi có 3 index")
