"""Redis side of query_processing. Redis has no query optimizer: for each query the steps are the
commands written here, always the same whatever the data size. Data: the same 150 / 1k / 10k copies
the SQL side uses (see scale.py).

Keys (namespace lab:query_processing:, deleted after the topic):
  s<n>:story:<id>              Hash        one story of the n-row copy
  s<n>:author:<id>:stories     Sorted set  StoryIds of one author, score = LastChapterAt (epoch seconds)
  s<n>:by_rating               Sorted set  every StoryId, score = RatingAvg
  s<n>:genre:<id>:stories      Sorted set  public StoryIds of one genre, score = LastChapterAt (epoch)
  s<n>:author_profile:<id>     Hash        PenName of one author
  genre:<id>                   Hash        Name of one genre (genres do not grow with the copies)
  s<n>:loaded, s<n>:join_loaded  String    markers: that part of the copy is already in Redis

Timing: each query runs as one Lua script on the server and returns only counts, like the SQL side,
which assigns the rows to variables instead of sending them.
"""
from datetime import datetime, timedelta

from lab.framework import Ctx, fixtures, scenario

from .scale import SIZES, label, median_author, num, popular_genre, story_table, tables, view_window

FIELDS = ("AuthorId", "Title", "Slug", "CompletionStatus", "PublishStatus", "IsDeleted", "ChapterCount",
          "RatingAvg", "LastChapterAt")


def _epoch(value) -> float:
    return value.timestamp() if isinstance(value, datetime) else 0.0


def load_stories(ctx: Ctx, n: int) -> list[dict]:
    """Copy the n-row Story table into Redis once per run (not timed)."""
    rows = ctx.sql.query(f"SELECT StoryId, {', '.join(FIELDS)} FROM {story_table(ctx, n)}")
    if ctx.redis.get(ctx.redis.key(f"s{n}", "loaded")):
        return rows
    fixtures.load_hashes(ctx.redis, rows, f"s{n}:story", "StoryId")
    pipe = ctx.redis.pipeline(transaction=False)
    for r in rows:
        pipe.zadd(ctx.redis.key(f"s{n}", "author", r["AuthorId"], "stories"), {r["StoryId"]: _epoch(r["LastChapterAt"])})
        pipe.zadd(ctx.redis.key(f"s{n}", "by_rating"), {r["StoryId"]: float(r["RatingAvg"])})
    pipe.set(ctx.redis.key(f"s{n}", "loaded"), 1)
    pipe.execute()
    return rows


# --- (d) single condition ------------------------------------------------------------------------
# F3 author page. Step 1: ZREVRANGE reads the author's ids, newest first. Step 2: HMGET per id.
AUTHOR_STORIES = """
local ids = redis.call('ZREVRANGE', ARGV[1], 0, -1)
for _, id in ipairs(ids) do
  redis.call('HMGET', ARGV[2] .. id, 'Title', 'Slug', 'CompletionStatus', 'ChapterCount', 'RatingAvg', 'LastChapterAt')
end
return #ids
"""


