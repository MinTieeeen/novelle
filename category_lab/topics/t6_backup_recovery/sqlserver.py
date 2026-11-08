"""SQL Server side of backup_recovery.

RDS takes the backups itself (no BACKUP TO DISK, no rds_backup_database without an option group), so the
backup scenario reads what RDS did from msdb. The other scenarios work on sandbox tables lab.backup_recovery__*.
"""
import re

import pyodbc

from lab.connections import sql_error_number
from lab.framework import Ctx, fixtures, scenario

HISTORY_DAYS = 7        # window of msdb.dbo.backupset that is analysed (RDS keeps 7 days by default)
WRITE_ROWS, WRITE_ROUNDS = 500, 3
TEMPORAL_STORIES = 5    # stories copied into the temporal Chapter table
CRASH_ROWS = 1_000


def named_sql(ctx: Ctx, relative: str, **names: str) -> dict[str, str]:
    """Statements of a .sql file split on '-- name: <x>' lines, with {placeholders} filled in."""
    out: dict[str, list[str]] = {}
    current = None
    for line in ctx.read(relative).splitlines():
        m = re.match(r"--\s*name:\s*(\w+)", line)
        if m:
            current = m.group(1)
            out[current] = []
        elif current:
            out[current].append(line)
    return {k: "\n".join(v).strip().format(**names) for k, v in out.items()}


def sandbox(ctx: Ctx, name: str) -> str:
    return fixtures.sandbox_name(ctx.scenario.topic, name)


# --- 1. Backup mechanism and RPO ------------------------------------------------------------------------
@scenario(title="Cơ chế backup và RPO", pair="backup_rpo")
def backup_rpo(ctx: Ctx):
    state = ctx.sql.query(ctx.read("sql/recovery_state.sql"))[0]
    ctx.capture("recovery_state", state)
    ctx.check(state["recovery_model_desc"] == "FULL",
              "NovelleDB dùng recovery model FULL: mọi thay đổi được giữ trong log cho tới khi log được backup")

    history_sql = ctx.read("sql/backup_history.sql")
    history = {r["type"]: r for r in ctx.sql.query(history_sql, HISTORY_DAYS)}
    ctx.capture("backup_history", list(history.values()))
    ctx.statement("backup_history", history_sql.replace("?", str(HISTORY_DAYS)))

    gaps_sql = ctx.read("sql/backup_gaps.sql")
    log = ctx.sql.query(gaps_sql, "L", 1)[0]               # log backups of the last 24 h
    full = ctx.sql.query(gaps_sql, "D", HISTORY_DAYS)[0]   # full backups of the whole window
    ctx.capture("log_backup_gaps_24h", log)
    ctx.capture("full_backup_gaps", full)
    ctx.statement("backup_gaps", gaps_sql.replace("?", "'L'", 1).replace("?", "1", 1))

    ctx.check("L" in history and "D" in history,
              f"RDS có cả full backup (D) và log backup (L) trong {HISTORY_DAYS} ngày gần nhất")
    ctx.check(bool(log["gaps"]) and log["max_gap_s"] <= 600,
              "log backup chạy đều, khoảng cách lớn nhất giữa hai lần không quá 10 phút")

    # RPO = worst-case seconds of committed data lost, per kind of failure (same labels as redis.py).
    ctx.check(state["delayed_durability_desc"] == "DISABLED",
              "delayed durability tắt: COMMIT chỉ trả về sau khi log đã ghi xuống đĩa")
    ctx.metric("rpo_s", 0, "s", label="process_crash",
               note="Tiến trình crash: crash recovery redo/undo từ log trên đĩa, transaction đã commit không mất")
    ctx.metric("rpo_s", log["max_gap_s"], "s", label="instance_loss",
               note="Mất cả instance: khoảng cách lớn nhất giữa hai log backup trong 24 giờ (point-in-time restore)")
    if full["gaps"]:
        ctx.metric("rpo_s", full["max_gap_s"], "s", label="snapshot_only",
                   note=f"Nếu chỉ có full backup: khoảng cách lớn nhất giữa hai lần trong {HISTORY_DAYS} ngày")
    ctx.metric("since_last_backup_s", log["since_last_s"], "s", label="instance_loss")
    ctx.metric("pending_log_mb", float(state["log_since_last_log_backup_mb"]), "MB", label="instance_loss",
               note="Log đã ghi nhưng chưa có trong log backup nào: phần có thể mất nếu mất cả instance")

    if "L" in history:
        ctx.metric("rds_backup_size_mb", float(history["L"]["avg_size_mb"]), "MB", label="log_backup",
                   better="none", note="Kích thước trung bình một log backup của NovelleDB")
        ctx.metric("rds_backup_duration_s", history["L"]["max_duration_s"], "s", label="log_backup")
    if "D" in history:
        ctx.metric("rds_backup_size_mb", float(history["D"]["avg_size_mb"]), "MB", label="full_backup",
                   better="none", note="Kích thước trung bình một full backup của NovelleDB")
        ctx.metric("rds_backup_duration_s", history["D"]["max_duration_s"], "s", label="full_backup")

    counts = ", ".join(f"{t}={r['backups']}" for t, r in sorted(history.items()))
    ctx.observe(f"Trong {HISTORY_DAYS} ngày RDS đã tạo {counts} bản backup. Log backup cách nhau trung bình "
                f"{log['avg_gap_s']} s (lớn nhất {log['max_gap_s']} s), nên point-in-time restore mất tối đa "
                f"khoảng {log['max_gap_s'] // 60} phút dữ liệu khi mất cả instance.")
    ctx.observe("Backup của RDS được đẩy sang S3, tức là nằm ngoài máy chủ: đây là RPO khi mất cả instance. "
                "Khi chỉ tiến trình SQL Server crash, log trên đĩa giúp không mất transaction đã commit.")


