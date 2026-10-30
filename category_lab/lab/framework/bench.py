"""Server-side timing. Only the time the DBMS itself spends is measured, never the client/network time.

SQL Server  Preferred: sys.dm_exec_query_stats (needs VIEW SERVER STATE). SQL Server measures every
            execution with a high-resolution counter and keeps last_elapsed_time / last_worker_time (µs)
            and last_logical_reads per statement. The benchmarked text gets a unique marker comment
            /* lab-bench:<id> */ so its cached plan can be found; after each run those columns are read.
            For a batch with several statements the values of its statements are added up.
            Fallback (no permission, or the plan is not in the cache, e.g. a bare EXEC of a procedure):
            SYSDATETIME() before/after the statement in the same batch. On RDS (Windows) that clock only
            moves in ~1 ms steps, so it cannot resolve sub-millisecond statements; the metric says so.
            In both cases the rows the statement returns are still sent, so for very large results the
            time includes filling the network buffers (ASYNC_NETWORK_IO).

Redis       SLOWLOG with threshold 0 records the execution time (µs) of every command on the server.
            The bench connections get their own client name; after each run the durations of the new
            entries with that name are added up. Verified behaviour (Redis 7.4):
              * pipeline       -> one entry per command
              * MULTI ... EXEC -> one entry per queued command (+ MULTI), EXEC itself is not logged
              * EVAL / FCALL   -> one entry with the total; commands inside the script carry no client
                                  name, so they are not counted twice
            SLOWLOG settings are global, so they are changed only during the bench and restored after.
"""
from __future__ import annotations

import math
import statistics
import uuid
from dataclasses import dataclass
from typing import Any, Callable

from lab.connections import RedisClient, SqlServer
from lab.framework.result import Stats

IGNORED_REDIS_COMMANDS = {"CLIENT", "SLOWLOG", "PING", "HELLO", "SELECT", "AUTH"}

METHOD_QUERY_STATS = "dm_exec_query_stats"
METHOD_SYSDATETIME = "sysdatetime"
METHOD_SLOWLOG = "slowlog"


def summarize(samples: list[float]) -> Stats:
    if not samples:
        raise ValueError("no samples")
    ordered = sorted(samples)

    def pct(p: float) -> float:          # nearest-rank percentile
        return ordered[max(0, math.ceil(p * len(ordered)) - 1)]

    return Stats(count=len(ordered), min=ordered[0], p50=statistics.median(ordered), p95=pct(0.95),
                 max=ordered[-1], mean=statistics.fmean(ordered), samples=[round(s, 4) for s in samples])


def _drain(cur) -> list[tuple[str, list]]:
    """Read every result set of the current statement; returns (first column name, rows) per set."""
    sets = []
    while True:
        if cur.description is not None:
            sets.append((cur.description[0][0], cur.fetchall()))
        if not cur.nextset():
            return sets


# --- SQL Server -------------------------------------------------------------------------------------
@dataclass
class SqlBenchResult:
    elapsed_ms: Stats
    cpu_ms: Stats | None          # only with dm_exec_query_stats
    logical_reads: Stats | None   # only with dm_exec_query_stats
    method: str


def can_view_server_state(db: SqlServer) -> bool:
    return bool(db.scalar("SELECT HAS_PERMS_BY_NAME(NULL, NULL, 'VIEW SERVER STATE')"))


class QueryStatsTimer:
    """Measures one statement/batch through sys.dm_exec_query_stats."""

    _FIND = ("SELECT DISTINCT qs.sql_handle FROM sys.dm_exec_query_stats qs "
             "CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t WHERE t.text LIKE ?")
    _READ = ("SELECT SUM(execution_count) AS n, SUM(last_elapsed_time) AS elapsed_us, "
             "SUM(last_worker_time) AS cpu_us, SUM(last_logical_reads) AS reads "
             "FROM sys.dm_exec_query_stats WHERE sql_handle = ?")

    def __init__(self, db: SqlServer, sql: str):
        self.db = db
        self.marker = f"lab-bench:{uuid.uuid4().hex}"
        self.text = f"/* {self.marker} */\n{sql.strip()}"
        self.handle: bytes | None = None
        self.count = 0

    def _execute(self, *params: Any) -> None:
        with self.db.conn.cursor() as cur:
            cur.execute(self.text, *params)
            _drain(cur)

    def _read(self) -> dict | None:
        if self.handle is None:
            # The marker is passed as a parameter, so this lookup never matches its own text.
            rows = self.db.query(self._FIND, f"%{self.marker}%")
            if len(rows) != 1:
                return None
            self.handle = rows[0]["sql_handle"]
        row = self.db.query(self._READ, self.handle)[0]
        return row if row["n"] is not None else None

    def run_once(self, *params: Any) -> tuple[float, float, float] | None:
        """(elapsed_us, cpu_us, logical_reads) of one execution, or None if the plan cannot be found."""
        self._execute(*params)
        row = self._read()
        if row is None or row["n"] <= self.count:      # plan evicted or recompiled: look it up again
            self.handle, self.count = None, 0
            row = self._read()
            if row is None:
                return None
        self.count = row["n"]
        return float(row["elapsed_us"]), float(row["cpu_us"]), float(row["reads"])


