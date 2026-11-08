"""SQL Server side of t2_transaction: T1-T3 on lab.transaction__* copies of the web tables.

dbo is only read (to copy users, requests, authors and one story); every write goes to the sandbox, which
the runner drops after the topic. The SQL is in sql/*.sql; the approval batches are copies of
dbo.sp_ApproveAuthorRequest that point at the sandbox and return errors as rows instead of re-throwing.
"""
from __future__ import annotations

import time
from typing import Any

import pyodbc

from lab.connections import sql_error_number
from lab.framework import Ctx, fixtures, scenario
from lab.framework.bench import inline_params
from lab.framework.concurrency import run_workers

from . import common as c

CONSTRAINT_ERRORS = (2627, 2601)                 # duplicate key on a PRIMARY KEY / UNIQUE constraint or index
LOGIC_ERRORS = range(50001, 50005)               # THROW 5000x of the approval (05_procedures.sql)


# --- author-approval sandbox (T1, T2) ---------------------------------------------------------------------
def setup_authors(ctx: Ctx) -> None:
    fixtures.ensure_schema(ctx.sql)
    ctx.run_sql_file("sql/authors_setup.sql")


def reset_authors(ctx: Ctx) -> tuple[list[int], list[int]]:
    """Fresh copy of User / AuthorRequest / Author; returns (2 admins, 2 readers without a pending request)."""
    ctx.sql.exec(ctx.read("sql/authors_reset.sql"))
    rows = ctx.sql.query(ctx.read("sql/authors_pick_users.sql"))
    return ([r["UserId"] for r in rows if r["Kind"] == "ADMIN"],
            [r["UserId"] for r in rows if r["Kind"] == "READER"])


def new_request(ctx: Ctx, user_id: int, pen_name: str) -> int:
    return ctx.sql.scalar(ctx.read("sql/authors_new_request.sql"), user_id, pen_name)


def author_checks(ctx: Ctx) -> dict[str, int]:
    return ctx.sql.query(ctx.read("sql/authors_checks.sql"))[0]


def author_state(ctx: Ctx, req1: int, req2: int) -> list[dict[str, Any]]:
    return ctx.sql.query(ctx.read("sql/authors_state.sql"), req1, req2)


def describe(row: dict[str, Any]) -> str:
    """'APPROVED' / 'REJECTED 50001' / 'ERROR 2627 (PK_...)' plus deadlocks, for the observations."""
    text = row["Outcome"]
    if row["ErrorNumber"]:
        text += f" {row['ErrorNumber']}"
        if row["ErrorNumber"] in CONSTRAINT_ERRORS:
            msg = row["ErrorMessage"] or ""
            name = msg.split("constraint '")[1].split("'")[0] if "constraint '" in msg else "unique"
            text += f" ({name})"
    if row.get("LockWaitMs") is not None and row["LockWaitMs"] >= 50:
        text += f", chờ khoá {row['LockWaitMs']:.0f} ms"
    if row.get("deadlocks"):
        text += f", là nạn nhân deadlock {row['deadlocks']} lần rồi retry"
    return text


# --- T1 -----------------------------------------------------------------------------------------------------
# (label, batch file, cases it applies to, drop UQ_Author_PenName first)
T1_VARIANTS = [
    ("read_then_write", "t1_approve_no_lock.sql", ("same_request", "same_pen_name"), False),
    ("read_then_write_no_unique", "t1_approve_no_lock.sql", ("same_pen_name",), True),
    ("guarded", "t1_approve_locked.sql", ("same_request", "same_pen_name"), False),
    ("atomic", "t1_approve_conditional.sql", ("same_request", "same_pen_name"), False),
    ("repeatable_read", "t1_approve_repeatable_read.sql", ("same_request",), False),
]


