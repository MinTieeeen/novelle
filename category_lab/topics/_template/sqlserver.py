"""SQL Server side of __TOPIC_ID__. Each @scenario is one experiment; see topics/t0_example for more."""
from lab.framework import Ctx, scenario


@scenario(title="TODO: tên thí nghiệm", pair="first_pair")
def first_pair(ctx: Ctx):
    # Bảng tạm của topic: lab.__TOPIC_ID____Story (tự xoá sau khi chạy). Dùng nó khi tạo index hoặc sửa dữ liệu.
    table = ctx.sandbox_table("Story", "dbo.Story", primary_key=["StoryId"])
    sql = f"SELECT COUNT(*) FROM {table} WHERE PublishStatus = ?"   # hoặc ctx.read("sql/ten_file.sql")

    stats = ctx.bench_sql("baseline", sql, "PUBLISHED")           # thời gian xử lý phía server
    ctx.inspect_sql("baseline", sql, "PUBLISHED")                 # logical reads + execution plan

    ctx.check(stats.count > 0, "đo được thời gian")
    ctx.observe("TODO: nhận xét của bạn về kết quả.")