# --- 2. Cost of durable writes --------------------------------------------------------------------------
@scenario(title="Chi phí ghi bền vững", pair="durability_cost")
def durability_cost(ctx: Ctx):
    table = sandbox(ctx, "WriteTest")
    fixtures.ensure_schema(ctx.sql)
    ctx.sql.exec(ctx.read("sql/write_test_table.sql").format(table=table))
    batch = ctx.read("sql/durability_cost.sql").format(table=table)

    results = {}
    for label, each, how in (("commit_each", 1, "mỗi INSERT là một transaction (autocommit)"),
                             ("commit_batch", 0, f"{WRITE_ROWS} INSERT trong một transaction")):
        runs = sorted((ctx.sql.query(batch, WRITE_ROWS, each)[0] for _ in range(WRITE_ROUNDS)),
                      key=lambda r: r["elapsed_ms"])
        r = runs[len(runs) // 2]                                  # median of the rounds
        results[label] = r
        ctx.metric("per_write_ms", float(r["elapsed_ms"]) / WRITE_ROWS, "ms", label=label,
                   note=f"Thời gian phía server / {WRITE_ROWS} dòng, {how}; trung vị {WRITE_ROUNDS} lần")
        ctx.metric("log_flushes", r["log_flushes"], "lần", label=label,
                   note="Log Flushes của NovelleDB trong lúc chạy (gồm cả phiên khác nếu có)")
        ctx.metric("writelog_wait_ms", r["writelog_wait_ms"], "ms", label=label,
                   note="Thời gian phiên này chờ WRITELOG (chờ log ghi xuống đĩa khi COMMIT)")
        ctx.statement(label, batch.replace("@rows int = ?", f"@rows int = {WRITE_ROWS}")
                      .replace("@each bit = ?", f"@each bit = {each}"))

    each, grouped = results["commit_each"], results["commit_batch"]
    total = ctx.sql.scalar(f"SELECT COUNT(*) FROM {table}")
    ctx.check(total == 2 * WRITE_ROWS * WRITE_ROUNDS, f"đã ghi đủ {total} dòng")
    ctx.check(each["log_flushes"] >= WRITE_ROWS * 0.9,
              "commit từng dòng: mỗi COMMIT buộc một lần flush log xuống đĩa")
    ctx.check(grouped["log_flushes"] * 10 < each["log_flushes"],
              "commit theo lô: số lần flush log ít hơn hơn 10 lần")
    speedup = float(each["elapsed_ms"]) / max(float(grouped["elapsed_ms"]), 0.001)
    ctx.observe(f"Commit từng dòng: {each['log_flushes']} lần flush, chờ WRITELOG {each['writelog_wait_ms']} ms. "
                f"Một transaction cho {WRITE_ROWS} dòng: {grouped['log_flushes']} lần flush, nhanh hơn khoảng "
                f"{speedup:.0f} lần. Chi phí bền vững nằm ở việc chờ log xuống đĩa lúc COMMIT (write-ahead log).")
    ctx.observe("Delayed durability (COMMIT không chờ flush) sẽ giống appendfsync everysec của Redis, nhưng phải "
                "ALTER DATABASE trên RDS dùng chung nên không thử ở đây.")


# --- 3. Error in the middle of a transaction ------------------------------------------------------------
@scenario(title="Transaction lỗi giữa chừng", pair="atomic_rollback")
def atomic_rollback(ctx: Ctx):
    table = ctx.sandbox_table("Story", "dbo.Story", top=2, primary_key=["StoryId"])
    q = named_sql(ctx, "sql/atomic_rollback.sql", table=table)
    a, b = [r["StoryId"] for r in ctx.sql.query(q["snapshot"])]

    def changed_rows(before: list[dict]) -> int:
        return sum(1 for x, y in zip(before, ctx.sql.query(q["snapshot"])) if x != y)

    # Explicit BEGIN TRAN on an autocommit session: the lab's exec() commits when its cursor closes, so an
    # autocommit=False connection would commit after every statement. Values are inlined (integers) because
    # a parameterized call runs through sp_executesql, which may not leave a transaction open (error 266).
    step1, step2 = q["add_views"].replace("?", str(a)), q["divide_by_zero"].replace("?", str(b))
    for label, xact in (("runtime_error", "ON"), ("runtime_error_xact_abort_off", "OFF")):
        before = ctx.sql.query(q["snapshot"])
        conn = ctx.sql.new_connection()
        error = None
        try:
            conn.exec(f"SET XACT_ABORT {xact}; BEGIN TRANSACTION;")
            conn.exec(step1)                                  # step 1 succeeds
            try:
                conn.exec(step2)                              # step 2 fails at run time (error 8134)
            except pyodbc.Error as exc:
                error = sql_error_number(exc)
            open_tran = conn.scalar("SELECT @@TRANCOUNT")
            conn.exec("IF @@TRANCOUNT > 0 COMMIT TRANSACTION;")   # the application then calls COMMIT
        finally:
            conn.close()
        partial = changed_rows(before)
        ctx.metric("partial_changes", partial, "dòng", label=label,
                   note=f"XACT_ABORT {xact}: số dòng đã đổi sau khi bước 2 lỗi rồi gọi COMMIT")
        ctx.statement(label, f"SET XACT_ABORT {xact};\nBEGIN TRANSACTION;\n{step1}\n{step2}  -- lỗi 8134\nCOMMIT;")
        ctx.check(error == 8134, f"XACT_ABORT {xact}: bước 2 báo lỗi chia cho 0 (8134)")
        if xact == "ON":
            ctx.check(partial == 0 and open_tran == 0,
                      "XACT_ABORT ON: lỗi huỷ cả transaction, bước 1 cũng được ROLLBACK")
        else:
            ctx.check(partial == 1 and open_tran == 1,
                      "XACT_ABORT OFF: chỉ câu lỗi bị huỷ, transaction vẫn mở và COMMIT giữ lại bước 1")

    before = ctx.sql.query(q["snapshot"])
    try:
        ctx.sql.exec(q["compile_error"], a, b)
        error = None
    except pyodbc.Error as exc:
        error = sql_error_number(exc)
    partial = changed_rows(before)
    ctx.metric("partial_changes", partial, "dòng", label="queue_error",
               note="Lỗi biên dịch (cột không tồn tại): cả batch không chạy")
    ctx.statement("queue_error", q["compile_error"].replace("?", str(a), 1).replace("?", str(b), 1))
    ctx.check(error == 207 and partial == 0, "lỗi biên dịch (207): không câu nào trong batch được chạy")

    ctx.observe("SQL Server bảo đảm atomicity bằng undo log: khi transaction bị huỷ, mọi thay đổi được hoàn tác. "
                "Nhưng mặc định XACT_ABORT OFF chỉ huỷ câu lỗi; ứng dụng phải bật XACT_ABORT ON hoặc dùng "
                "TRY/CATCH + ROLLBACK thì mới có all-or-nothing.")


# --- 4. Accidental delete, recovered with a temporal table ----------------------------------------------
@scenario(title="Lỡ xoá dữ liệu: khôi phục các dòng", pair="accidental_delete", repeat=10)
def accidental_delete(ctx: Ctx):
    table, history = sandbox(ctx, "Chapter"), sandbox(ctx, "ChapterHistory")
    q = named_sql(ctx, "sql/accidental_delete.sql", table=table, history=history)
    story = ctx.sql.scalar(q["target_story"])
    before = ctx.sql.query(q["fingerprint"], story)[0]
    as_of = ctx.sql.scalar(q["now_utc"])                      # the "last good moment", UTC like the period columns

    deleted = ctx.sql.exec(q["accident"], story)              # the accident: a DELETE without the right WHERE
    ctx.check(ctx.sql.query(q["fingerprint"], story)[0]["chapters"] == 0,
              f"sau DELETE, truyện StoryId={story} không còn chương nào")
    ctx.sql.exec(q["restore"], as_of, story)
    after = ctx.sql.query(q["fingerprint"], story)[0]
    restored = after["chapters"]
    ctx.check(restored == deleted == before["chapters"], f"khôi phục đủ {restored}/{deleted} chương đã xoá")
    ctx.check(after["checksum"] == before["checksum"], "checksum toàn bộ cột (kể cả Content) khớp với trước khi xoá")
    ctx.statement("accident", q["accident"].replace("?", str(story)))
    ctx.statement("restore", q["restore"].replace("?", f"'{as_of}'", 1).replace("?", str(story), 1))

    stats = ctx.bench_sql("delete_and_restore", q["delete_and_restore"], as_of, story, story, inner=1)
    final = ctx.sql.query(q["fingerprint"], story)[0]
    ctx.check(final == before, "sau các lần đo lặp lại, dữ liệu vẫn đúng như lúc đầu")
    ctx.metric("restore_server_ms", stats.p50, "ms", label="delete_and_restore",
               note="Thời gian phía server của DELETE + INSERT ... FOR SYSTEM_TIME AS OF (p50)")
    ctx.metric("rows_restored", restored, "dòng", label="delete_and_restore", better="none")
    ctx.metric("history_rows", ctx.sql.scalar(q["history_rows"]), "dòng", label="delete_and_restore",
               better="none", note="Số phiên bản cũ temporal table đang giữ (chi phí lưu trữ của cách này)")
    ctx.observe(f"Temporal table giữ mọi phiên bản cũ trong bảng history, nên DELETE nhầm {deleted} chương được "
                f"lấy lại bằng FOR SYSTEM_TIME AS OF mà không cần restore cả database: p50 {stats.p50:.2f} ms "
                "cho xoá + khôi phục.")
    ctx.observe("Cách khác trên RDS là point-in-time restore, nhưng nó tạo một instance mới (mất nhiều phút) rồi "
                "phải chép dữ liệu về; temporal table phù hợp khi cần khôi phục ở mức dòng.")


@accidental_delete.setup
def _(ctx: Ctx):
    fixtures.ensure_schema(ctx.sql)
    ctx.sql.exec_script(ctx.read("sql/chapter_temporal.sql").format(
        table=sandbox(ctx, "Chapter"), history=sandbox(ctx, "ChapterHistory"), stories=TEMPORAL_STORIES))


@accidental_delete.teardown
def _(ctx: Ctx):
    ctx.sql.exec_script(ctx.read("sql/chapter_drop_temporal.sql").format(
        table=sandbox(ctx, "Chapter"), history=sandbox(ctx, "ChapterHistory")))


# --- 5. Failure in the middle of work -------------------------------------------------------------------
@scenario(title="Sự cố giữa chừng: dữ liệu nào còn lại", pair="crash_recovery")
def crash_recovery(ctx: Ctx):
    table = sandbox(ctx, "CrashTest")
    fixtures.ensure_schema(ctx.sql)
    ctx.sql.exec(ctx.read("sql/write_test_table.sql").format(table=table))
    q = named_sql(ctx, "sql/crash_recovery.sql", table=table)

    insert = q["insert_rows"].replace("?", str(CRASH_ROWS))  # inlined: see atomic_rollback
    conn = ctx.sql.new_connection()
    spid = conn.scalar("SELECT @@SPID")
    conn.exec(f"BEGIN TRANSACTION; {insert}; COMMIT TRANSACTION;")   # acknowledged: COMMIT returned
    conn.exec(f"BEGIN TRANSACTION; {insert};")                       # in flight: never committed
    in_flight = conn.scalar(q["row_count"])
    conn.close()                                              # the session disconnects before COMMIT
    open_tran = ctx.sql.scalar("SELECT COUNT(*) FROM sys.dm_tran_session_transactions WHERE session_id = ?", spid)
    present = ctx.sql.scalar(q["row_count"])

    ctx.statement("committed", f"BEGIN TRANSACTION;\n{insert}\nCOMMIT;")
    ctx.statement("in_flight", f"BEGIN TRANSACTION;\n{insert}\n-- phiên bị ngắt trước khi COMMIT")
    ctx.check(open_tran == 0, "sau khi ngắt kết nối, SQL Server không còn giữ transaction nào của phiên đó")
    ctx.metric("acked_writes_lost", CRASH_ROWS - min(present, CRASH_ROWS), "dòng", label="process_crash",
               note="Số dòng đã COMMIT thành công nhưng không còn sau sự cố")
    ctx.metric("unacked_writes_kept", max(present - CRASH_ROWS, 0), "dòng", label="process_crash",
               note="Số dòng chưa COMMIT mà vẫn còn (vi phạm atomicity nếu > 0)")
    ctx.check(in_flight == 2 * CRASH_ROWS, "trước sự cố, phiên thấy cả dòng đã commit và dòng đang ghi")
    ctx.check(present == CRASH_ROWS, f"sau sự cố còn đúng {CRASH_ROWS} dòng đã COMMIT, phần dở dang bị ROLLBACK")
    ctx.observe("Phiên bị ngắt giữa transaction: SQL Server hoàn tác phần chưa commit bằng undo trong log. "
                "Khi cả tiến trình SQL Server crash, lúc khởi động lại crash recovery làm redo (ghi lại phần đã "
                "commit) rồi undo (bỏ phần dở dang); không thể làm sập RDS dùng chung để đo, nên chỉ thử ở mức phiên.")