@scenario(title="T1 · Hai admin duyệt yêu cầu làm tác giả cùng lúc", pair="concurrent_approval")
def concurrent_approval(ctx: Ctx):
    """Two ADMIN sessions run the approval of sp_ApproveAuthorRequest at the same moment, (a) on the same
    request and (b) on two requests proposing the same pen name. Correct result: exactly one approval, the
    other admin rejected, RB13 holds, no pen name used twice. Variants: no locks (read_then_write), the
    production locks UPDLOCK + HOLDLOCK (guarded), a conditional UPDATE (atomic), REPEATABLE READ."""
    setup_authors(ctx)
    for case, case_text in c.CASES.items():
        for label, file, cases, drop_unique in T1_VARIANTS:
            if case in cases:
                _t1_run(ctx, case, case_text, f"{case}.{label}", file, drop_unique)
    ctx.observe("Không khoá (read_then_write): cả hai admin đều đọc thấy PENDING; thứ chặn admin thứ hai là "
                "PK_Author / UQ_Author_PenName (lỗi 2627), không phải logic. Bỏ UNIQUE đi thì hai tác giả "
                "dùng chung một bút danh. UPDLOCK + HOLDLOCK (như sp_ApproveAuthorRequest) và UPDATE có điều kiện "
                "đều cho đúng 1 lần duyệt; admin sau chờ khoá rồi bị từ chối bằng 50001 / 50003. REPEATABLE READ "
                "giữ khoá S đến cuối transaction nên hai phiên chặn nhau thành deadlock (1205) và phải retry.")


def _t1_run(ctx: Ctx, case: str, case_text: str, label: str, file: str, drop_unique: bool) -> None:
    admins, readers = reset_authors(ctx)
    if drop_unique:
        ctx.run_sql_file("sql/authors_drop_unique_pen_name.sql")
    try:
        pen = c.PEN_NAMES[case]
        if case == "same_request":
            req = new_request(ctx, readers[0], pen)
            plan, reqs = [(req, admins[0]), (req, admins[1])], (req, req)
        else:
            r1, r2 = new_request(ctx, readers[0], pen), new_request(ctx, readers[1], pen)
            plan, reqs = [(r1, admins[0]), (r2, admins[1])], (r1, r2)
        sql = ctx.read(f"sql/{file}")

        def approve(w, i):
            req_id, admin = plan[w.index]
            think, deadlocks = c.THINK_MS, 0
            while True:
                row = w.sql.query(sql, req_id, admin, think)[0]
                if row["ErrorNumber"] == 1205 and deadlocks < c.DEADLOCK_RETRIES:
                    deadlocks, think = deadlocks + 1, 0          # retry the victim, without the pause
                    continue
                row["deadlocks"] = deadlocks
                return row

        r = ctx.workers(2, approve, timeout_s=120)
        rows = [r.results[i][0] for i in range(2)]
        chk = author_checks(ctx)
        state = author_state(ctx, *reqs)
    finally:
        if drop_unique:                       # duplicates must go before the constraint can come back
            reset_authors(ctx)
            ctx.run_sql_file("sql/authors_add_unique_pen_name.sql")

    done = [x for x in rows if x]
    approvals = sum(1 for x in done if x["Outcome"] == "APPROVED")
    logic = sum(1 for x in done if x["ErrorNumber"] in LOGIC_ERRORS)
    constraint = sum(1 for x in done if x["ErrorNumber"] in CONSTRAINT_ERRORS)
    deadlocks = sum(x["deadlocks"] for x in done)
    other = len(r.errors) + sum(1 for x in done if x["Outcome"] == "ERROR"
                                and x["ErrorNumber"] not in CONSTRAINT_ERRORS)
    c.record_t1(ctx, label, approvals=approvals, rejected_logic=logic, rejected_constraint=constraint,
                rb13=chk["Rb13Violations"], duplicates=chk["PenNameDuplicates"], errors=other)
    ctx.metric("deadlocks", deadlocks, "lần", label=label, note="lỗi 1205, phiên bị chọn làm nạn nhân rồi retry")
    waits = [x["LockWaitMs"] for x in done if x.get("LockWaitMs") is not None]
    if waits:
        ctx.metric("lock_wait_ms", max(waits), "ms", label=label, better="none",
                   note="thời gian phiên chờ lâu nhất phải đợi để lấy đủ khoá (đo trong batch)")
    ctx.statement(label, inline_params(sql, (plan[0][0], plan[0][1], c.THINK_MS)),
                  note=f"{case_text}; admin 2 chạy cùng batch với RequestId={plan[1][0]}, AdminId={plan[1][1]}")

    reviewed = ", ".join(f"yêu cầu {s['RequestId']}: {s['Status']} (ReviewedBy={s['ReviewedBy']}, "
                         f"Role={s['Role']}, bút danh={s['PenName']})" for s in state)
    ctx.observe(f"{label}: admin 1 → {describe(rows[0]) if rows[0] else 'exception'}; admin 2 → "
                f"{describe(rows[1]) if rows[1] else 'exception'}. Sau cùng: {reviewed}.")

    variant = label.split(".", 1)[1]
    if variant in ("guarded", "atomic", "repeatable_read"):
        ctx.check(approvals == 1 and chk["Rb13Violations"] == 0 and chk["PenNameDuplicates"] == 0,
                  f"{label}: đúng 1 lần duyệt, RB13 đúng, không trùng bút danh")
    if variant in ("guarded", "atomic"):
        ctx.check(logic == 1 and constraint == 0, f"{label}: admin thứ hai bị từ chối bởi logic (5000x), không cần tới ràng buộc")
    if variant == "repeatable_read":
        ctx.check(deadlocks >= 1, f"{label}: tái hiện được deadlock 1205 do hai khoá S cùng nâng lên X")
    if variant == "read_then_write":
        ctx.check(approvals == 1 and constraint == 1, f"{label}: không khoá thì chỉ ràng buộc PK/UNIQUE chặn được admin thứ hai")
    if variant == "read_then_write_no_unique":
        ctx.check(chk["PenNameDuplicates"] >= 1, f"{label}: bỏ UQ_Author_PenName thì hai tác giả trùng bút danh")