@scenario(title="Truy vấn một điều kiện: truyện của một tác giả", pair="single_condition", repeat=10)
def single_condition(ctx: Ctx):
    author = median_author(ctx)
    for n in SIZES:
        rows = load_stories(ctx, n)
        expected = sum(1 for r in rows if r["AuthorId"] == author)
        zkey = ctx.redis.key(f"s{n}", "author", author, "stories")
        prefix = ctx.redis.key(f"s{n}", "story", "")

        def author_stories(r):
            return r.eval(AUTHOR_STORIES, 0, zkey, prefix)

        ctx.bench_redis(label("author", n), author_stories)
        ctx.metric("actual_rows", expected, "dòng", label=label("author", n), better="none")
        ctx.check(author_stories(ctx.redis) == expected, f"{num(n)} truyện: đúng {expected} truyện của tác giả {author}")
        ctx.observe(f"{num(n)} truyện: {expected + 1} lệnh (1 ZREVRANGE + {expected} HMGET).")

    ctx.statement("steps", f"ZREVRANGE {ctx.redis.key('s<n>', 'author', author, 'stories')} 0 -1\n"
                           "# với mỗi StoryId trả về:\n"
                           f"HMGET {ctx.redis.key('s<n>', 'story', '<id>')} Title Slug CompletionStatus "
                           "ChapterCount RatingAvg LastChapterAt")
    ctx.observe("Redis không tự chọn cách: luôn chạy đúng các bước đã viết sẵn. Bước 1 lấy danh sách truyện "
                "của tác giả, đã xếp sẵn theo ngày cập nhật (ZREVRANGE). Bước 2 lấy thông tin từng truyện "
                "(HMGET). Bảng lớn hay nhỏ thì số lệnh vẫn vậy, chỉ phụ thuộc số truyện của tác giả.")


# --- (e) composite condition ---------------------------------------------------------------------
# F2 search, first page of 20. Step 1: ZREVRANGEBYSCORE walks the stories from the best rating down,
# 50 ids at a time, only those with rating >= the minimum. Step 2: HMGET per id and the other conditions
# are checked in the script. Stops at 20 matches. Returns {matches, stories looked at}.
SEARCH = """
local found, looked, offset = 0, 0, 0
while found < 20 do
  local ids = redis.call('ZREVRANGEBYSCORE', ARGV[1], '+inf', ARGV[3], 'LIMIT', offset, 50)
  if #ids == 0 then break end
  offset = offset + #ids
  for _, id in ipairs(ids) do
    looked = looked + 1
    local f = redis.call('HMGET', ARGV[2] .. id, 'PublishStatus', 'IsDeleted', 'CompletionStatus', 'ChapterCount', 'Title', 'Slug', 'RatingAvg')
    if f[1] == 'PUBLISHED' and f[2] == 'False' and f[3] == ARGV[4] and tonumber(f[4]) >= tonumber(ARGV[5]) then
      found = found + 1
      if found == 20 then break end
    end
  end
end
return {found, looked}
"""
SEARCH_PARAMS = ("COMPLETED", 4.0, 20)       # status, minimum rating, minimum chapters (same as SQL)


@scenario(title="Truy vấn nhiều điều kiện: lọc truyện theo trạng thái, rating, số chương",
          pair="composite_condition", repeat=10)
