"""SQL Server side of query_processing: for each query, the execution plan the optimizer picks on copies
of the web data with 150 / 1k / 10k rows (see scale.py), and how that plan changes as the rows grow.

Recorded per size: the plan operators, the conditions used to seek vs checked row by row, estimated vs
actual rows, pages read and the server-side time. The timing version assigns the result to variables
instead of returning rows: the plan is the same, but the server does not wait for the network.
"""
import re
from decimal import Decimal

from lab.framework import Ctx, scenario

from . import plans
from .scale import SIZES, label, median_author, num, popular_genre, story_table, tables, view_window


def timing_version(sql: str, columns: dict[str, str | tuple[str, str]]) -> str:
    """Same query, but SELECT @c = expr ... into variables.
    columns: name -> SQL type, or name -> (expression, SQL type) when the expression is not the name."""
    cols = {c: (v if isinstance(v, tuple) else (c, v)) for c, v in columns.items()}
    declare = "DECLARE " + ", ".join(f"@{c} {t}" for c, (_, t) in cols.items()) + ";\n"
    assign = "SELECT " + ", ".join(f"@{c} = {e}" for c, (e, _) in cols.items())
    return declare + re.sub(r"SELECT\s+.*?\s+FROM", assign + "\nFROM", sql, count=1, flags=re.S)


def run_size(ctx: Ctx, lbl: str, sql: str, columns: dict[str, str], *params) -> tuple[list, object]:
    """Time the query, read its plan, record the plan numbers. Returns (plan steps, inspection)."""
    ctx.bench_sql(lbl, timing_version(sql, columns), *params)
    info = ctx.inspect_sql(lbl, sql, *params)
    shown = {f"@P{i + 1}": repr(p) if isinstance(p, str) else str(p) for i, p in enumerate(params)}
    plan = plans.steps(info.plan_xml[0], shown)
    ctx.metric("estimated_rows", plan[0].estimated_rows, "dòng", label=lbl, better="none")
    ctx.metric("actual_rows", info.rows, "dòng", label=lbl, better="none")
    ctx.metric("rows_read", plans.rows_read(plan), "dòng", label=lbl, better="none",
               note="dòng bảng / index phải xem trước khi kiểm tra các điều kiện còn lại")
    return plan, info


def extras(plan: list) -> str:
    ops = [s.op for s in plan]
    text = ", rồi sắp xếp (Sort)" if "Sort" in ops else ""
    return text + (", đủ 20 truyện thì dừng (Top)" if "Top" in ops else "")


def plan_changes(ctx: Ctx, kinds: dict[int, str]) -> None:
    changes = [f"từ {num(a)} lên {num(b)} truyện, đổi từ {kinds[a]} sang {kinds[b]}"
               for a, b in zip(SIZES, SIZES[1:]) if kinds[a] != kinds[b]]
    ctx.observe(("Plan đổi: " + "; ".join(changes) + ".") if changes else "Plan không đổi ở cả ba kích thước.")


def kind(plan: list) -> str:
    """The part of the plan that changes with the data size, in plain words."""
    seek = next((s for s in plan if s.op == "Index Seek"), None)
    scan = next((s for s in plan if s.op == "Index Scan"), None)
    return (f"tra index {seek.index}" if seek else f"quét index {scan.index}" if scan else "quét cả bảng")


# --- (d) single condition ------------------------------------------------------------------------
SINGLE_COLUMNS = {"StoryId": "INT", "Title": "NVARCHAR(300)", "Slug": "VARCHAR(350)",
                  "CompletionStatus": "VARCHAR(10)", "ChapterCount": "INT", "RatingAvg": "DECIMAL(3,2)",
                  "LastChapterAt": "DATETIME2(3)"}


