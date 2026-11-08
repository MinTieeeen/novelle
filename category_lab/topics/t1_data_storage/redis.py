from lab.framework import Ctx, scenario
from redis.exceptions import OutOfMemoryError
import itertools
import os
import json
import random

N_IMPORT = 500            # số chương mỗi lần nhập
TARGET_ROWS = 1500       # số chương thật copy vào bảng đích
REPEAT, WARMUP = 5, 1    # số lần đo và số lần khởi động không tính
STORY_BASE = 1_000_000
DRAFT_TTL = 7 * 24 * 3600
USE_PIPELINE = True

def _announce_write_bottleneck():
    if os.environ.get("DS_WRITE_BOTTLENECK_SCOPE"):
        return
    os.environ["DS_WRITE_BOTTLENECK_SCOPE"] = "1"
    print(
    "======== Phạm vi test_write_bottleneck (chung cho SQL Server và Redis) ========\n"
    f" - Dữ liệu ghi : {N_IMPORT} chương đầu tiên trích xuất từ dbo.Chapter (IsDeleted = 0, theo ChapterId)\n"
    f" - Dữ liệu nền : {TARGET_ROWS} chương dữ liệu thật đã được nạp sẵn\n"
    " - Cấu trúc dữ liệu trong SQL Server  : clustered PK(ChapterId), UNIQUE IX_Story_No(StoryId, ChapterNo) "
    "INCLUDE(Title, Status, PublishedAt), IX_Scheduled(ScheduledAt) WHERE Status = 'SCHEDULED'\n"
    " - Cấu trúc dữ liệu trong Redis       : Hash {storyId}:{chapterNo} (title, content, wordCount, chapterNo, status)\n"
    "ZSet {storyId} (member = key chương, score = chapterNo)\n"
    f" - Bulk_import : mỗi lần nhập {N_IMPORT} chương thành một truyện mới đo {REPEAT} lần sau {WARMUP} lần khởi động\n"
    " - Autosave    : SQL UPDATE Content của một chương | Redis HSET draft:{userId}:{chapterId} + EXPIRE 7 ngày"
    )

def _require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)

def _slowlog_safe(text: str, limit: int = 128) -> str:
    b = text.encode("utf-8")
    if len(b) <= limit:
        return text
    cut = limit
    while cut > 0 and (b[cut] & 0xC0) == 0x80:   # Đệm khoảng trắng để SLOWLOG cắt ở byte 128 không rơi giữa một ký tự UTF-8.
        cut -= 1
    return " " * (limit - cut) + text

def _str(value) -> str:
    return value.decode() if isinstance(value, bytes) else value #đưa về str để so sánh trong trường hợp Client của lab có thể trả về bytes (decode_responses=False)

def _preload(ctx: Ctx) -> int: #Nạp dữ liệu nền, cùng cấu trúc Hash + mục lục
    base = ctx.sql.query(
        f"SELECT TOP ({TARGET_ROWS}) ChapterId, StoryId, ChapterNo, Title, Content, WordCount "
        "FROM dbo.Chapter ORDER BY ChapterId")
    pipe = ctx.redis.pipeline(transaction=False)
    for i, row in enumerate(base, 1):
        key = ctx.redis.key("chapter", row["StoryId"], row["ChapterNo"])
        pipe.hset(key, mapping={"title": _slowlog_safe(row["Title"]),
                                "content": _slowlog_safe(row["Content"]),
                                "wordCount": row["WordCount"], "chapterNo": row["ChapterNo"],
                                "status": "PUBLISHED"})
        pipe.zadd(ctx.redis.key("toc", row["StoryId"]), {key: row["ChapterNo"]})
        if i % 200 == 0:                  # gửi theo từng đợt để không giữ cả 33 MB trong một pipeline
            pipe.execute()
    pipe.execute()
    return len(base)

