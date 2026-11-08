"""Shared by sqlserver.py and redis.py of t2_transaction: the parameters of T1-T3, the metrics both sides
record (same name + label -> compared side by side in the report), and small helpers.

T1  concurrent_approval     two ADMINs approve author requests at the same time (sp_ApproveAuthorRequest)
T2  error_mid_transaction   the 3rd write of an approval fails (request -> user role -> Author profile)
T3  rating_under_load       1 / 10 / 50 / 100 readers rate the same story (Rating -> Story.RatingAvg)
"""
from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Iterable

import redis

from lab.framework import Ctx
from lab.framework.concurrency import WorkersResult

# --- T1 -------------------------------------------------------------------------------------------------
# A pause inside the approval (SQL: WAITFOR in the batch; Redis: a barrier between read and write) so the
# two admins surely overlap. Without it the race still exists but only shows up now and then.
THINK_MS = 300
CASES = {
    "same_request": "hai admin cùng duyệt MỘT yêu cầu",
    "same_pen_name": "hai admin duyệt HAI yêu cầu đề xuất CÙNG một bút danh",
}
PEN_NAMES = {"same_request": "Lab Bút Danh A", "same_pen_name": "Lab Bút Danh B"}
DEADLOCK_RETRIES = 5            # SQL Server: retry a deadlock victim (1205) at most this many times
WATCH_RETRIES = 20              # Redis T1: retry an aborted EXEC (WATCH conflict) at most this many times

# --- T3 -------------------------------------------------------------------------------------------------
LOAD_CLIENTS = (1, 10, 50, 100)
LOAD_TOTAL = 200                # same number of ratings at every level: 200 / clients per client
LOAD_STORY_ID = 1               # the most rated story of the seed data (only its title is copied)
LOAD_WATCH_RETRIES = 10_000
LOAD_DEADLOCK_RETRIES = 20
# Time budget of one load level: after it no new request is started (counted as not_run). Without it the
# trigger variant at 50-100 sessions runs for tens of minutes on the shared RDS (deadlock after deadlock).
LOAD_BUDGET_S = 60
LOAD_TIMEOUT_S = 900


def not_run() -> dict:
    """What a worker returns for a request it did not start because the level's budget was spent."""
    return {"ok": False, "not_run": True, "conflicts": 0, "latency_ms": 0.0, "server_ms": 0.0}


def load_score(k: int) -> int:
    """Score of the k-th rating: 1..5 in turn, so 200 ratings average exactly 3.00."""
    return k % 5 + 1


EXPECTED_AVG = "3.00"