@scenario(title="Truy vấn một điều kiện: truyện của một tác giả", pair="single_condition", repeat=10)
def single_condition(ctx: Ctx):
    template = ctx.read("sql/single_condition.sql")
    author = median_author(ctx)
    kinds: dict[int, str] = {}
    for n in SIZES:
        table = story_table(ctx, n)
        expected = ctx.sql.scalar(f"SELECT COUNT(*) FROM {table} WHERE AuthorId = ?", author)
        plan, info = run_size(ctx, label("author", n), template.format(table=table), SINGLE_COLUMNS, author)
        kinds[n] = kind(plan)
        ctx.check(info.rows == expected, f"{num(n)} truyện: trả về đúng {expected} truyện của tác giả {author}")
        ctx.observe(f"{num(n)} truyện: {plans.access(plan)}{extras(plan)}. Đọc {info.logical_reads} trang. "
                    f"Dự đoán {plan[0].estimated_rows:.0f} truyện, thực tế {info.rows}.")

    plan_changes(ctx, kinds)
    ctx.observe("Vì sao: bảng nhỏ thì quét hết vài trang vẫn rẻ; bảng lớn mà chỉ cần vài truyện thì tra index "
                "rẻ hơn nhiều. Câu SQL không đổi, SQL Server tự chọn cách rẻ hơn. Sort là do ORDER BY "
                "LastChapterAt: các truyện tìm được không nằm sẵn theo thứ tự đó.")


# --- (e) composite condition ---------------------------------------------------------------------
COMPOSITE_COLUMNS = {"StoryId": "INT", "Title": "NVARCHAR(300)", "Slug": "VARCHAR(350)",
                     "RatingAvg": "DECIMAL(3,2)", "ChapterCount": "INT"}
COMPOSITE_PARAMS = ("COMPLETED", Decimal("4.00"), 20)       # status, minimum rating, minimum chapters


@scenario(title="Truy vấn nhiều điều kiện: lọc truyện theo trạng thái, rating, số chương",
          pair="composite_condition", repeat=10)
def composite_condition(ctx: Ctx):
    template = ctx.read("sql/composite_condition.sql")
    status, min_rating, min_chapters = COMPOSITE_PARAMS
    kinds: dict[int, str] = {}
    for n in SIZES:
        table = story_table(ctx, n)
        matching = ctx.sql.scalar(
            f"SELECT COUNT(*) FROM {table} WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0 "
            "AND CompletionStatus = ? AND RatingAvg >= ? AND ChapterCount >= ?", *COMPOSITE_PARAMS)
        plan, info = run_size(ctx, label("search", n), template.format(table=table), COMPOSITE_COLUMNS,
                              *COMPOSITE_PARAMS)
        kinds[n] = kind(plan)
        ctx.check(info.rows == min(20, matching), f"{num(n)} truyện: trả về {min(20, matching)} truyện "
                                                  f"(trang đầu của {matching} truyện khớp)")
        seek = " AND ".join(plans.seek_predicates(plan)) or "không có"
        residual = " AND ".join(plans.residual_predicates(plan)) or "không có"
        ctx.observe(f"{num(n)} truyện ({matching} khớp): {plans.access(plan)}{extras(plan)}. "
                    f"Dùng để tra index (Seek Predicate): {seek}. "
                    f"Kiểm tra lại từng dòng (Residual Predicate): {residual}. "
                    f"Xem {plans.rows_read(plan):.0f} dòng để lấy {info.rows}; đọc {info.logical_reads} trang. "
                    f"Dự đoán {plan[0].estimated_rows:.0f} dòng, thực tế {info.rows}.")

    plan_changes(ctx, kinds)
    ctx.observe("Vì sao: một index chỉ giúp tra nhanh theo cột của nó. Schema web có index trên RatingAvg "
                "nhưng không có index trên CompletionStatus hay ChapterCount, nên chỉ điều kiện rating có thể "
                "thành Seek Predicate; các điều kiện còn lại phải kiểm tra lại trên từng truyện tìm được. "
                "Bảng nhỏ thì quét hết rồi sắp xếp vẫn rẻ. Bảng lớn thì đi theo index rating từ cao xuống, "
                "kiểm tra từng truyện, đủ 20 truyện thì dừng, nên chỉ phải xem vài chục truyện.")
    ctx.observe("Chi tiết: CONVERT(nvarchar, CompletionStatus) trong plan là do cột kiểu VARCHAR còn tham số "
                "được driver gửi dạng NVARCHAR (Unicode), nên SQL Server phải đổi kiểu cột rồi mới so sánh.")


# --- (f) join --------------------------------------------------------------------------------------
JOIN_COLUMNS = {"StoryId": ("s.StoryId", "INT"), "Title": ("s.Title", "NVARCHAR(300)"),
                "Slug": ("s.Slug", "VARCHAR(350)"), "LastChapterAt": ("s.LastChapterAt", "DATETIME2(3)"),
                "PenName": ("a.PenName", "NVARCHAR(100)"), "GenreName": ("g.Name", "NVARCHAR(50)")}