def _write_story(ctx: Ctx, r, story_id: int, rows: list[dict]) -> list[str]:
    toc = ctx.redis.key("toc", story_id)
    target = r.pipeline(transaction=False) if USE_PIPELINE else r
    keys = [toc]
    for no, row in enumerate(rows, 1):
        key = ctx.redis.key("chapter", story_id, no)
        target.hset(key, mapping={"title": row["Title"], "content": row["Content"],
                                  "wordCount": row["WordCount"], "chapterNo": no,
                                  "status": "DRAFT"}) #N Hash chương và một Sorted Set mục lục
        target.zadd(toc, {key: no})
        keys.append(key)
    if USE_PIPELINE:
        target.execute()
    return keys

@scenario(title="Write bottleneck: nhập hàng loạt và autosave chương", pair="test_write_bottleneck", repeat=REPEAT, warmup=WARMUP)
def test_write_bottleneck(ctx: Ctx):
    _announce_write_bottleneck()
    rows = ctx.sql.query(
        f"SELECT TOP ({N_IMPORT}) ChapterId, Title, Content, WordCount "
        "FROM dbo.Chapter WHERE IsDeleted = 0 ORDER BY ChapterId")
    _require(len(rows) == N_IMPORT, f"phải đọc được {N_IMPORT} chương nguồn")
    for row in rows:                       # tối đa 3 byte đệm mỗi chuỗi, không đáng kể
        row["Title"] = _slowlog_safe(row["Title"])
        row["Content"] = _slowlog_safe(row["Content"])

    # ── Nhóm 1: dữ liệu chương ──
    n_base = _preload(ctx)
    _require(n_base == TARGET_ROWS, f"phải nạp đủ {TARGET_ROWS} chương nền")
    counter = itertools.count(1)
    s_bulk = ctx.bench_redis("bulk_import",
                             lambda r: _write_story(ctx, r, STORY_BASE + next(counter), rows))
    
    keys = _write_story(ctx, ctx.redis, STORY_BASE, rows)
    storage = sum(ctx.redis.memory_usage(k, samples=0) or 0 for k in keys)
    _require(ctx.redis.zcard(keys[0]) == N_IMPORT, f"mục lục phải có đủ {N_IMPORT} chương")
    ctx.metric("storage_bytes", storage, "bytes", label="bulk_import")
    ctx.inspect_redis_key("bulk_import", keys[1])   # encoding hashtable vì content > 64 byte
    try:
        cfg = {_str(k): _str(v) for k, v in
               {**ctx.redis.config_get("appendfsync"), **ctx.redis.config_get("appendonly")}.items()}
        persistence = f"appendonly={cfg.get('appendonly')}, appendfsync={cfg.get('appendfsync')}"
    except Exception as e:
        persistence = f"không đọc được ({e})"

    # ── Nhóm 2: autosave ──
    chapter = rows[0]
    draft = ctx.redis.key("draft", 1, chapter["ChapterId"])
    content = chapter["Content"] + " "

    save_no = itertools.count(1)
    def autosave(r):
        r.hset(draft, mapping={"title": chapter["Title"], "content": f"{content}{next(save_no)}"})
        r.expire(draft, DRAFT_TTL)

    s_auto = ctx.bench_redis("autosave", autosave)
    ctx.inspect_redis_key("autosave", draft)
    _require(_str(ctx.redis.hget(draft, "content")).startswith(content), "bản nháp phải được lưu đầy đủ")
    _require(ctx.redis.ttl(draft) > 0, "bản nháp phải có TTL")
    ctx.observe(
        f"bulk_import {N_IMPORT} chương: p50 {s_bulk.p50:.2f} ms; một truyện chiếm "
        f"{storage / 1024:.0f} KB RAM ({persistence}). Mỗi lệnh chỉ ghi vào bảng băm trong RAM "
        "và bộ đệm AOF; fsync xuống đĩa diễn ra ngoài thời gian đo.")
    ctx.observe(
        f"autosave (HSET khoảng {len(content) // 1024} K ký tự + EXPIRE): p50 {s_auto.p50:.3f} ms. "
        "Đây là cách Novelle lưu bản nháp: gõ chữ không tạo lần ghi nào vào SQL Server.")

