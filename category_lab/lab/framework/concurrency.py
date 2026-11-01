"""Many sessions at the same time, for the transaction and concurrency topics.

    result = ctx.workers(10, work, iterations=50, dbms="sqlserver")

Every worker gets its OWN connection (its own SQL Server session / Redis connection), opened before the
start so that connecting is not part of the race. All workers wait on a barrier and start together, then
call fn(worker, iteration) `iterations` times. Exceptions are collected per call, not raised: a deadlock
victim (SQL Server error 1205) or a WATCH conflict is a result, not a crash.

What to report from it: counts (lost updates, conflicts, deadlocks, errors per type) and the final state
of the data. `wall_s` is measured on the client and includes the network; use it only to compare runs
of the same DBMS, never SQL Server against Redis.
"""
from __future__ import annotations

import threading
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

from lab.connections import RedisClient, SqlServer, sql_error_number

DbmsChoice = Literal["sqlserver", "redis", "both"]


@dataclass
class Worker:
    index: int
    sql: SqlServer | None
    redis: RedisClient | None
    state: dict[str, Any] = field(default_factory=dict)     # free space for the scenario


@dataclass
class WorkerError:
    worker: int
    iteration: int
    kind: str                  # exception class name
    sql_error: int | None      # SQL Server error number, e.g. 1205 deadlock, 2627 duplicate key
    message: str


@dataclass
class WorkersResult:
    workers: int
    iterations: int
    wall_s: float
    results: list[list[Any]]
    errors: list[WorkerError]

    @property
    def calls(self) -> int:
        return self.workers * self.iterations

    @property
    def succeeded(self) -> int:
        return self.calls - len(self.errors)

    def error_counts(self) -> Counter:
        """Errors by kind; SQL Server errors are keyed "sql:<number>"."""
        return Counter(f"sql:{e.sql_error}" if e.sql_error else e.kind for e in self.errors)

    def count(self, value: Any) -> int:
        """How many calls returned `value` (e.g. True for "won the race")."""
        return sum(1 for per_worker in self.results for r in per_worker if r == value)


def run_workers(n: int, fn: Callable[[Worker, int], Any], *, iterations: int = 1,
                open_sql: Callable[[], SqlServer] | None = None,
                open_redis: Callable[[], RedisClient] | None = None,
                start_together: bool = True, timeout_s: float = 120) -> WorkersResult:
    workers = [Worker(i, open_sql() if open_sql else None, open_redis() if open_redis else None)
               for i in range(n)]
    barrier = threading.Barrier(n) if start_together and n > 1 else None
    results: list[list[Any]] = [[] for _ in range(n)]
    errors: list[WorkerError] = []
    lock = threading.Lock()

    def body(w: Worker) -> None:
        if barrier:
            barrier.wait(timeout=timeout_s)
        for it in range(iterations):
            try:
                results[w.index].append(fn(w, it))
            except Exception as exc:
                results[w.index].append(None)
                with lock:
                    errors.append(WorkerError(w.index, it, type(exc).__name__, sql_error_number(exc),
                                              str(exc)[:300]))

    threads = [threading.Thread(target=body, args=(w,), name=f"lab-worker-{w.index}", daemon=True)
               for w in workers]
    start = time.perf_counter()
    try:
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout_s)
        if any(t.is_alive() for t in threads):
            raise TimeoutError(f"workers still running after {timeout_s}s (blocked on a lock?)")
    finally:
        wall = time.perf_counter() - start
        for w in workers:
            for conn in (w.sql, w.redis):
                if conn is not None:
                    conn.close()
    return WorkersResult(workers=n, iterations=iterations, wall_s=wall, results=results, errors=errors)