def table_reads(plan: list) -> str:
    """How each table is read, e.g. "Genre: Clustered Index Scan; StoryGenre: Index Seek[IX_StoryGenre_Genre]"."""
    parts = []
    for s in plan:
        if s.table and s.op != "Key Lookup":
            lookup = " + Key Lookup" if s.op in ("Index Seek", "Index Scan") and any(
                x.op == "Key Lookup" and x.table == s.table for x in plan) else ""
            parts.append(f"{s.table}: {s.op}{f' [{s.index}]' if s.index else ''}{lookup}")
    return "; ".join(dict.fromkeys(parts))


@scenario(title="Truy vấn có join: trang thể loại (thể loại + truyện + tác giả)", pair="join", repeat=10)
def join(ctx: Ctx):
    template = ctx.read("sql/join.sql")
    genre = popular_genre(ctx)
    kinds: dict[int, str] = {}
    for n in SIZES:
        names = tables(ctx, n)
        sql = template.format(**names)
        matching = ctx.sql.scalar(
            f"SELECT COUNT(*) FROM {names['story_genre']} sg JOIN {names['story']} s ON s.StoryId = sg.StoryId "
            "WHERE sg.GenreId = ? AND s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0", genre["GenreId"])
        plan, info = run_size(ctx, label("genre_page", n), sql, JOIN_COLUMNS, genre["Slug"])
        join_list = plans.joins(plan)
        kinds[n] = " + ".join(j.split(" (")[0] for j in join_list) or "không join"
        ctx.check(info.rows == min(20, matching), f"{num(n)} truyện: trả về {min(20, matching)} truyện "
                                                  f"(trang đầu của {matching} truyện thể loại {genre['Name']})")
        ctx.observe(f"{num(n)} truyện ({matching} truyện thể loại {genre['Name']}): "
                    f"các phép join {'; '.join(join_list)}. Cách đọc từng bảng: {table_reads(plan)}"
                    f"{extras(plan)}. Đọc {info.logical_reads} trang. "
                    f"Dự đoán {plan[0].estimated_rows:.0f} dòng, thực tế {info.rows}.")

    plan_changes(ctx, kinds)
    ctx.observe("Vì sao đổi sang Hash Match khi ghép Story: Nested Loops tra bảng Story một lần cho mỗi truyện "
                "của thể loại (khoảng 2 trang mỗi lần), nên tốn công theo số truyện cần lấy. Hash Match ghi danh "
                "sách mã truyện vào một bảng băm trong bộ nhớ rồi đọc cả bảng Story một lượt, nên tốn công theo "
                "kích thước bảng, cộng thêm phần chuẩn bị cố định (xin bộ nhớ, dựng bảng băm). Ít truyện (19, 129) "
                "thì tra từng cái vẫn rẻ hơn phần chuẩn bị đó. Nhiều truyện (1.269) thì tra từng cái tốn khoảng "
                "2.500 trang đọc rời rạc, trong khi đọc cả bảng chỉ 736 trang, nên optimizer chuyển sang Hash Match.")
    ctx.observe("Vì sao hai phép join còn lại vẫn là Nested Loops: thuật toán được chọn riêng cho từng phép join, "
                "theo số dòng đi vào phép join đó, không theo kích thước bảng. Genre với StoryGenre chỉ có 1 dòng "
                "vào (một thể loại): một lần tra index là ra mọi truyện của thể loại. Author được ghép sau cùng, sau "
                "khi đã sắp xếp và lấy 20 truyện, nên chỉ còn 20 lần tra; optimizer tự đổi thứ tự công việc để "
                "phép join này nhỏ.")


# --- (g) subquery ----------------------------------------------------------------------------------
SUBQUERY_COLUMNS = {"StoryId": ("s.StoryId", "INT"), "Title": ("s.Title", "NVARCHAR(300)"),
                    "Slug": ("s.Slug", "VARCHAR(350)"), "AuthorId": ("s.AuthorId", "INT"),
                    "RatingAvg": ("s.RatingAvg", "DECIMAL(3,2)")}