# --- numbers ---------------------------------------------------------------------------------------------
def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile (p in 0..100); 0 for an empty list."""
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]


def flat(r: WorkersResult) -> list[Any]:
    """Every value the workers returned, errors (None) left out."""
    return [v for per_worker in r.results for v in per_worker if v is not None]


# --- T1 / T2 metrics (same names on both sides) ------------------------------------------------------------
def record_t1(ctx: Ctx, label: str, *, approvals: int, rejected_logic: int, rb13: int, duplicates: int,
              rejected_constraint: int | None = None, errors: int = 0) -> None:
    ctx.metric("approvals_reported", approvals, "lần", label=label, better="none",
               note="số admin được báo 'duyệt thành công' (đúng phải là 1)")
    ctx.metric("rejected_by_logic", rejected_logic, "lần", label=label, better="none",
               note="bị từ chối bởi kiểm tra nghiệp vụ: đã xử lý / bút danh đã dùng")
    if rejected_constraint is not None:
        ctx.metric("rejected_by_constraint", rejected_constraint, "lần", label=label, better="none",
                   note="bị chặn bởi PK / UNIQUE (lỗi 2627), không phải bởi logic")
    ctx.metric("rb13_violations", rb13, "dòng", label=label,
               note="RB13: Role=AUTHOR <=> có hồ sơ Author trỏ tới yêu cầu APPROVED của chính user đó")
    ctx.metric("pen_name_duplicates", duplicates, "bút danh", label=label,
               note="bút danh bị hai tác giả cùng dùng")
    ctx.metric("errors", errors, "lỗi", label=label)


def record_t2(ctx: Ctx, label: str, *, persisted: int, rb13: int) -> None:
    ctx.metric("writes_persisted", persisted, "/3 bước", label=label,
               note="số bước còn lại sau lỗi ở bước 3 (đúng 'all or nothing' phải là 0)")
    ctx.metric("rb13_violations", rb13, "dòng", label=label)


# --- T3 metrics ------------------------------------------------------------------------------------------
def record_load(ctx: Ctx, label: str, r: WorkersResult, *, consistent: bool, conflicts_name: str,
                conflicts_note: str) -> dict[str, float]:
    """Throughput, client latency percentiles, failures, conflicts and final consistency of one load level.
    Each worker call returns {"ok", "latency_ms", "conflicts", ...}."""
    rows = [x for x in flat(r) if not x.get("not_run")]
    skipped = r.calls - len(flat(r)) + sum(1 for x in flat(r) if x.get("not_run"))   # + exceptions
    ok = [x for x in rows if x["ok"]]
    lat = [x["latency_ms"] for x in rows]
    summary = {
        "rps": len(ok) / r.wall_s if r.wall_s > 0 else 0.0,
        "p50": percentile(lat, 50), "p95": percentile(lat, 95), "p99": percentile(lat, 99),
        "failed": len(rows) - len(ok) + len(r.errors),
        "not_run": skipped - len(r.errors),
        "conflicts": sum(x["conflicts"] for x in rows),
    }
    ctx.metric("throughput_rps", summary["rps"], "req/s", label=label, better="higher",
               note="lượt đánh giá thành công / thời gian chạy, đo ở client (gồm cả mạng)")
    for p in ("p50", "p95", "p99"):
        ctx.metric(f"latency_{p}_ms", summary[p], "ms", label=label,
                   note="độ trễ một yêu cầu đo ở client, gồm mạng và các lần retry")
    ctx.metric("failed_requests", summary["failed"], "yêu cầu", label=label)
    ctx.metric("not_run_requests", summary["not_run"], "yêu cầu", label=label,
               note=f"chưa kịp gửi khi hết ngân sách {LOAD_BUDGET_S} s của mức tải này")
    ctx.metric(conflicts_name, summary["conflicts"], "lần", label=label, note=conflicts_note)
    ctx.metric("consistent", 1 if consistent else 0, "1=đúng", label=label, better="higher",
               note="RatingCount / RatingAvg cuối cùng khớp với tính lại từ toàn bộ rating")
    return summary


def load_line(n: int, s: dict[str, float], conflicts_label: str) -> str:
    return (f"{n} client: {s['rps']:.1f} req/s, p50 {s['p50']:.1f} ms, p95 {s['p95']:.1f} ms, "
            f"p99 {s['p99']:.1f} ms, {s['failed']} lỗi, {s['conflicts']} {conflicts_label}"
            + (f", {s['not_run']} yêu cầu chưa chạy (hết {LOAD_BUDGET_S} s)" if s["not_run"] else ""))


def open_in_parallel(factory: Callable[[], Any], n: int, max_parallel: int = 20) -> list[Any]:
    """Open n connections with up to max_parallel logins at once (an RDS login takes about 1 s)."""
    with ThreadPoolExecutor(max_workers=min(n, max_parallel)) as pool:
        return list(pool.map(lambda _: factory(), range(n)))


# --- Redis: a raw session, to show what MULTI / EXEC really answer --------------------------------------------
def _show(reply: Any) -> str:
    if isinstance(reply, Exception):
        return f"(error) {reply}"
    if isinstance(reply, list):
        return "[" + ", ".join(_show(x) for x in reply) + "]"
    return repr(reply) if isinstance(reply, str) else str(reply)


class RawRedisSession:
    """One dedicated connection; commands are sent as-is and every reply (QUEUED, error, EXEC array) is
    recorded, so the report shows exactly what Redis answered. redis-py's pipeline() would hide that."""

    def __init__(self, client: redis.Redis):
        self.pool = client.connection_pool
        try:
            self.conn = self.pool.get_connection()
        except TypeError:                         # older redis-py wants a command name
            self.conn = self.pool.get_connection("MULTI")
        self.transcript: list[str] = []

    def call(self, *args: Any) -> Any:
        self.conn.send_command(*args)
        try:
            reply = self.conn.read_response()
        except redis.ResponseError as exc:        # top-level error reply (e.g. EXECABORT)
            reply = exc
        self.transcript.append(" ".join(_quote(a) for a in args) + f"\n    # -> {_show(reply)}")
        return reply

    def text(self) -> str:
        return "\n".join(self.transcript)

    def close(self) -> None:
        self.conn.disconnect()                    # never give back a connection left inside MULTI
        self.pool.release(self.conn)


def _quote(arg: Any) -> str:
    s = str(arg)
    return f'"{s}"' if (" " in s or not s) else s


def lines(items: Iterable[str]) -> str:
    return "\n".join(items)
