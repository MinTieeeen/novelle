"""Server-side timing. Only the time the DBMS itself spends is measured, never the client/network time.

SQL Server  The statement runs K times inside ONE batch, between two SYSDATETIME() calls:
                DECLARE @lab_i INT = 0, @lab_t0 DATETIME2(7) = SYSDATETIME();
                WHILE @lab_i < K BEGIN <statement>; SET @lab_i += 1; END
                SELECT DATEDIFF_BIG(MICROSECOND, @lab_t0, SYSDATETIME()) / K.0;
            The clock is read by SQL Server, so no network time is included. On RDS (Windows) SYSDATETIME
            only moves in ~1 ms steps; dividing by K brings the resolution down to ~1/K ms. K is chosen
            automatically so that one batch takes ~100 ms (1 <= K <= 1000), or set with `inner=`.
            Why not sys.dm_exec_query_stats / Query Store: on the RDS t3.micro instance SQL Server gets
            ~174 MB, the plan cache holds only a few plans and evicts them immediately, and Query Store in
            AUTO capture mode ignores cheap statements, so neither keeps per-execution numbers.
            Rows the statement returns are sent to the client K times; K is also capped so one batch
            returns at most OUTPUT_BUDGET_BYTES, otherwise the server waits on the network
            (ASYNC_NETWORK_IO). A statement that changes data runs K times: use inner=1.

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

METHOD_SQL_LOOP = "sysdatetime_loop"
METHOD_SLOWLOG = "slowlog"


def summarize(samples: list[float]) -> Stats:
    if not samples:
        raise ValueError("no samples")
    ordered = sorted(samples)

    def pct(p: float) -> float:          # nearest-rank percentile
        return ordered[max(0, math.ceil(p * len(ordered)) - 1)]

    return Stats(count=len(ordered), min=ordered[0], p50=statistics.median(ordered), p95=pct(0.95),
                 max=ordered[-1], mean=statistics.fmean(ordered), samples=[round(s, 4) for s in samples])


def _drain(cur) -> list[tuple[list[str], list]]:
    """Read every result set of the current statement; returns (column names, rows) per set."""
    sets = []
    while True:
        if cur.description is not None:
            sets.append(([c[0] for c in cur.description], cur.fetchall()))
        if not cur.nextset():
            return sets


def _approx_bytes(columns: list[str], rows: list) -> int:
    """Rough size of a result set on the wire: column metadata + values as text."""
    return sum(30 + 2 * len(c) for c in columns) + sum(8 * len(r) + sum(len(str(v)) for v in r) for r in rows)


# --- SQL Server -------------------------------------------------------------------------------------
MAX_INNER = 1000
TARGET_BATCH_US = 100_000           # aim for ~100 ms per measured batch
CLOCK_STEP_US = 1000.0              # SYSDATETIME() granularity observed on RDS (Windows)
# Rows the statement returns are streamed to the client K times. Once the socket buffers fill up, the
# server waits for the client (ASYNC_NETWORK_IO) and network time leaks into the measurement: measured
# on RDS, a PK lookup returning ~400 B went from ~20 µs (K=200) to ~155 µs (K=1000). Keep one batch's
# output well under that.
OUTPUT_BUDGET_BYTES = 48_000


@dataclass
class SqlBenchResult:
    stats: Stats                    # per-execution time in ms (each sample = mean over `inner` runs)
    inner: int
    resolution_ms: float            # CLOCK_STEP / inner


def loop_batch(sql: str, inner: int) -> str:
    return ("SET NOCOUNT ON;\n"
            "DECLARE @lab_i INT = 0, @lab_t0 DATETIME2(7) = SYSDATETIME();\n"
            f"WHILE @lab_i < {inner}\nBEGIN\n{sql.strip().rstrip(';')};\nSET @lab_i += 1;\nEND\n"
            f"SELECT DATEDIFF_BIG(MICROSECOND, @lab_t0, SYSDATETIME()) / {inner}.0 AS lab_server_us;")


def _run_loop(db: SqlServer, sql: str, *params: Any, inner: int) -> tuple[float, int]:
    """(mean server µs per execution, bytes of rows returned by the whole batch)."""
    with db.conn.cursor() as cur:
        cur.execute(loop_batch(sql, inner), *params)
        sets = _drain(cur)
    timer = [rows for cols, rows in sets if cols[:1] == ["lab_server_us"] and rows]
    if not timer:
        raise RuntimeError("the server timer did not return a value (did the statement raise an error?)")
    output = sum(_approx_bytes(cols, rows) for cols, rows in sets if cols[:1] != ["lab_server_us"])
    return float(timer[-1][-1][0]), output


def server_time_us(db: SqlServer, sql: str, *params: Any, inner: int = 1) -> float:
    """Mean server-side time of one execution of `sql`, measured over `inner` executions, in µs."""
    return _run_loop(db, sql, *params, inner=inner)[0]


def choose_inner(db: SqlServer, sql: str, *params: Any) -> int:
    """Calibrate K from a 10-run batch: ~TARGET_BATCH_US per batch, and at most OUTPUT_BUDGET_BYTES of
    returned rows per batch (see OUTPUT_BUDGET_BYTES)."""
    estimate_us, output = _run_loop(db, sql, *params, inner=10)
    by_time = TARGET_BATCH_US / max(estimate_us, 1.0)
    by_output = OUTPUT_BUDGET_BYTES / max(output / 10, 1.0)
    return max(1, min(MAX_INNER, int(by_time), int(by_output)))


def bench_sql(db: SqlServer, sql: str, *params: Any, repeat: int = 20, warmup: int = 3,
              inner: int | None = None) -> SqlBenchResult:
    k = inner if inner is not None else choose_inner(db, sql, *params)
    for _ in range(warmup):
        server_time_us(db, sql, *params, inner=k)
    samples_ms = [server_time_us(db, sql, *params, inner=k) / 1000 for _ in range(repeat)]
    return SqlBenchResult(stats=summarize(samples_ms), inner=k, resolution_ms=CLOCK_STEP_US / k / 1000)


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
        """Run fn(bench_client) and return the server execution time of its commands, in microseconds.
        The commands themselves (as SLOWLOG shows them) are kept in self.last_commands, oldest first."""
        start_id = self._last_id()
        fn(self.bench)
        total, commands = 0.0, []
        for entry in self.admin.slowlog_get(-1):          # newest first
            if int(entry["id"]) <= start_id:
                break
            # redis-py returns these fields as bytes even with decode_responses=True
            command = _text(entry.get("command"))
            if _text(entry.get("client_name")) != self.name or command.split(" ", 1)[0].upper() in IGNORED_REDIS_COMMANDS:
                continue
            total += float(entry["duration"])
            commands.append(command)
        if not commands:
            raise RuntimeError("no Redis command was recorded: did fn use the client it was given?")
        self.last_commands = commands[::-1]
        return total


@dataclass
class RedisBenchResult:
    stats: Stats
    commands: list[str]           # what one run sent, as SLOWLOG records it (long args are truncated)


def bench_redis(client: RedisClient, fn: Callable[[RedisClient], Any], repeat: int = 20,
                warmup: int = 3) -> RedisBenchResult:
    with RedisServerTimer(client) as timer:
        for _ in range(warmup):
            timer.run_once(fn)
        samples_ms = [timer.run_once(fn) / 1000 for _ in range(repeat)]
    return RedisBenchResult(summarize(samples_ms), timer.last_commands)


# --- statements as text, for the report ---------------------------------------------------------------
def sql_literal(value: Any) -> str:
    """A Python parameter written as a T-SQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)) or type(value).__name__ == "Decimal":
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex().upper()
    if hasattr(value, "isoformat"):
        return "'" + value.isoformat() + "'"
    return "N'" + str(value).replace("'", "''") + "'"


def inline_params(sql: str, params: tuple | list) -> str:
    """Replace each ? placeholder with its value, skipping ? inside string literals and comments, so the
    statement can be pasted into SSMS. Left unchanged if the counts do not match."""
    out, i, n, values = [], 0, len(sql), list(params)
    used = 0
    while i < n:
        c = sql[i]
        if c == "'":                                       # string literal ('' is an escaped quote)
            j = i + 1
            while j < n and not (sql[j] == "'" and (j + 1 >= n or sql[j + 1] != "'")):
                j += 2 if sql[j] == "'" else 1
            out.append(sql[i:j + 1]); i = j + 1
        elif sql.startswith("--", i):
            j = sql.find("\n", i); j = n if j < 0 else j
            out.append(sql[i:j]); i = j
        elif sql.startswith("/*", i):
            j = sql.find("*/", i + 2); j = n if j < 0 else j + 2
            out.append(sql[i:j]); i = j
        elif c == "?":
            if used >= len(values):
                return sql
            out.append(sql_literal(values[used])); used += 1; i += 1
        else:
            out.append(c); i += 1
    return "".join(out) if used == len(values) else sql