def aggregate_text(plan: list) -> str:
    """Each aggregate of the plan with how many times it ran, e.g. "Stream Aggregate chạy 1 lần, ra 33 dòng"."""
    parts = []
    for a in plans.aggregates(plan):
        runs = "?" if a.executions is None else f"{a.executions:.0f}"
        rows = "?" if a.actual_rows is None else f"{a.actual_rows:.0f}"
        parts.append(f"{a.op} chạy {runs} lần, ra {rows} dòng")
    return "; ".join(parts) or "không có bước gom nhóm"


@scenario(title="Truy vấn có subquery: truyện có rating cao hơn trung bình của tác giả", pair="subquery",
          repeat=10)
def subquery(ctx: Ctx):
    template = ctx.read("sql/subquery.sql")
    kinds: dict[int, str] = {}
    for n in SIZES:
        table = story_table(ctx, n)
        matching = ctx.sql.scalar(
            f"SELECT COUNT(*) FROM {table} s WHERE s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0 "
            f"AND s.RatingAvg > (SELECT AVG(s2.RatingAvg) FROM {table} s2 WHERE s2.AuthorId = s.AuthorId "
            "AND s2.PublishStatus = 'PUBLISHED' AND s2.IsDeleted = 0)")
        plan, info = run_size(ctx, label("standout", n), template.format(story=table), SUBQUERY_COLUMNS)
        strategy, kinds[n] = subquery_strategy(plan)
        ctx.check(info.rows == min(20, matching), f"{num(n)} truyện: trả về {min(20, matching)} truyện "
                                                  f"(trang đầu của {matching} truyện vượt trung bình tác giả)")
        ctx.observe(f"{num(n)} truyện ({matching} truyện vượt trung bình tác giả): {strategy} "
                    f"Gom nhóm: {aggregate_text(plan)}. Đọc {info.logical_reads} trang "
                    f"(gồm cả trang của bảng tạm Table Spool). Dự đoán {plan[0].estimated_rows:.0f} dòng, "
                    f"thực tế {info.rows}.")

    plan_changes(ctx, kinds)
    ctx.observe("Vì sao: viết theo nghĩa đen thì subquery phải tính lại trung bình cho từng truyện. Optimizer "
                "không làm vậy ở mức nào: nó viết lại để mỗi tác giả chỉ được tính trung bình một lần. Bảng nhỏ "
                "thì sắp xếp cả bảng theo tác giả rồi xử lý từng nhóm là rẻ. Bảng lớn thì sắp xếp cả bảng tốn "
                "kém, nên optimizer tính trung bình mọi tác giả bằng bảng băm (không cần sắp xếp) và tận dụng "
                "index rating có sẵn để khỏi sắp xếp kết quả: đi từ rating cao xuống, đủ 20 truyện thì dừng.")


def subquery_strategy(plan: list) -> tuple[str, str]:
    """(How the correlated subquery was executed in plain words, short name for plan_changes)."""
    ops = [s.op for s in plan]
    aggs = plans.aggregates(plan)
    if "Segment" in ops and any(a.op == "Stream Aggregate" for a in aggs):
        runs = next((a.executions for a in aggs if a.op == "Stream Aggregate"), None)
        runs = "?" if runs is None else f"{runs:.0f}"
        return (f"Đọc bảng một lần, sắp xếp theo tác giả, rồi xử lý từng nhóm tác giả: giữ tạm các truyện của "
                f"nhóm (Table Spool), tính trung bình một lần cho nhóm (Stream Aggregate, {runs} lần) và so từng "
                "truyện của nhóm với con số đó; cuối cùng sắp xếp theo rating và lấy 20 truyện (Sort).",
                "tính trung bình theo từng nhóm tác giả (Segment + Stream Aggregate)")
    if any(a.op == "Hash Match" for a in aggs):
        ordered = next((s for s in plan if s.op in ("Index Scan", "Index Seek") and "Rating" in s.index), None)
        walk = (f"đi theo index {ordered.index} từ rating cao xuống, lấy thông tin từng truyện (Key Lookup), "
                "so với trung bình của tác giả, đủ 20 truyện thì dừng (Top), không cần sắp xếp."
                if ordered else "so từng truyện với trung bình của tác giả.")
        return ("Tính trung bình của mọi tác giả trong một lượt đọc bảng (Hash Match Aggregate) và giữ tạm kết "
                f"quả (Table Spool); sau đó {walk}",
                "tính trung bình mọi tác giả một lần (Hash Match Aggregate)")
    return f"Plan: {plans.shape(plan)}.", plans.shape(plan)