# --- T2 -----------------------------------------------------------------------------------------------------
@scenario(title="T2 · Lỗi ở bước 3 của việc duyệt tác giả", pair="error_mid_transaction")
def error_mid_transaction(ctx: Ctx):
    """An approval writes 3 things: AuthorRequest.Status, User.Role, the Author row. The 3rd write fails
    (the pen name is already used: UQ_Author_PenName, 2627). Correct result: nothing of the approval is
    left (RB13 holds). Variants: no transaction, transaction managed by the client (pyodbc rollback),
    XACT_ABORT + TRY/CATCH in T-SQL (the pattern of 05_procedures.sql), and COMMIT after a caught error."""
    setup_authors(ctx)
    for label, run in (("no_transaction", _t2_no_transaction), ("app_transaction", _t2_app_transaction),
                       ("in_transaction", _t2_batch("t2_in_transaction.sql")),
                       ("commit_after_error", _t2_batch("t2_commit_after_error.sql"))):
        admins, readers = reset_authors(ctx)
        taken = ctx.sql.scalar(ctx.read("sql/authors_taken_pen_name.sql"))
        req, user, admin = new_request(ctx, readers[0], taken), readers[0], admins[0]
        info = run(ctx, label, req, admin, user, taken)

        s = author_state(ctx, req, req)[0]
        chk = author_checks(ctx)
        persisted = (s["Status"] == "APPROVED") + (s["Role"] == "AUTHOR") + (s["ApprovedRequestId"] == req)
        c.record_t2(ctx, label, persisted=persisted, rb13=chk["Rb13Violations"])
        if info.get("XactStateInCatch") is not None:
            ctx.metric("xact_state_in_catch", info["XactStateInCatch"], "", label=label, better="none",
                       note="XACT_STATE() trong CATCH: -1 = không commit được, 1 = vẫn commit được")
        ctx.observe(f"{label}: lỗi {info.get('ErrorNumber')} ở bước 3; trong transaction Role đã là "
                    f"{info.get('RoleInside')}; sau cùng request={s['Status']}, Role={s['Role']}, "
                    f"có hồ sơ Author={'có' if s['ApprovedRequestId'] == req else 'không'} → còn {persisted}/3 bước, "
                    f"{chk['Rb13Violations']} vi phạm RB13.")
        if label in ("no_transaction", "commit_after_error"):
            ctx.check(persisted == 2 and chk["Rb13Violations"] >= 1,
                      f"{label}: bước 1-2 vẫn còn, dữ liệu vi phạm RB13 (AUTHOR mà không có hồ sơ)")
        else:
            ctx.check(persisted == 0 and chk["Rb13Violations"] == 0, f"{label}: rollback cả 3 bước, RB13 đúng")
        if label == "in_transaction":
            ctx.check(info.get("XactStateInCatch") == -1, "XACT_ABORT ON: transaction bị đánh dấu không commit được (-1)")
        if label == "commit_after_error":
            ctx.check(info.get("XactStateInCatch") == 1, "XACT_ABORT OFF: lỗi 2627 chỉ huỷ câu lệnh, transaction vẫn commit được (1)")
    ctx.observe("SQL Server chỉ 'all or nothing' khi các bước nằm trong một transaction VÀ lỗi dẫn tới ROLLBACK: "
                "XACT_ABORT ON + TRY/CATCH (như mọi procedure của Novelle) hoặc rollback ở phía ứng dụng. "
                "BEGIN TRANSACTION mà để XACT_ABORT OFF rồi vẫn COMMIT thì kết quả giống như không có transaction.")


