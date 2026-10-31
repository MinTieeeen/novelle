"""Redis side of __TOPIC_ID__. Keys live in lab:__TOPIC_ID__:* and are deleted after the topic."""
from lab.framework import Ctx, fixtures, scenario


@scenario(title="TODO: tên thí nghiệm", pair="first_pair")
def first_pair(ctx: Ctx):
    rows = ctx.sql.query("SELECT StoryId, Title, PublishStatus FROM dbo.Story")
    fixtures.load_hashes(ctx.redis, rows, "story", "StoryId")     # lab:__TOPIC_ID__:story:<id>
    key = ctx.redis.key("story", rows[0]["StoryId"])

    stats = ctx.bench_redis("baseline", lambda r: r.hgetall(key))  # fn phải dùng client `r` được truyền vào
    ctx.inspect_redis_key("baseline", key)                         # type, encoding, MEMORY USAGE

    ctx.check(stats.count > 0, "đo được thời gian")
    ctx.observe("TODO: nhận xét của bạn về kết quả.")