# --- (h) aggregate ---------------------------------------------------------------------------------
AGGREGATE_COLUMNS = {"ViewDate": ("v.ViewDate", "DATE"), "TotalViews": ("SUM(v.Views)", "INT"),
                     "StoriesViewed": ("COUNT(*)", "INT"), "MaxViewsOneStory": ("MAX(v.Views)", "INT")}


def aggregate_strategy(plan: list) -> tuple[str, str]:
    """(How the GROUP BY was computed in plain words, short name for plan_changes)."""
    ops = [s.op for s in plan]
    aggs = plans.aggregates(plan)
    reads = table_reads(plan)
    parallel = " Việc được chia cho nhiều luồng CPU (Parallelism)." if "Parallelism" in ops else ""
    if any(a.op == "Hash Match" for a in aggs):
        sort = " rồi sắp xếp các ngày (Sort)" if "Sort" in ops else ""
        return (f"Đọc {reads}. Gom nhóm bằng bảng băm (Hash Match Aggregate): mỗi ngày một ô trong bộ nhớ, đọc "
                f"dòng nào cộng vào ô của ngày đó{sort}.{parallel}", "Hash Match Aggregate")
    if any(a.op == "Stream Aggregate" for a in aggs):
        if "Sort" in ops:
            return (f"Đọc {reads}, sắp xếp theo ngày (Sort), rồi cộng dồn từng ngày (Stream Aggregate).{parallel}",
                    "Sort + Stream Aggregate")
        return (f"Đọc {reads}: dữ liệu ra đã xếp theo ngày, nên cộng dồn lần lượt từng ngày (Stream Aggregate), "
                f"không cần sắp xếp.{parallel}", "Stream Aggregate (không Sort)")
    return f"Plan: {plans.shape(plan)}.", plans.shape(plan)


@scenario(title="Truy vấn tổng hợp: lượt xem toàn trang theo ngày trong 30 ngày", pair="aggregate", repeat=10)
def aggregate(ctx: Ctx):
    template = ctx.read("sql/aggregate.sql")
    first, after = view_window(ctx)
    kinds: dict[int, str] = {}
    for n in SIZES:
        names = tables(ctx, n)
        in_window = ctx.sql.scalar(f"SELECT COUNT(*) FROM {names['view_daily']} WHERE ViewDate >= ? AND ViewDate < ?",
                                   first, after)
        total = ctx.sql.scalar(f"SELECT COUNT(*) FROM {names['view_daily']}")
        plan, info = run_size(ctx, label("daily_views", n), template.format(**names), AGGREGATE_COLUMNS, first, after)
        strategy, kinds[n] = aggregate_strategy(plan)
        ctx.check(info.rows == (after - first).days, f"{num(n)} truyện: trả về {(after - first).days} ngày")
        ctx.observe(f"{num(n)} truyện ({num(total)} dòng lượt xem, {num(in_window)} dòng trong 30 ngày): "
                    f"{strategy} Gom nhóm: {aggregate_text(plan)}. Đọc {info.logical_reads} trang. "
                    f"Dự đoán {plan[0].estimated_rows:.0f} dòng, thực tế {info.rows}.")

    plan_changes(ctx, kinds)
    ctx.observe("Vì sao plan không đổi: index IX_StoryViewDaily_Date của web xếp sẵn các dòng theo ngày và chứa "
                "luôn cột Views, nên SQL Server chỉ cần tra đúng khoảng 30 ngày trong index, đọc ra các dòng đã "
                "theo thứ tự ngày, và cộng dồn từng ngày (Stream Aggregate). Cách này không cần sắp xếp, không cần "
                "xin bộ nhớ cho bảng băm, nên rẻ nhất ở mọi kích thước. Nhưng muốn tính tổng thì vẫn phải đọc "
                "từng dòng trong 30 ngày: số dòng tăng từ 4 nghìn lên 270 nghìn thì số trang đọc và thời gian "
                "cũng tăng theo.")