#====================================================================================================================================
EV_N = 1000                      # số chương được cache
EV_LIMIT_RATIO = 0.5             # maxmemory = bộ nhớ nền + 50% dung lượng 1000 chương
EV_HOT_RATIO = 0.2               # 20% chương là "nóng"
EV_HOT_SHARE = 0.8               # ... và nhận 80% lượt đọc
EV_READS = 5000                  # số lượt đọc cache-aside sau khi nạp
EV_VIEWS = 100                   # số bộ đếm lượt xem làm "chim báo"
EV_CACHE_TTL = 30 * 60           # TTL của cache:chapter theo đặc tả (30 phút)
EV_POLICIES = ("noeviction", "allkeys-lru")
EV_SEED = 42                     # cùng chuỗi ngẫu nhiên cho mọi chính sách

def _announce_eviction():
    if os.environ.get("DS_KEY_EVICTION_SCOPE"):
        return
    os.environ["DS_KEY_EVICTION_SCOPE"] = "1"
    print("======================== Phạm vi test_key_eviction (chung cho SQL Server và Redis) ========================\n"
        f" - Dữ liệu    : {EV_N} chương thật đầu tiên của dbo.Chapter\n"
        f" - SQL Server : bản sao {EV_N} chương; quan sát buffer pool\n"
        " - Redis      : lưu cache:chapter:{chapterId} (String JSON, TTL 30 phút) + "
        f"{EV_VIEWS} bộ đếm views:chapter:{{chapterId}} (không TTL);\n"
        f"   giới hạn RAM  : maxmemory = bộ nhớ nền + {EV_LIMIT_RATIO:.0%} dung lượng {EV_N} chương;\n"
        f"   chính sách {', '.join(EV_POLICIES)};\n"
        f"   tải đọc    : {EV_READS} lượt đọc cache-aside; {EV_HOT_RATIO:.0%} chương nóng nhận "
        f"{EV_HOT_SHARE:.0%} lượt đọc\n"
        )

def _cfg(ctx: Ctx, name: str) -> str:
    return {_str(k): _str(v) for k, v in ctx.redis.config_get(name).items()}.get(name)

def _used_memory(ctx: Ctx) -> int:
    return int(ctx.redis.info("memory")["used_memory"])

def _evicted(ctx: Ctx) -> int:
    return int(ctx.redis.info("stats")["evicted_keys"])


def _clear_lab_keys(ctx: Ctx): #Xóa các key trong sandbox bằng DEL để giải phóng bộ nhớ
    pattern = ctx.redis.key("x")[:-1] + "*"
    batch = []
    for k in ctx.redis.scan_iter(match=pattern, count=1000):
        batch.append(k)
        if len(batch) >= 500:
            ctx.redis.delete(*batch)
            batch = []
    if batch:
        ctx.redis.delete(*batch)


@scenario(title="Key eviction: cache chương khi bộ nhớ không đủ", pair="test_key_eviction",
          targets={"local"})