def _steps(ctx: Ctx, req: int, admin: int, user: int, pen: str) -> list[tuple[str, tuple]]:
    return [(ctx.read("sql/t2_step1_request.sql"), (admin, req)),
            (ctx.read("sql/t2_step2_user.sql"), (user,)),
            (ctx.read("sql/t2_step3_author.sql"), (user, pen, req))]


def _steps_text(steps: list[tuple[str, tuple]]) -> str:
    return "\n".join(inline_params(sql, params) for sql, params in steps)


def _t2_no_transaction(ctx: Ctx, label: str, req: int, admin: int, user: int, pen: str) -> dict:
    """Autocommit: each statement is its own transaction, committed as soon as it runs."""
    steps = _steps(ctx, req, admin, user, pen)
    ctx.statement(label, "-- autocommit: mỗi câu là một transaction riêng\n" + _steps_text(steps))
    info: dict[str, Any] = {}
    try:
        for sql, params in steps:
            ctx.sql.exec(sql, *params)
            info["RoleInside"] = ctx.sql.scalar(ctx.read("sql/t2_role_of.sql"), user)
    except pyodbc.Error as exc:
        info["ErrorNumber"] = sql_error_number(exc)
    return info


def _t2_app_transaction(ctx: Ctx, label: str, req: int, admin: int, user: int, pen: str) -> dict:
    """What Spring @Transactional does: autocommit off, the client calls rollback() when a step fails."""
    steps = _steps(ctx, req, admin, user, pen)
    ctx.statement(label, "-- pyodbc autocommit=False: BEGIN TRANSACTION ngầm định\n" + _steps_text(steps)
                  + "\n-- lỗi ở câu cuối -> ứng dụng gọi conn.rollback()")
    info: dict[str, Any] = {}
    db = ctx.sql.new_connection(autocommit=False)
    try:
        for sql, params in steps:
            _run_no_commit(db, sql, *params)
            info["RoleInside"] = _run_no_commit(db, ctx.read("sql/t2_role_of.sql"), user)[0][0]
        db.conn.commit()
    except pyodbc.Error as exc:
        info["ErrorNumber"] = sql_error_number(exc)
        db.conn.rollback()
    finally:
        db.close()
    return info


def _run_no_commit(db, sql: str, *params: Any) -> list:
    """Run a statement on a connection with autocommit off WITHOUT committing. SqlServer.exec/query use
    `with conn.cursor()`, and a pyodbc cursor commits the connection when its with-block ends, which would
    turn every step into its own transaction. Returns the rows of a SELECT ([] otherwise)."""
    cur = db.conn.cursor()
    try:
        cur.execute(sql, *params)
        return cur.fetchall() if cur.description else []
    finally:
        cur.close()                               # close() does not commit


def _t2_batch(file: str):
    def run(ctx: Ctx, label: str, req: int, admin: int, user: int, pen: str) -> dict:
        sql = ctx.read(f"sql/{file}")
        ctx.statement(label, inline_params(sql, (req, admin, user, pen)))
        with ctx.sql.new_connection() as db:      # own session: the SET XACT_ABORT of the batch stays there
            return db.query(sql, req, admin, user, pen)[0]
    return run


# --- T3 -----------------------------------------------------------------------------------------------------
T3_VARIANTS = [("trigger_recompute", "t3_rate_trigger.sql"), ("atomic_increment", "t3_rate_increment.sql")]