def composite_condition(ctx: Ctx):
    status, min_rating, min_chapters = SEARCH_PARAMS
    for n in SIZES:
        rows = load_stories(ctx, n)
        matching = sum(1 for r in rows if r["PublishStatus"] == "PUBLISHED" and not r["IsDeleted"]
                       and r["CompletionStatus"] == status and float(r["RatingAvg"]) >= min_rating
                       and r["ChapterCount"] >= min_chapters)
        zkey, prefix = ctx.redis.key(f"s{n}", "by_rating"), ctx.redis.key(f"s{n}", "story", "")

        def search(r):
            return r.eval(SEARCH, 0, zkey, prefix, min_rating, status, min_chapters)

        lbl = label("search", n)
        ctx.bench_redis(lbl, search)
        found, looked = search(ctx.redis)
        ctx.metric("actual_rows", found, "dòng", label=lbl, better="none")
        ctx.metric("rows_read", looked, "dòng", label=lbl, better="none",
                   note="truyện phải xem (HMGET) để tìm đủ 20 truyện khớp")
        ctx.check(found == min(20, matching), f"{num(n)} truyện: trả về {min(20, matching)} truyện "
                                              f"(trang đầu của {matching} truyện khớp)")
        batches = -(-looked // 50)
        ctx.observe(f"{num(n)} truyện ({matching} khớp): xem {looked} truyện để lấy {found}; "
                    f"{batches + looked} lệnh ({batches} ZREVRANGEBYSCORE + {looked} HMGET).")

    ctx.statement("steps", f"ZREVRANGEBYSCORE {ctx.redis.key('s<n>', 'by_rating')} +inf {min_rating} LIMIT <offset> 50\n"
                           "# với mỗi StoryId: đọc các cột rồi tự kiểm tra trong script\n"
                           f"HMGET {ctx.redis.key('s<n>', 'story', '<id>')} PublishStatus IsDeleted "
                           "CompletionStatus ChapterCount Title Slug RatingAvg\n"
                           "# lặp lại cho tới khi đủ 20 truyện khớp")
    ctx.observe("Redis không tự chọn cách: bước 1 đi theo sorted set rating từ cao xuống (chỉ điều kiện rating "
                "được dùng để tìm), bước 2 đọc từng truyện và tự kiểm tra các điều kiện còn lại trong script, đủ "
                "20 truyện thì dừng. Các điều kiện trạng thái, số chương do code tự lọc, giống Residual Predicate "
                "của SQL Server nhưng là do người viết code quyết định.")


# --- (f) join --------------------------------------------------------------------------------------
# F2 genre page. Redis has no join: the code does it. Step 1: ZREVRANGE takes the 20 newest public stories
# of the genre (kept in order at write time). Step 2: HGET the genre name. Step 3: per story, HMGET its
# columns and its AuthorId. Step 4: per story, HGET the author's pen name ("joining" on AuthorId).
GENRE_PAGE = """
local ids = redis.call('ZREVRANGE', ARGV[1], 0, 19)
redis.call('HGET', ARGV[4], 'Name')
for _, id in ipairs(ids) do
  local f = redis.call('HMGET', ARGV[2] .. id, 'Title', 'Slug', 'LastChapterAt', 'AuthorId')
  redis.call('HGET', ARGV[3] .. f[4], 'PenName')
end
return #ids
"""


def load_join(ctx: Ctx, n: int, genre: dict) -> int:
    """Genre sorted set, author profiles and the genre name for the n-story copy (not timed).
    Only public stories go into the genre's sorted set: the application would add a story when it is
    published and remove it when it is hidden or deleted. Returns the number of public stories of the genre."""
    load_stories(ctx, n)
    names = tables(ctx, n)
    rows = ctx.sql.query(
        f"SELECT s.StoryId, s.LastChapterAt FROM {names['story_genre']} sg JOIN {names['story']} s "
        "ON s.StoryId = sg.StoryId WHERE sg.GenreId = ? AND s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0",
        genre["GenreId"])
    if ctx.redis.get(ctx.redis.key(f"s{n}", "join_loaded")):
        return len(rows)
    pipe = ctx.redis.pipeline(transaction=False)
    zkey = ctx.redis.key(f"s{n}", "genre", genre["GenreId"], "stories")
    for r in rows:
        pipe.zadd(zkey, {r["StoryId"]: _epoch(r["LastChapterAt"])})
    for a in ctx.sql.query(f"SELECT UserId, PenName FROM {names['author']}"):
        pipe.hset(ctx.redis.key(f"s{n}", "author_profile", a["UserId"]), "PenName", a["PenName"])
    pipe.hset(ctx.redis.key("genre", genre["GenreId"]), "Name", genre["Name"])
    pipe.set(ctx.redis.key(f"s{n}", "join_loaded"), 1)
    pipe.execute()
    return len(rows)


@scenario(title="Truy vấn có join: trang thể loại (thể loại + truyện + tác giả)", pair="join", repeat=10)
def join(ctx: Ctx):
    genre = popular_genre(ctx)
    for n in SIZES:
        matching = load_join(ctx, n, genre)
        args = (ctx.redis.key(f"s{n}", "genre", genre["GenreId"], "stories"), ctx.redis.key(f"s{n}", "story", ""),
                ctx.redis.key(f"s{n}", "author_profile", ""), ctx.redis.key("genre", genre["GenreId"]))

        def genre_page(r):
            return r.eval(GENRE_PAGE, 0, *args)

        lbl = label("genre_page", n)
        ctx.bench_redis(lbl, genre_page)
        found = genre_page(ctx.redis)
        ctx.metric("actual_rows", found, "dòng", label=lbl, better="none")
        ctx.check(found == min(20, matching), f"{num(n)} truyện: trả về {min(20, matching)} truyện "
                                              f"(trang đầu của {matching} truyện thể loại {genre['Name']})")
        ctx.observe(f"{num(n)} truyện ({matching} truyện thể loại {genre['Name']}): {2 + 2 * found} lệnh "
                    f"(1 ZREVRANGE + 1 HGET tên thể loại + {found} HMGET truyện + {found} HGET tác giả).")

    ctx.statement("steps", f"ZREVRANGE {ctx.redis.key('s<n>', 'genre', genre['GenreId'], 'stories')} 0 19\n"
                           f"HGET {ctx.redis.key('genre', genre['GenreId'])} Name\n"
                           "# với mỗi StoryId trả về:\n"
                           f"HMGET {ctx.redis.key('s<n>', 'story', '<id>')} Title Slug LastChapterAt AuthorId\n"
                           f"HGET {ctx.redis.key('s<n>', 'author_profile', '<AuthorId>')} PenName")
    ctx.observe("Redis không có join: code tự ghép. Lấy 20 truyện mới nhất của thể loại từ sorted set (đã xếp "
                "sẵn lúc ghi, nên không cần sắp xếp), rồi với mỗi truyện đọc thông tin và tra bút danh tác giả "
                "theo AuthorId. Đây giống Nested Loops do người viết code tự làm: số lệnh chỉ phụ thuộc 20 "
                "truyện của trang, không phụ thuộc tổng số truyện. Đổi lại, sorted set của từng thể loại phải "
                "được ứng dụng cập nhật mỗi khi truyện được đăng, ẩn hay có chương mới.")


# --- (g) subquery ----------------------------------------------------------------------------------
# F1 "standout stories". Redis has no subquery and cannot compute an average by author on its own: the
# application keeps, per author, the sum (rating x 100, an integer) and the count of public stories, and
# updates them whenever a rating changes. Step 1: ZREVRANGE walks all stories from the best rating down,
# 50 at a time. Step 2: per story, HMGET its columns. Step 3: for a public story, HMGET its author's sum
# and count, and keep the story if rating x count > sum (exact integer test of rating > average). Stops at
# 20 matches. Returns {matches, stories looked at}.
STANDOUT = """
local found, looked, offset = 0, 0, 0
while found < 20 do
  local ids = redis.call('ZREVRANGE', ARGV[1], offset, offset + 49)
  if #ids == 0 then break end
  offset = offset + #ids
  for _, id in ipairs(ids) do
    looked = looked + 1
    local f = redis.call('HMGET', ARGV[2] .. id, 'PublishStatus', 'IsDeleted', 'AuthorId', 'RatingAvg', 'Title', 'Slug')
    if f[1] == 'PUBLISHED' and f[2] == 'False' then
      local a = redis.call('HMGET', ARGV[3] .. f[3], 'sum100', 'count')
      local r100 = math.floor(tonumber(f[4]) * 100 + 0.5)
      if r100 * tonumber(a[2]) > tonumber(a[1]) then
        found = found + 1
        if found == 20 then break end
      end
    end
  end
end
return {found, looked}
"""


def load_author_ratings(ctx: Ctx, n: int) -> None:
    """Per author of the n-story copy: sum of RatingAvg x 100 and count of public stories (not timed)."""
    load_stories(ctx, n)
    if ctx.redis.get(ctx.redis.key(f"s{n}", "sub_loaded")):
        return
    rows = ctx.sql.query(
        f"SELECT AuthorId, SUM(CAST(RatingAvg * 100 AS INT)) AS sum100, COUNT(*) AS cnt FROM {story_table(ctx, n)} "
        "WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0 GROUP BY AuthorId")
    pipe = ctx.redis.pipeline(transaction=False)
    for r in rows:
        pipe.hset(ctx.redis.key(f"s{n}", "author_rating", r["AuthorId"]), mapping={"sum100": r["sum100"], "count": r["cnt"]})
    pipe.set(ctx.redis.key(f"s{n}", "sub_loaded"), 1)
    pipe.execute()


@scenario(title="Truy vấn có subquery: truyện có rating cao hơn trung bình của tác giả", pair="subquery",
          repeat=10)
def subquery(ctx: Ctx):
    for n in SIZES:
        load_author_ratings(ctx, n)
        table = story_table(ctx, n)
        matching = ctx.sql.scalar(
            f"SELECT COUNT(*) FROM {table} s WHERE s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0 "
            f"AND s.RatingAvg > (SELECT AVG(s2.RatingAvg) FROM {table} s2 WHERE s2.AuthorId = s.AuthorId "
            "AND s2.PublishStatus = 'PUBLISHED' AND s2.IsDeleted = 0)")
        args = (ctx.redis.key(f"s{n}", "by_rating"), ctx.redis.key(f"s{n}", "story", ""),
                ctx.redis.key(f"s{n}", "author_rating", ""))

        def standout(r):
            return r.eval(STANDOUT, 0, *args)

        lbl = label("standout", n)
        ctx.bench_redis(lbl, standout)
        found, looked = standout(ctx.redis)
        ctx.metric("actual_rows", found, "dòng", label=lbl, better="none")
        ctx.metric("rows_read", looked, "dòng", label=lbl, better="none",
                   note="truyện phải xem để tìm đủ 20 truyện vượt trung bình tác giả")
        ctx.check(found == min(20, matching), f"{num(n)} truyện: trả về {min(20, matching)} truyện "
                                              f"(trang đầu của {matching} truyện vượt trung bình tác giả)")
        batches = -(-looked // 50)
        ctx.observe(f"{num(n)} truyện ({matching} truyện vượt trung bình tác giả): xem {looked} truyện để lấy "
                    f"{found}; tối đa {batches + 2 * looked} lệnh ({batches} ZREVRANGE + {looked} HMGET truyện + "
                    f"tối đa {looked} HMGET điểm tác giả, chỉ cho truyện công khai).")

    ctx.statement("steps", f"ZREVRANGE {ctx.redis.key('s<n>', 'by_rating')} <offset> <offset+49>\n"
                           "# với mỗi StoryId:\n"
                           f"HMGET {ctx.redis.key('s<n>', 'story', '<id>')} PublishStatus IsDeleted AuthorId RatingAvg Title Slug\n"
                           f"HMGET {ctx.redis.key('s<n>', 'author_rating', '<AuthorId>')} sum100 count\n"
                           "# giữ truyện nếu RatingAvg x 100 x count > sum100; đủ 20 truyện thì dừng")
    ctx.observe("Redis không có subquery và không tự tính được trung bình theo tác giả: ứng dụng phải lưu sẵn "
                "tổng điểm và số truyện của từng tác giả, cập nhật mỗi khi có rating mới. Lúc đọc, code đi theo "
                "sorted set rating từ cao xuống, với mỗi truyện đọc tổng điểm của tác giả để so, đủ 20 truyện thì "
                "dừng. Phần \"tính trung bình\" đã được làm sẵn lúc ghi, giống cách SQL Server ở mức 10.000 truyện "
                "tính trung bình mọi tác giả trước rồi mới so.")


# --- (h) aggregate ---------------------------------------------------------------------------------
# F13 daily views chart. Redis has no GROUP BY / SUM over raw rows: the application adds up while writing.
# Whenever the daily view counts are flushed, it updates one Hash per day: total (HINCRBY), stories viewed
# (+1 the first time a story is seen that day) and the busiest story's views (kept if larger). Reading
# the chart is one HMGET per day, whatever the number of stories.
DAILY_VIEWS = """
local out = 0
for i = 2, #ARGV do
  local f = redis.call('HMGET', ARGV[1] .. ARGV[i], 'total', 'stories', 'max')
  if f[1] then out = out + 1 end
end
return out
"""


def load_daily(ctx: Ctx, n: int, first, after) -> dict:
    """Per-day totals of the n-story copy, as the application would have kept them (not timed).
    Returns {date: (total, stories, max)} for the check."""
    view_daily = tables(ctx, n)["view_daily"]
    rows = ctx.sql.query(f"SELECT ViewDate, Views FROM {view_daily} WHERE ViewDate >= ? AND ViewDate < ?",
                         first, after)
    days: dict = {}
    for r in rows:
        total, stories, top = days.get(r["ViewDate"], (0, 0, 0))
        days[r["ViewDate"]] = (total + r["Views"], stories + 1, max(top, r["Views"]))
    if not ctx.redis.get(ctx.redis.key(f"s{n}", "daily_loaded")):
        pipe = ctx.redis.pipeline(transaction=False)
        for day, (total, stories, top) in days.items():
            pipe.hset(ctx.redis.key(f"s{n}", "views_day", day.isoformat()),
                      mapping={"total": total, "stories": stories, "max": top})
        pipe.set(ctx.redis.key(f"s{n}", "daily_loaded"), 1)
        pipe.execute()
    return days


@scenario(title="Truy vấn tổng hợp: lượt xem toàn trang theo ngày trong 30 ngày", pair="aggregate", repeat=10)
def aggregate(ctx: Ctx):
    first, after = view_window(ctx)
    dates = [(first + timedelta(days=i)).isoformat() for i in range((after - first).days)]
    for n in SIZES:
        days = load_daily(ctx, n, first, after)
        prefix = ctx.redis.key(f"s{n}", "views_day", "")

        def daily_views(r):
            return r.eval(DAILY_VIEWS, 0, prefix, *dates)

        lbl = label("daily_views", n)
        ctx.bench_redis(lbl, daily_views)
        found = daily_views(ctx.redis)
        ctx.metric("actual_rows", found, "dòng", label=lbl, better="none")
        stored = ctx.redis.hgetall(prefix + dates[-1])
        last = days[after - timedelta(days=1)]
        ctx.check(found == len(dates), f"{num(n)} truyện: đọc được {len(dates)} ngày")
        ctx.check((int(stored["total"]), int(stored["stories"]), int(stored["max"])) == last,
                  f"{num(n)} truyện: số liệu ngày {dates[-1]} khớp với dữ liệu gốc")
        rows = sum(s for _, s, _ in days.values())
        ctx.observe(f"{num(n)} truyện ({num(rows)} dòng lượt xem trong 30 ngày): {len(dates)} lệnh HMGET, "
                    "mỗi lệnh đọc 3 con số đã cộng sẵn của một ngày.")

    ctx.statement("steps", f"# với mỗi ngày trong 30 ngày:\nHMGET {ctx.redis.key('s<n>', 'views_day', '<yyyy-mm-dd>')} "
                           "total stories max")
    ctx.observe("Redis không có GROUP BY / SUM trên dữ liệu thô: ứng dụng phải cộng dồn lúc ghi, mỗi ngày một "
                "Hash (tổng lượt xem, số truyện được xem, lượt xem cao nhất). Lúc đọc chỉ 30 lệnh, không phụ "
                "thuộc số truyện hay số dòng lượt xem. Đổi lại: chỉ trả lời được đúng câu hỏi đã chuẩn bị sẵn; "
                "muốn thống kê kiểu khác (theo thể loại, theo tuần...) phải thêm cấu trúc và cập nhật nó lúc ghi.")