def test_key_eviction(ctx: Ctx):
    _announce_eviction()

    # ── Chuẩn bị: đọc 1000 chương một lần, dùng lại cho mọi chính sách ──
    rows = ctx.sql.query(
        f"SELECT TOP ({EV_N}) ChapterId, StoryId, ChapterNo, Title, Content "
        "FROM dbo.Chapter WHERE IsDeleted = 0 ORDER BY ChapterId")
    _require(len(rows) == EV_N, f"phải đọc được {EV_N} chương")
    ids = [r["ChapterId"] for r in rows]
    values = [json.dumps({"chapterId": r["ChapterId"], "storyId": r["StoryId"],
                          "chapterNo": r["ChapterNo"], "title": r["Title"],
                          "content": r["Content"]}, ensure_ascii=False) for r in rows]
    ckey = lambda i: ctx.redis.key("cache", "chapter", ids[i])       # cache:chapter:{chapterId}
    vkey = lambda cid: ctx.redis.key("views", "chapter", cid)        # views:chapter:{chapterId}

    hot_idx = random.Random(EV_SEED + 1).sample(range(EV_N), int(EV_N * EV_HOT_RATIO))
    hot_set = set(hot_idx)
    cold_idx = [i for i in range(EV_N) if i not in hot_set]
    view_ids = random.Random(EV_SEED + 2).sample(ids, EV_VIEWS)      # rải đều, cả chương nóng lẫn lạnh

    # ── Giai đoạn A: chưa giới hạn bộ nhớ, đo dung lượng D của 1000 chương ──
    ctx.redis.config_set("maxmemory", 0)
    _clear_lab_keys(ctx)
    base = _used_memory(ctx)
    for i in range(EV_N):
        ctx.redis.set(ckey(i), values[i], ex=EV_CACHE_TTL)
    dataset = _used_memory(ctx) - base
    storage = sum(ctx.redis.memory_usage(ckey(i), samples=0) or 0 for i in range(EV_N))
    ctx.metric("storage_bytes", storage, "bytes", label="dataset")
    ctx.metric("used_memory_delta", dataset, "bytes", label="dataset")
    ctx.inspect_redis_key("dataset", ckey(0))

    k0 = ckey(0)
    s_read = ctx.bench_redis("read_chapter", lambda r: r.get(k0))

    limit = base + int(EV_LIMIT_RATIO * dataset)
    ctx.observe(f"Bộ nhớ nền {base / 2**20:.1f} MB; {EV_N} chương chiếm {dataset / 2**20:.1f} MB; "
                f"maxmemory đặt {limit / 2**20:.1f} MB. Đọc một chương từ cache: p50 {s_read.p50:.3f} ms. "
                f"maxmemory-samples = {_cfg(ctx, 'maxmemory-samples')} (LRU xấp xỉ bằng lấy mẫu).")

    # ── Giai đoạn B: lặp cho từng chính sách ──
    for policy in EV_POLICIES:
        rnd = random.Random(EV_SEED)
        ctx.redis.config_set("maxmemory", 0)
        _clear_lab_keys(ctx)
        ctx.redis.config_set("maxmemory-policy", policy)

        # B1. Bộ đếm lượt xem chưa flush (nạp trước, khi chưa giới hạn)
        expected = {}
        for cid in view_ids:
            n = rnd.randint(1, 50)
            ctx.redis.set(vkey(cid), n)
            expected[cid] = n

        # B2. Đặt giới hạn, nạp cache; cứ 10 chương thì có 5 lượt đọc chương nóng
        ctx.redis.config_set("maxmemory", limit)
        ev0, oom = _evicted(ctx), 0
        for i in range(EV_N):
            try:
                ctx.redis.set(ckey(i), values[i], ex=EV_CACHE_TTL)
            except OutOfMemoryError:     # noeviction: Redis từ chối lệnh ghi khi đầy bộ nhớ
                oom += 1
            if i % 10 == 9:
                for _ in range(5):
                    ctx.redis.get(ckey(rnd.choice(hot_idx)))
        loaded = sum(ctx.redis.exists(ckey(i)) for i in range(EV_N))

        # B3. Tải đọc cache-aside: miss thì ghi lại từ "SQL Server" (bản trong bộ nhớ)
        hot_hit = hot_n = all_hit = views_err = 0
        for _ in range(EV_READS):
            is_hot = rnd.random() < EV_HOT_SHARE
            i = rnd.choice(hot_idx if is_hot else cold_idx)
            hit = ctx.redis.get(ckey(i)) is not None
            hot_n += is_hot
            if hit:
                all_hit += 1
                hot_hit += is_hot
            else:
                try:
                    ctx.redis.set(ckey(i), values[i], ex=EV_CACHE_TTL)
                except OutOfMemoryError:
                    oom += 1
            if ids[i] in expected:                       # chương có bộ đếm lượt xem
                expected[ids[i]] += 1
                try:
                    ctx.redis.incr(vkey(ids[i]))
                except OutOfMemoryError:
                    views_err += 1

        # B4. Kết quả
        evicted = _evicted(ctx) - ev0
        cached = sum(ctx.redis.exists(ckey(i)) for i in range(EV_N))
        actual = ctx.redis.mget([vkey(cid) for cid in view_ids])
        lost = sum(max(0, expected[cid] - int(_str(v) or 0)) for cid, v in zip(view_ids, actual))
        views_lost_pct = 100 * lost / sum(expected.values())
        keys_hit = sum(1 for cid, v in zip(view_ids, actual) if int(_str(v) or 0) < expected[cid])
        used = _used_memory(ctx)
        hot_rate = 100 * hot_hit / max(hot_n, 1)
        all_rate = 100 * all_hit / EV_READS

        ctx.metric("evicted_keys", evicted, "keys", label=policy)
        ctx.metric("oom_errors", oom + views_err, "errors", label=policy)
        ctx.metric("chapters_loaded", loaded, "keys", label=policy, better="higher")
        ctx.metric("hit_rate_hot", round(hot_rate, 1), "%", label=policy, better="higher")
        ctx.metric("hit_rate_all", round(all_rate, 1), "%", label=policy, better="higher")
        ctx.metric("cached_chapters", cached, "keys", label=policy, better="higher")
        ctx.metric("views_lost_pct", round(views_lost_pct, 1), "%", label=policy)
        ctx.metric("used_memory_mb", round(used / 2**20, 2), "MB", label=policy)

        ctx.observe(
            f"{policy}: trục xuất {evicted} key, {oom + views_err} lệnh ghi bị từ chối (OOM); "
            f"nạp được {loaded}/{EV_N} chương, cuối cùng còn {cached} chương trong cache; "
            f"hit rate chương nóng {hot_rate:.1f}%, toàn bộ {all_rate:.1f}%; "
            f"mất {views_lost_pct:.1f}% lượt xem chưa flush ({keys_hit}/{EV_VIEWS} bộ đếm bị ảnh hưởng); "
            f"used_memory {used / 2**20:.2f} MB / maxmemory {limit / 2**20:.2f} MB.")