@scenario(title="T3 · Nhiều độc giả cùng đánh giá một truyện khi tải tăng", pair="rating_under_load")
def rating_under_load(ctx: Ctx):
    """200 ratings of one story by 1 / 10 / 50 / 100 concurrent sessions. trigger_recompute is the web's
    design (INSERT Rating; trg_Rating recomputes RatingAvg/RatingCount from all ratings), atomic_increment
    updates the story with RatingSum + score, RatingCount + 1. Recorded: throughput, client latency
    p50/p95/p99, server time in the batch, deadlocks, failures, and whether the story is consistent."""
    fixtures.ensure_schema(ctx.sql)
    ctx.run_sql_file("sql/rating_setup.sql")
    story = c.LOAD_STORY_ID
    for variant, file in T3_VARIANTS:
        sql = ctx.read(f"sql/{file}")
        ctx.statement(variant, inline_params(sql, (1, story, c.load_score(0))),
                      note=f"mỗi client chạy batch này {c.LOAD_TOTAL} / số client lần, UserId khác nhau")
        lines = []
        for n in c.LOAD_CLIENTS:
            ctx.sql.exec(ctx.read("sql/rating_reset.sql"), story)
            r, server, st = _t3_level(ctx, sql, story, n)
            label = f"{variant}_c{n}"
            ok = sum(1 for x in c.flat(r) if x["ok"])
            consistent = (st["RatingCount"] == st["RatingRows"] == ok
                          and st["RatingAvg"] == st["RecomputedAvg"])
            summary = c.record_load(ctx, label, r, consistent=consistent, conflicts_name="deadlocks",
                                    conflicts_note="lỗi 1205 (deadlock), mỗi lần đều được retry")
            ctx.metric("server_elapsed_p50_ms", c.percentile(server, 50), "ms", label=label,
                       note="thời gian trong batch trên server (gồm chờ khoá), không gồm mạng")
            ctx.metric("server_elapsed_p95_ms", c.percentile(server, 95), "ms", label=label)
            lines.append(c.load_line(n, summary, "deadlock") +
                         f", server p50 {c.percentile(server, 50):.1f} ms; RatingCount={st['RatingCount']}, "
                         f"RatingAvg={st['RatingAvg']} ({'khớp' if consistent else 'LỆCH'})")
            ctx.check(consistent, f"{label}: RatingCount/RatingAvg khớp với tính lại từ bảng Rating")
        ctx.observe(f"{variant}: " + "; ".join(lines) + ".")
    ctx.observe("Độ trễ ở client gồm khoảng một vòng mạng tới RDS cho mỗi yêu cầu; server_elapsed_* là phần "
                "SQL Server xử lý (gồm chờ khoá trên dòng Story).")


def _t3_level(ctx: Ctx, sql: str, story: int, n: int):
    """One load level: n pre-opened sessions, LOAD_TOTAL ratings in total, deadlock victims retried."""
    per = c.LOAD_TOTAL // n
    conns = iter(c.open_in_parallel(lambda: ctx.sql.new_connection(), n))
    deadline: list[float] = []                   # set when the first request starts

    def rate(w, i):
        if not deadline:
            deadline.append(time.perf_counter() + c.LOAD_BUDGET_S)
        if time.perf_counter() > deadline[0]:
            return c.not_run()
        k = i * n + w.index
        start, deadlocks, server_ms = time.perf_counter(), 0, 0.0
        while True:
            row = w.sql.query(sql, k + 1, story, c.load_score(k))[0]
            server_ms += float(row["ServerMs"])
            if (row["ErrorNumber"] == 1205 and deadlocks < c.LOAD_DEADLOCK_RETRIES
                    and time.perf_counter() < deadline[0]):
                deadlocks += 1
                continue
            break
        return {"ok": row["ErrorNumber"] is None, "error": row["ErrorNumber"], "conflicts": deadlocks,
                "latency_ms": (time.perf_counter() - start) * 1000, "server_ms": server_ms}

    r = run_workers(n, rate, iterations=per, open_sql=lambda: next(conns), timeout_s=c.LOAD_TIMEOUT_S)
    state = ctx.sql.query(ctx.read("sql/rating_state.sql"), story, story, story)[0]
    return r, [x["server_ms"] for x in c.flat(r) if not x.get("not_run")], state
