"""Redis side of backup_recovery. Keys live in lab:backup_recovery:* and are deleted after the topic.

Keys:
  story:{id}     Hash    fields of one story (copied from dbo.Story)
  draft:{n}      String  synthetic draft text (~1 KB), to give the snapshot a realistic size
  write:{mode}:{n}  String  durability test writes
  views:{id}     String  view counter (atomic_rollback)
  chapter:{id}   Hash    chapters of one story (accidental_delete)
  crash:{n}      String  writes acknowledged before the crash test

Scenarios that save, reconfigure or restart the server only run on the local Redis (it holds lab data only).
"""
import os
import statistics
import time

import redis as redis_lib

from lab.framework import Ctx, fixtures, redis_probe, scenario

DRAFT_KEYS, DRAFT_BYTES = 20_000, 1_024
POLL_S, WAIT_TIMEOUT_S = 0.01, 120
FSYNC_RPO_S = {"always": 0, "everysec": 1, "no": 30}    # "no": Linux flushes dirty pages about every 30 s
FSYNC_WRITES, WRITE_BYTES = 2_000, 400                   # 400 bytes = the 200 nvarchar chars of the SQL test
CRASH_KEYS = 50_000


def lab_keys_only(ctx: Ctx) -> bool:
    """True when every key of the server belongs to the lab (safe to snapshot, reconfigure or restart)."""
    return ctx.redis.raw.dbsize() == sum(1 for _ in ctx.redis.raw.scan_iter("lab:*", count=1000))