EV_DEFAULT_MAXMEMORY = "0"            # mặc định của Redis (docker-compose không đặt maxmemory)
EV_DEFAULT_POLICY = "noeviction"

def _has_leftover(ctx: Ctx) -> bool: #Còn key cache:chapter của sandbox => lần chạy trước bị ngắt trước teardown
    return next(iter(ctx.redis.scan_iter(match=ctx.redis.key("cache", "chapter", "*"), count=1000)), None) is not None

@test_key_eviction.setup
def _(ctx: Ctx): #Lưu cấu hình bộ nhớ hiện tại để teardown khôi phục
    if _has_leftover(ctx):
        # Cấu hình hiện tại có thể là giới hạn do chính kịch bản đặt -> không lưu nó làm "mặc định"
        os.environ["DS_EV_MAXMEMORY"] = EV_DEFAULT_MAXMEMORY
        os.environ["DS_EV_POLICY"] = EV_DEFAULT_POLICY
    else:
        os.environ["DS_EV_MAXMEMORY"] = _cfg(ctx, "maxmemory") or EV_DEFAULT_MAXMEMORY
        os.environ["DS_EV_POLICY"] = _cfg(ctx, "maxmemory-policy") or EV_DEFAULT_POLICY

@test_key_eviction.teardown
def _(ctx: Ctx): #Bỏ giới hạn trước, dọn key sandbox, rồi mới khôi phục cấu hình đã lưu
    ctx.redis.config_set("maxmemory", 0)
    _clear_lab_keys(ctx)
    ctx.redis.config_set("maxmemory", os.environ.get("DS_EV_MAXMEMORY", EV_DEFAULT_MAXMEMORY))
    ctx.redis.config_set("maxmemory-policy", os.environ.get("DS_EV_POLICY", EV_DEFAULT_POLICY))
    