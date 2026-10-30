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

    rows = ctx.sql.query(sql)
    ctx.check(len(rows) == 10, "trả về 10 truyện")
    ctx.check(all(a["RatingAvg"] >= b["RatingAvg"] for a, b in zip(rows, rows[1:])), "đúng thứ tự giảm dần")
    ctx.observe("Không có index trên RatingAvg nên SQL Server phải quét bảng rồi sắp xếp (TOP N sort).")