def load_dataset(ctx: Ctx) -> int:
    """Copy dbo.Story into Hashes and add synthetic drafts (not timed). Returns the number of keys added."""
    rows = ctx.sql.query("SELECT StoryId, Title, Slug, ChapterCount, ViewCount, RatingAvg FROM dbo.Story")
    fixtures.load_hashes(ctx.redis, rows, "story", "StoryId")
    pipe = ctx.redis.raw.pipeline(transaction=False)
    for n in range(DRAFT_KEYS):        # random hex: RDB's LZF compression cannot shrink it to nothing
        pipe.set(ctx.redis.key("draft", n), os.urandom(DRAFT_BYTES // 2).hex())
        if n % 1000 == 999:
            pipe.execute()
    pipe.execute()
    return len(rows) + DRAFT_KEYS


def wait_until(ctx: Ctx, done) -> float:
    """Poll INFO persistence until done(info) is true; return the elapsed milliseconds."""
    start = time.perf_counter()
    while not done(ctx.redis.raw.info("persistence")):
        if time.perf_counter() - start > WAIT_TIMEOUT_S:
            raise TimeoutError("Redis background save did not finish in time")
        time.sleep(POLL_S)
    return (time.perf_counter() - start) * 1000


def idle(info: dict) -> bool:
    return not info["rdb_bgsave_in_progress"] and not info["aof_rewrite_in_progress"]


def snapshot_rpo_s(save_rules: str) -> int | None:
    """Worst-case seconds between two RDB snapshots: the longest interval of the `save` rules."""
    numbers = [int(x) for x in save_rules.split()]
    return max(numbers[0::2]) if numbers else None


# --- 1. Backup mechanism and RPO ------------------------------------------------------------------------
@scenario(title="Cơ chế backup và RPO", pair="backup_rpo", targets={"local"})
def backup_rpo(ctx: Ctx):
    raw = ctx.redis.raw
    lab_keys = load_dataset(ctx)
    ctx.check(lab_keys_only(ctx), "Redis local chỉ chứa key của lab, nên bản backup đo đúng dữ liệu thí nghiệm")
    wait_until(ctx, idle)
    ctx.capture("persistence_before", redis_probe.persistence(ctx.redis))

    # RDB snapshot: fork + write the whole dataset to dump.rdb in the background.
    before = raw.info("persistence")["rdb_last_save_time"]
    raw.bgsave()
    bgsave_ms = wait_until(ctx, lambda i: idle(i) and i["rdb_last_save_time"] != before)
    rdb = raw.info("persistence")
    ctx.check(rdb["rdb_last_bgsave_status"] == "ok", "BGSAVE hoàn tất, dump.rdb được ghi thành công")

    # AOF rewrite: writes a new base file (RDB preamble) and starts a fresh incremental file.
    raw.bgrewriteaof()
    rewrite_ms = wait_until(ctx, lambda i: idle(i) and i["aof_rewrite_scheduled"] == 0)
    aof = raw.info("persistence")
    ctx.check(aof["aof_last_bgrewrite_status"] == "ok", "BGREWRITEAOF hoàn tất")
    ctx.capture("persistence_after", redis_probe.persistence(ctx.redis))
    ctx.statement("rdb_snapshot", "BGSAVE\n# chờ tới khi INFO persistence: rdb_bgsave_in_progress = 0")
    ctx.statement("aof_rewrite", "BGREWRITEAOF\n# chờ tới khi INFO persistence: aof_rewrite_in_progress = 0")

    ctx.metric("backup_wall_ms", bgsave_ms, "ms", label="rdb_bgsave",
               note=f"Thời gian từ BGSAVE tới khi xong (hỏi INFO mỗi {POLL_S * 1000:.0f} ms, gồm cả mạng)")
    ctx.metric("backup_wall_ms", rewrite_ms, "ms", label="aof_rewrite", note="Thời gian BGREWRITEAOF")
    ctx.metric("fork_cow_bytes", rdb.get("rdb_last_cow_size", 0), "byte", label="rdb_bgsave",
               note="Bộ nhớ copy-on-write tiến trình con dùng trong lúc snapshot")
    ctx.metric("lab_backup_size_mb", aof["aof_base_size"] / 1048576, "MB", label="rdb_bgsave", better="none",
               note="File base của AOF sau rewrite (định dạng RDB, tương đương dump.rdb) của dữ liệu lab")

    # RPO = worst-case seconds of acknowledged writes lost, per kind of failure (same labels as sqlserver.py).
    appendfsync = raw.config_get("appendfsync")["appendfsync"]
    save_rules = raw.config_get("save")["save"]
    aof_on = bool(aof["aof_enabled"])
    if aof_on:
        ctx.metric("rpo_s", FSYNC_RPO_S[appendfsync], "s", label="process_crash",
                   note=f"appendfsync {appendfsync}: phần ghi chưa fsync xuống đĩa khi máy mất điện")
    snap_rpo = snapshot_rpo_s(save_rules)
    if snap_rpo is not None:
        ctx.metric("rpo_s", snap_rpo, "s", label="snapshot_only",
                   note=f"Nếu chỉ có RDB (save \"{save_rules}\"): khi ghi ít, snapshot chạy sau tối đa {snap_rpo} s")
    ctx.check(aof_on and appendfsync == "everysec", "AOF bật với appendfsync everysec, giống Redis trên EC2")

    ctx.observe(f"{lab_keys} key (~{DRAFT_KEYS * DRAFT_BYTES / 1048576:.0f} MB chuỗi ngẫu nhiên): BGSAVE mất "
                f"{bgsave_ms:.0f} ms, BGREWRITEAOF mất {rewrite_ms:.0f} ms. Cả hai chạy trong tiến trình con "
                "(fork), Redis vẫn phục vụ lệnh trong lúc backup.")
    ctx.observe(f"Với AOF everysec, sự cố mất tối đa khoảng 1 s ghi. Nếu chỉ có RDB (save \"{save_rules}\"), "
                f"có thể mất tới {snap_rpo} s. File AOF/RDB nằm trên đĩa của chính máy Redis: muốn chống mất "
                "máy phải tự chép sang nơi khác, Redis không tự làm như RDS.")


# --- 2. Cost of durable writes --------------------------------------------------------------------------
def rtt_ms(ctx: Ctx, n: int = 200) -> float:
    """Median round trip of PING: the network part of one request, subtracted from single writes."""
    samples = []
    for _ in range(n):
        t0 = time.perf_counter()
        ctx.redis.raw.ping()
        samples.append((time.perf_counter() - t0) * 1000)
    return statistics.median(samples)


@scenario(title="Chi phí ghi bền vững", pair="durability_cost", targets={"local"})
def durability_cost(ctx: Ctx):
    raw = ctx.redis.raw
    ctx.check(lab_keys_only(ctx), "Redis local chỉ chứa key của lab, đổi appendfsync tạm thời không ảnh hưởng ai")
    original = raw.config_get("appendfsync")["appendfsync"]
    payload = "n" * WRITE_BYTES
    rtt = rtt_ms(ctx)

    def single_writes(mode: str) -> float:
        """Per-write ms of FSYNC_WRITES SETs sent one by one (each waits for its reply), minus the RTT."""
        t0 = time.perf_counter()
        for n in range(FSYNC_WRITES):
            raw.set(ctx.redis.key("write", mode, n), payload)
        return max((time.perf_counter() - t0) * 1000 / FSYNC_WRITES - rtt, 0.0)

    try:
        raw.config_set("appendfsync", "everysec")
        everysec = single_writes("everysec")
        raw.config_set("appendfsync", "always")
        always = single_writes("always")
        pipe = raw.pipeline(transaction=True)                 # MULTI ... EXEC: one AOF write + fsync
        for n in range(FSYNC_WRITES):
            pipe.set(ctx.redis.key("write", "batch", n), payload)
        t0 = time.perf_counter()
        pipe.execute()
        batch = (time.perf_counter() - t0) * 1000 / FSYNC_WRITES
    finally:
        raw.config_set("appendfsync", original)
    ctx.check(raw.config_get("appendfsync")["appendfsync"] == original, f"đã trả appendfsync về {original}")

    note = (f"Thời gian phía client / {FSYNC_WRITES} lệnh, đã trừ RTT {rtt:.3f} ms của PING (Redis không tính "
            "fsync vào thời gian lệnh nên không đo phía server được)")
    ctx.metric("per_write_ms", always, "ms", label="commit_each", note=f"appendfsync always, SET từng lệnh. {note}")
    ctx.metric("per_write_ms", batch, "ms", label="commit_batch",
               note=f"appendfsync always, {FSYNC_WRITES} SET trong một MULTI/EXEC")
    ctx.metric("per_write_ms", everysec, "ms", label="fsync_everysec", note=f"appendfsync everysec. {note}")
    ctx.metric("aof_delayed_fsync", raw.info("persistence").get("aof_delayed_fsync", 0), "lần", label="fsync_everysec",
               note="Số lần fsync nền chưa xong khi tới lượt fsync kế tiếp (đĩa chậm)")
    ctx.statement("commit_each", f"CONFIG SET appendfsync always\nSET {ctx.redis.key('write', 'always', 0)} <400 byte>"
                                 f"\n# ... lặp {FSYNC_WRITES} lần, mỗi lệnh chờ trả lời")
    ctx.statement("commit_batch", f"CONFIG SET appendfsync always\nMULTI\nSET {ctx.redis.key('write', 'batch', 0)} "
                                  f"<400 byte>\n# ... {FSYNC_WRITES} lệnh SET\nEXEC")
    ctx.statement("fsync_everysec", f"CONFIG SET appendfsync everysec\nSET {ctx.redis.key('write', 'everysec', 0)} "
                                    f"<400 byte>\n# ... lặp {FSYNC_WRITES} lần")
    ctx.check(always > everysec, "appendfsync always chậm hơn everysec vì mỗi lần ghi phải chờ fsync")
    ctx.observe(f"Mỗi lệnh ghi: everysec {everysec:.3f} ms, always {always:.3f} ms, always gộp trong MULTI/EXEC "
                f"{batch:.4f} ms. Giống SQL Server, cái giá của bền vững là chờ đĩa; gộp nhiều lệnh vào một lần "
                "fsync (group commit) gần như xoá chi phí đó.")
    ctx.observe("Redis local chạy trong Docker Desktop trên WSL2: mỗi fsync đi qua đĩa ảo (ext4.vhdx) của WSL rồi "
                "mới tới đĩa Windows, khác hẳn đĩa EBS của RDS. Hãy so tỉ lệ giữa các chế độ trên cùng một DBMS, "
                "đừng so thẳng số ms của appendfsync always với COMMIT của SQL Server.")


# --- 3. Error in the middle of a transaction ------------------------------------------------------------
@scenario(title="Transaction lỗi giữa chừng", pair="atomic_rollback")
def atomic_rollback(ctx: Ctx):
    raw = ctx.redis.raw
    views, story = ctx.redis.key("views", 1), ctx.redis.key("story", 1)

    def reset():
        raw.set(views, 0)
        raw.delete(story)
        raw.hset(story, mapping={"Title": "Truyện 1", "RatingAvg": "4.5"})

    # Runtime error: both commands are queued; at EXEC the second one fails (WRONGTYPE), the first is kept.
    reset()
    pipe = raw.pipeline(transaction=True)
    pipe.incrby(views, 100)
    pipe.incr(story)                                          # INCR on a Hash -> WRONGTYPE at EXEC time
    replies = pipe.execute(raise_on_error=False)
    partial = int(raw.get(views) != "0")
    ctx.metric("partial_changes", partial, "key", label="runtime_error",
               note="Số key đã đổi sau khi một lệnh trong MULTI/EXEC lỗi lúc chạy")
    ctx.statement("runtime_error", f"MULTI\nINCRBY {views} 100\nINCR {story}   # key là Hash -> WRONGTYPE\nEXEC")
    ctx.check(isinstance(replies[1], redis_lib.ResponseError) and "WRONGTYPE" in str(replies[1]),
              "lệnh thứ hai lỗi WRONGTYPE khi EXEC")
    ctx.check(partial == 1 and raw.get(views) == "100",
              "Redis không rollback: INCRBY trước đó vẫn được giữ (views = 100)")

    # Queue-time error: an unknown command is rejected while queuing, so EXEC discards the whole transaction.
    reset()
    pipe = raw.pipeline(transaction=True)
    pipe.incrby(views, 100)
    pipe.execute_command("NOSUCHCOMMAND", story)
    try:
        pipe.execute()
        aborted = False
    except redis_lib.ResponseError as exc:                    # ExecAbortError / unknown command
        aborted = "EXECABORT" in str(exc) or "unknown command" in str(exc).lower()
    partial = int(raw.get(views) != "0")
    ctx.metric("partial_changes", partial, "key", label="queue_error",
               note="Lỗi ngay lúc xếp hàng lệnh (lệnh không tồn tại): EXEC huỷ cả transaction")
    ctx.statement("queue_error", f"MULTI\nINCRBY {views} 100\nNOSUCHCOMMAND {story}\nEXEC   # -> EXECABORT")
    ctx.check(aborted and partial == 0, "lỗi lúc xếp hàng: EXEC bị huỷ (EXECABORT), không lệnh nào chạy")

    ctx.observe("MULTI/EXEC chỉ bảo đảm các lệnh chạy liền nhau, không có rollback: lệnh lỗi lúc chạy không hoàn "
                "tác lệnh khác. Chỉ lỗi phát hiện được lúc xếp hàng (sai tên lệnh, sai số tham số) mới huỷ cả khối.")


# --- 4. Accidental delete, recovered with DUMP / RESTORE ------------------------------------------------
TARGET_STORY_SQL = "SELECT TOP (1) StoryId FROM dbo.Chapter GROUP BY StoryId ORDER BY COUNT(*) DESC, StoryId"
CHAPTERS_SQL = ("SELECT ChapterId, StoryId, ChapterNo, Title, Content, WordCount FROM dbo.Chapter "
                "WHERE StoryId = ? ORDER BY ChapterNo")


@scenario(title="Lỡ xoá dữ liệu: khôi phục các dòng", pair="accidental_delete", repeat=10)
def accidental_delete(ctx: Ctx):
    raw = ctx.redis.raw
    story = ctx.sql.scalar(TARGET_STORY_SQL)                  # the same story as the SQL Server scenario
    rows = ctx.sql.query(CHAPTERS_SQL, story)
    fixtures.load_hashes(ctx.redis, rows, "chapter", "ChapterId")
    keys = [ctx.redis.key("chapter", r["ChapterId"]) for r in rows]
    before = {k: raw.hgetall(k) for k in keys}

    # Logical backup: the serialized value of every key. DUMP is binary, so read it with a non-decoding client.
    cfg = ctx.redis.config
    binary = redis_lib.Redis(host=cfg.host, port=cfg.port, password=cfg.password, db=cfg.db, decode_responses=False)
    try:
        backup = {k: binary.dump(k) for k in keys}
    finally:
        binary.close()
    ctx.metric("backup_bytes", sum(len(v) for v in backup.values()), "byte", label="delete_and_restore",
               better="none", note="Tổng kích thước DUMP của các key (định dạng RDB, có nén)")

    deleted = raw.delete(*keys)                               # the accident
    ctx.check(deleted == len(keys) and not raw.exists(*keys), f"đã xoá {deleted} chương của StoryId={story}")
    pipe = raw.pipeline(transaction=False)
    for k, payload in backup.items():
        pipe.restore(k, 0, payload)
    pipe.execute()
    ctx.check(all(raw.hgetall(k) == v for k, v in before.items()),
              f"RESTORE đưa lại đủ {len(keys)} chương, mọi field (kể cả Content) khớp với trước khi xoá")
    ctx.metric("rows_restored", len(keys), "key", label="delete_and_restore", better="none")

    # bench_redis reads SLOWLOG as text and cannot show RESTORE's binary payload, so the server time comes
    # from INFO commandstats instead: the usec counters of DEL and RESTORE before and after each run.
    def server_usec() -> float:
        stats = raw.info("commandstats")
        return sum(stats.get(f"cmdstat_{c}", {}).get("usec", 0) for c in ("del", "restore"))

    samples = []
    for i in range(3 + 10):                                   # 3 warm-up runs, 10 measured runs
        start = server_usec()
        p = raw.pipeline(transaction=False)
        p.delete(*keys)
        for k, payload in backup.items():
            p.restore(k, 0, payload, replace=True)
        p.execute()
        if i >= 3:
            samples.append((server_usec() - start) / 1000)
    p50 = statistics.median(samples)
    ctx.metric("restore_server_ms", p50, "ms", label="delete_and_restore",
               note="Thời gian phía server (INFO commandstats: usec của DEL + RESTORE), trung vị 10 lần")
    ctx.statement("delete_and_restore", f"DEL {keys[0]} ... ({len(keys)} key)\n"
                                        f"RESTORE {keys[0]} 0 <payload DUMP> REPLACE\n# ... {len(keys)} lệnh RESTORE")
    ctx.check(all(raw.hgetall(k) == v for k, v in before.items()), "sau các lần đo lặp lại, dữ liệu vẫn đúng")
    ctx.observe(f"DUMP lưu giá trị của từng key ở dạng nhị phân; xoá nhầm {len(keys)} chương thì RESTORE lại "
                f"được ngay: p50 {p50:.2f} ms phía server cho xoá + khôi phục. Nhưng bản DUMP phải được tạo trước khi "
                "xoá, và nó chỉ đúng tại lúc DUMP; Redis không giữ lịch sử phiên bản như temporal table.")
    ctx.observe("Muốn quay cả Redis về một thời điểm thì chỉ có cách khởi động lại với file RDB/AOF cũ, mất mọi "
                "thay đổi sau thời điểm đó; không có point-in-time restore ở mức key.")


# --- 5. Process crash -----------------------------------------------------------------------------------
def wait_for_server(raw: redis_lib.Redis) -> None:
    """Wait until Redis accepts commands again and has finished loading its AOF."""
    start = time.perf_counter()
    while time.perf_counter() - start < WAIT_TIMEOUT_S:
        try:
            if raw.ping() and not raw.info("persistence")["loading"]:
                return
        except (redis_lib.ConnectionError, redis_lib.BusyLoadingError, redis_lib.TimeoutError):
            pass
        time.sleep(0.05)
    raise TimeoutError("Redis did not come back (is the compose restart policy 'unless-stopped'?)")


@scenario(title="Sự cố giữa chừng: dữ liệu nào còn lại", pair="crash_recovery", targets={"local"},
          destructive=True)
def crash_recovery(ctx: Ctx):
    raw = ctx.redis.raw
    ctx.check(lab_keys_only(ctx), "Redis local chỉ chứa key của lab, tắt server không làm mất dữ liệu của ai")
    pipe = raw.pipeline(transaction=False)
    for n in range(CRASH_KEYS):
        pipe.set(ctx.redis.key("crash", n), n)
        if n % 1000 == 999:
            pipe.execute()                                    # every reply received = acknowledged write
    pipe.execute()
    acked = CRASH_KEYS
    keys_before = raw.dbsize()

    t0 = time.perf_counter()
    try:
        raw.shutdown(nosave=True)                             # stop without writing an RDB snapshot
    except redis_lib.ConnectionError:
        pass
    wait_for_server(raw)                                      # docker restarts the container, Redis loads the AOF
    recovery_ms = (time.perf_counter() - t0) * 1000

    present = sum(1 for _ in raw.scan_iter(ctx.redis.key("crash", "*"), count=1000))
    lost = acked - present
    ctx.statement("crash", f"SET {ctx.redis.key('crash', 0)} 0\n# ... {CRASH_KEYS} lệnh SET, đã nhận trả lời\n"
                           "SHUTDOWN NOSAVE\n# Docker khởi động lại container, Redis nạp lại AOF")
    ctx.metric("acked_writes_lost", lost, "key", label="process_crash",
               note="Số lệnh ghi đã được trả lời OK nhưng không còn sau khi Redis khởi động lại")
    ctx.metric("recovery_ms", recovery_ms, "ms", label="process_crash",
               note="Từ lúc tắt tới khi Redis nhận lệnh lại (gồm Docker khởi động lại container và nạp AOF)")
    ctx.metric("keys_reloaded", raw.dbsize(), "key", label="process_crash", better="none")
    ctx.check(lost == 0 and raw.dbsize() == keys_before,
              f"nạp lại đủ {present}/{acked} key từ AOF, không mất lệnh ghi nào đã được xác nhận")
    ctx.observe(f"Sau SHUTDOWN NOSAVE (không ghi RDB), Redis vẫn nạp lại đủ {present} key từ AOF trong "
                f"{recovery_ms / 1000:.1f} s. SHUTDOWN vẫn flush AOF; với crash thật (kill -9) dữ liệu đã write() "
                "vẫn nằm trong page cache của hệ điều hành, chỉ mất điện/hỏng máy mới mất tới 1 s của everysec.")
    ctx.observe("Khác SQL Server: Redis không có transaction dở dang để undo, mỗi lệnh là một đơn vị; nạp AOF chỉ "
                "là chạy lại các lệnh ghi (redo).")
