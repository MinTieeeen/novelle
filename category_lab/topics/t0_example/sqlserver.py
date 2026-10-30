"""SQL Server side of the example topic."""
from lab.framework import Ctx, scenario


@scenario(title="Lấy 1 truyện theo StoryId", pair="story_by_id")
def story_by_id(ctx: Ctx):
    story_id = ctx.sql.scalar("SELECT MIN(StoryId) FROM dbo.Story WHERE PublishStatus = 'PUBLISHED'")
    sql = ctx.read("sql/story_by_id.sql")

    stats = ctx.bench_sql("pk_seek", sql, story_id)

    row = ctx.sql.query(sql, story_id)
    ctx.check(len(row) == 1, f"tìm thấy đúng 1 truyện StoryId={story_id}")
    ctx.observe(f"Truy vấn theo khoá chính PK_Story (clustered): p50 {stats.p50:.3f} ms phía server.")


@scenario(title="Top 10 truyện rating cao nhất", pair="top_rated")
def top_rated(ctx: Ctx):
    sql = ctx.read("sql/top_rated.sql")

    ctx.bench_sql("order_by_top10", sql)
    info = ctx.inspect_sql("order_by_top10", sql)          # logical reads + actual execution plan

    rows = ctx.sql.query(sql)
    ctx.check(len(rows) == 10, "trả về 10 truyện")
    ctx.check(all(a["RatingAvg"] >= b["RatingAvg"] for a, b in zip(rows, rows[1:])), "đúng thứ tự giảm dần")
    ctx.check("Top N Sort" in info.plan.physical_ops() or "Sort" in info.plan.physical_ops(),
              "plan có bước sắp xếp vì không có index trên RatingAvg")
    ctx.observe(f"Plan: {' → '.join(info.plan.physical_ops())}; {info.logical_reads} logical reads. "
                "Không có index trên RatingAvg nên phải quét bảng rồi sắp xếp.")


VIEWS_WORKERS, VIEWS_EACH = 10, 20


@scenario(title="10 phiên cùng tăng lượt xem", pair="view_counter")
def view_counter(ctx: Ctx):
    table = ctx.sandbox_table("Story", "dbo.Story", top=1, primary_key=["StoryId"])
    story_id = ctx.sql.scalar(f"SELECT StoryId FROM {table}")
    expected = VIEWS_WORKERS * VIEWS_EACH

    def read_then_write(w, i):          # đọc giá trị, cộng 1 ở client, ghi lại: hai phiên có thể đọc cùng giá trị
        v = w.sql.scalar(f"SELECT ViewCount FROM {table} WHERE StoryId = ?", story_id)
        w.sql.exec(f"UPDATE {table} SET ViewCount = ? WHERE StoryId = ?", v + 1, story_id)

    def atomic(w, i):                   # một câu UPDATE: SQL Server giữ khoá X trên dòng trong lúc cộng
        w.sql.exec(f"UPDATE {table} SET ViewCount = ViewCount + 1 WHERE StoryId = ?", story_id)

    for label, fn in (("read_then_write", read_then_write), ("atomic_update", atomic)):
        ctx.sql.exec(f"UPDATE {table} SET ViewCount = 0 WHERE StoryId = ?", story_id)
        r = ctx.workers(VIEWS_WORKERS, fn, iterations=VIEWS_EACH)
        lost = expected - ctx.sql.scalar(f"SELECT ViewCount FROM {table} WHERE StoryId = ?", story_id)
        ctx.metric("lost_updates", lost, "lượt", label=label)
        ctx.metric("errors", len(r.errors), "lỗi", label=label)
        if label == "atomic_update":
            ctx.check(lost == 0, "UPDATE ... SET ViewCount = ViewCount + 1 không mất lượt nào")
    ctx.observe("Lỗi lost update đến từ ứng dụng (đọc-rồi-ghi ngoài transaction), không phải từ DBMS.")