def wrap_with_server_timer(sql: str) -> str:
    return ("SET NOCOUNT ON;\n"
            "DECLARE @lab_t0 DATETIME2(7) = SYSDATETIME();\n"
            f"{sql.strip().rstrip(';')};\n"
            "SELECT DATEDIFF_BIG(MICROSECOND, @lab_t0, SYSDATETIME()) AS lab_server_us;")


def sysdatetime_us(db: SqlServer, sql: str, *params: Any) -> float:
    """Fallback: elapsed time between two SYSDATETIME() calls around the statement, in microseconds."""
    with db.conn.cursor() as cur:
        cur.execute(wrap_with_server_timer(sql), *params)
        sets = _drain(cur)
    timer = [rows for name, rows in sets if name == "lab_server_us" and rows]
    if not timer:
        raise RuntimeError("the server timer did not return a value (did the statement raise an error?)")
    return float(timer[-1][-1][0])


def bench_sql(db: SqlServer, sql: str, *params: Any, repeat: int = 20, warmup: int = 3) -> SqlBenchResult:
    if can_view_server_state(db):
        timer = QueryStatsTimer(db, sql)
        for _ in range(warmup):
            timer.run_once(*params)
        samples = [timer.run_once(*params) for _ in range(repeat)]
        if all(s is not None for s in samples):
            return SqlBenchResult(elapsed_ms=summarize([s[0] / 1000 for s in samples]),
                                  cpu_ms=summarize([s[1] / 1000 for s in samples]),
                                  logical_reads=summarize([s[2] for s in samples]),
                                  method=METHOD_QUERY_STATS)
    for _ in range(warmup):
        sysdatetime_us(db, sql, *params)
    samples_ms = [sysdatetime_us(db, sql, *params) / 1000 for _ in range(repeat)]
    return SqlBenchResult(elapsed_ms=summarize(samples_ms), cpu_ms=None, logical_reads=None,
                          method=METHOD_SYSDATETIME)


# --- Redis ------------------------------------------------------------------------------------------
def _text(value: Any) -> str:
    return value.decode() if isinstance(value, bytes) else str(value or "")


class RedisServerTimer:
    """Context manager that turns on SLOWLOG for every command and measures runs of a callable."""

    def __init__(self, client: RedisClient):
        self.admin = client.raw                          # restores the config even if the bench fails
        self.name = f"lab-bench-{uuid.uuid4().hex[:8]}"
        self.bench = client.new_connection(self.name)    # dedicated pool, every connection carries the name
        self._saved: dict[str, str] = {}

    def __enter__(self) -> "RedisServerTimer":
        self._saved = {k: self.admin.config_get(k)[k] for k in ("slowlog-log-slower-than", "slowlog-max-len")}
        self.admin.config_set("slowlog-log-slower-than", 0)
        self.admin.config_set("slowlog-max-len", max(int(self._saved["slowlog-max-len"]), 10000))
        return self

    def __exit__(self, *exc: object) -> None:
        for k, v in self._saved.items():
            self.admin.config_set(k, v)
        self.bench.close()

    def _last_id(self) -> int:
        entries = self.admin.slowlog_get(1)
        return int(entries[0]["id"]) if entries else -1

    def run_once(self, fn: Callable[[RedisClient], Any]) -> float:
        """Run fn(bench_client) and return the server execution time of its commands, in microseconds."""
        start_id = self._last_id()
        fn(self.bench)
        total, seen = 0.0, 0
        for entry in self.admin.slowlog_get(-1):          # newest first
            if int(entry["id"]) <= start_id:
                break
            # redis-py returns these fields as bytes even with decode_responses=True
            command = _text(entry.get("command"))
            if _text(entry.get("client_name")) != self.name or command.split(" ", 1)[0].upper() in IGNORED_REDIS_COMMANDS:
                continue
            total += float(entry["duration"])
            seen += 1
        if seen == 0:
            raise RuntimeError("no Redis command was recorded: did fn use the client it was given?")
        return total


def bench_redis(client: RedisClient, fn: Callable[[RedisClient], Any], repeat: int = 20, warmup: int = 3) -> Stats:
    with RedisServerTimer(client) as timer:
        for _ in range(warmup):
            timer.run_once(fn)
        samples_ms = [timer.run_once(fn) / 1000 for _ in range(repeat)]
    return summarize(samples_ms)
