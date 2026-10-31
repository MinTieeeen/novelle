"""Redis side of the example topic. Data is copied from dbo.Story before measuring.

Keys (namespace lab:example:, deleted automatically after the topic):
  story:{id}   Hash   fields of one story
  story:rating Sorted set  member = StoryId, score = RatingAvg
"""
from lab.framework import Ctx, fixtures, scenario

LOAD_SQL = """
SELECT StoryId, Title, Slug, CompletionStatus, ChapterCount, ViewCount, RatingAvg, RatingCount
FROM dbo.Story WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0
"""


def load_stories(ctx: Ctx) -> list[dict]:
    """Copy published stories from SQL Server into Redis (not timed)."""
    rows = ctx.sql.query(LOAD_SQL)
    fixtures.load_hashes(ctx.redis, rows, "story", "StoryId")
    ctx.redis.zadd(ctx.redis.key("story", "rating"), {str(r["StoryId"]): float(r["RatingAvg"]) for r in rows})
    return rows


@scenario(title="Lấy 1 truyện theo StoryId", pair="story_by_id")
def story_by_id(ctx: Ctx):
    rows = load_stories(ctx)
    story_id = min(r["StoryId"] for r in rows)
    key = ctx.redis.key("story", story_id)

    stats = ctx.bench_redis("hgetall", lambda r: r.hgetall(key))

    ctx.check(ctx.redis.hget(key, "StoryId") == str(story_id), f"Hash của StoryId={story_id} tồn tại")
    info = ctx.inspect_redis_key("story_hash", key)
    ctx.observe(f"Hash {info['length']} field, encoding {info['encoding']}, {info['memory_bytes']} byte.")
    ctx.observe(f"HGETALL trên 1 key: p50 {stats.p50:.3f} ms phía server (O(số field)).")


@scenario(title="Top 10 truyện rating cao nhất", pair="top_rated")
def top_rated(ctx: Ctx):
    load_stories(ctx)
    zkey = ctx.redis.key("story", "rating")

    def top10(r):
        ids = r.zrevrange(zkey, 0, 9)
        pipe = r.pipeline(transaction=False)
        for story_id in ids:
            pipe.hget(r.key("story", story_id), "Title")
        return pipe.execute()

    ctx.bench_redis("zrevrange_plus_titles", top10)

    ctx.check(len(top10(ctx.redis)) == 10, "trả về 10 truyện")
    info = ctx.inspect_redis_key("rating_zset", zkey)
    ctx.observe(f"Sorted set đã sắp sẵn theo score ({info['encoding']}, {info['length']} phần tử), "
                "ZREVRANGE là O(log N + 10); thêm 10 HGET để lấy tên truyện.")


VIEWS_WORKERS, VIEWS_EACH = 10, 20


@scenario(title="10 phiên cùng tăng lượt xem", pair="view_counter")
def view_counter(ctx: Ctx):
    expected = VIEWS_WORKERS * VIEWS_EACH

    def read_then_write(w, i):          # GET rồi SET: giữa hai lệnh, phiên khác có thể đã ghi
        k = w.redis.key("views", "story", 1)
        w.redis.set(k, int(w.redis.get(k)) + 1)

    def atomic(w, i):                   # INCR: Redis chạy lệnh trên một luồng, đọc-cộng-ghi là nguyên tử
        w.redis.incr(w.redis.key("views", "story", 1))

    key = ctx.redis.key("views", "story", 1)
    ctx.statement("read_then_write", f"GET {key}\n# ứng dụng cộng 1 ở phía client rồi ghi lại:\nSET {key} <giá trị đọc được + 1>")
    ctx.statement("atomic_update", f"INCR {key}")
    for label, fn in (("read_then_write", read_then_write), ("atomic_update", atomic)):
        ctx.redis.set(key, 0)
        r = ctx.workers(VIEWS_WORKERS, fn, iterations=VIEWS_EACH)
        lost = expected - int(ctx.redis.get(key))
        ctx.metric("lost_updates", lost, "lượt", label=label)
        ctx.metric("errors", len(r.errors), "lỗi", label=label)
        if label == "atomic_update":
            ctx.check(lost == 0, "INCR không mất lượt nào")
    ctx.observe("INCR nguyên tử vì Redis thực thi lệnh tuần tự; GET+SET thì không.")
