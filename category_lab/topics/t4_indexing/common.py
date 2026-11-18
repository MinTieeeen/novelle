"""Helpers shared by the indexing scenarios (I2-I5, I7). They connect the plain modules (ddl, plans, redisidx)
to the lab's Ctx.

SQL Server
  with indexes(ctx, table, IX_A, IX_B, label="covering · 10k"):   create, yield, ALWAYS drop
  reset_indexes(ctx, table)          drop every secondary / full-text index (leftovers of a failed run)
  measure(ctx, label, sql, columns, *params) -> Measured   timing + plan + rows read + lookups
  ids(ctx, sql, *params)             set of StoryId returned by a query (correctness checks)
  index_size(ctx, table, name, label)                       pages and MB of one index, as metrics
Redis
  run_lua(ctx, label, "scan_filter", *args)   timed EVAL of lua/<name>.lua, returns its reply
  build_manual(ctx, n, rows, kinds)            application-kept Sets / Sorted sets (redisidx), once per run
  manual_key(ctx, n, *parts), manual_memory(ctx, n, kind, label)
  create_search(ctx, n, name, schema, filter=None) / drop_search / search_memory   RediSearch indexes
Both
  same_ids(ctx, expected, got, what)   check + capture of the difference
"""
from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator

from lab.framework import Ctx, redis_probe
from lab.framework.result import Stats

from . import dataset, ddl, plans, redisidx
from .ddl import Index

TOPIC_DIR = Path(__file__).resolve().parent
SEARCH_TIMEOUT_S = 300
# CREATE INDEX on the shared t3.micro can wait a long time for a memory grant (RESOURCE_SEMAPHORE). With a query
# timeout the driver cancels the statement and the scenario fails cleanly; the connection stays usable (an
# interrupted run, in contrast, breaks the connection for every later scenario).
DDL_TIMEOUT_S = 180


# --- SQL Server: indexes ---------------------------------------------------------------------------
def reset_indexes(ctx: Ctx, table: str) -> list[str]:
    """Drop every secondary index (and the full-text index) of a sandbox table. Returns what was dropped."""
    if not table.startswith(f"lab.{ctx.scenario.topic}__"):
        raise ValueError(f"reset_indexes only works on this topic's sandbox tables, got {table}")
    dropped = []
    for row in ctx.sql.query(ctx.read("sql/indexes_list.sql").format(story=table)):
        if row["is_fulltext"]:
            ctx.sql.exec(f"DROP FULLTEXT INDEX ON {table};")
        else:
            ctx.sql.exec(f"DROP INDEX [{row['index_name']}] ON {table};")
        dropped.append(row["index_name"])
    return dropped


def exec_ddl(ctx: Ctx, sql: str, timeout_s: int = DDL_TIMEOUT_S) -> None:
    """Run DDL with a query timeout (pyodbc Connection.timeout), restoring the previous timeout afterwards."""
    conn = ctx.sql.conn
    previous = conn.timeout
    conn.timeout = timeout_s
    try:
        ctx.sql.exec(sql)
    except Exception as exc:
        if "HYT00" in str(exc) or "timeout" in str(exc).lower():
            raise TimeoutError(f"DDL did not finish in {timeout_s}s (waiting for a memory grant or a lock?): "
                               f"{sql.splitlines()[0]}") from exc
        raise
    finally:
        conn.timeout = previous


@contextmanager
def indexes(ctx: Ctx, table: str, *defs: Index, label: str | None = None) -> Iterator[None]:
    """Create `defs` on `table` (after dropping any leftover index), run the block, then drop them even when
    the block fails. The DDL is shown in the report under `label`."""
    reset_indexes(ctx, table)
    created: list[Index] = []
    try:
        for d in defs:
            exec_ddl(ctx, d.create_sql(table))
            created.append(d)
        if defs and label:
            ctx.statement(f"{label} (DDL)", "\n".join(d.create_sql(table) for d in defs), lang="sql",
                          note="index của biến thể; tạo trước khi đo, xoá sau khi đo")
        yield
    finally:
        for d in reversed(created):
            ctx.sql.exec(d.drop_sql(table))


FULLTEXT_TIMEOUT_S = 600


def fulltext_status(ctx: Ctx, table: str) -> dict[str, Any]:
    return ctx.sql.query(ctx.read("sql/i5_fulltext_status.sql").format(table=table))[0]


def create_fulltext(ctx: Ctx, table: str, key_index: str, lcid: int, label: str) -> dict[str, Any]:
    """CREATE FULLTEXT INDEX on a sandbox copy (sql/i5_fulltext_create.sql), then wait until the background
    population has indexed every row. Records build_s (client wall clock, polling every 0.5 s) and
    index_mb (fragments). Returns the final status row."""
    if not table.startswith(f"lab.{ctx.scenario.topic}__"):
        raise ValueError(f"full-text indexes are only created on this topic's sandbox tables, got {table}")
    ddl_text = ctx.read("sql/i5_fulltext_create.sql").format(table=table, key_index=key_index, lcid=int(lcid))
    started = time.perf_counter()
    exec_ddl(ctx, ddl_text)
    while True:
        status = fulltext_status(ctx, table)
        if status["populate_status"] == 0 and status["item_count"] >= status["table_rows"] and not status["pending"]:
            break
        if time.perf_counter() - started > FULLTEXT_TIMEOUT_S:
            raise TimeoutError(f"full-text population of {table} not finished after {FULLTEXT_TIMEOUT_S}s: {status}")
        time.sleep(0.5)
    ctx.metric("build_s", time.perf_counter() - started, "s", label=label,
               note="CREATE FULLTEXT INDEX + population nền tới khi đủ dòng (đo ở client, polling 0,5 s)")
    ctx.metric("index_mb", float(status["fragments_kb"]) / 1024, "MB", label=label,
               note="tổng data_size của sys.fulltext_index_fragments")
    ctx.statement(f"{label} (DDL)", ddl_text, lang="sql")
    return status


def index_size(ctx: Ctx, table: str, name: str, label: str) -> dict[str, Any] | None:
    """Record index_pages / index_mb / index_rows of one index (name = index name, or "(heap)" / the PK
    name). Returns the row, or None when the size cannot be read (no VIEW DATABASE STATE)."""
    rows = dataset.table_size(ctx, table)
    row = next((r for r in rows or [] if r["index_name"] == name), None)
    if row is None:
        return None
    ctx.metric("index_pages", row["used_pages"], "trang", label=label,
               note=f"used_page_count của index {name} (trang 8 KB)")
    ctx.metric("index_mb", row["used_pages"] * 8 / 1024, "MB", label=label)
    ctx.metric("index_rows", row["rows"], "dòng", label=label, better="none")
    return row


# --- SQL Server: measuring a query ---------------------------------------------------------------
@dataclass
class Measured:
    stats: Stats
    rows: int                                     # rows returned
    logical_reads: int
    access: list[plans.Access] = field(default_factory=list)
    ops: list[str] = field(default_factory=list)  # every physical operator of the plan
    warnings: list[str] = field(default_factory=list)   # plan warnings, e.g. UnmatchedIndexes (I4)

    @property
    def lookups(self) -> int:
        return plans.lookups(self.access)

    @property
    def has_sort(self) -> bool:
        return any("Sort" in op for op in self.ops)

    def describe(self) -> str:
        return plans.describe(self.access)


def measure(ctx: Ctx, label: str, sql: str, columns: dict[str, str | tuple[str, str]], *params: Any,
            hint: str = "") -> Measured:
    """Time the query (timing form: rows assigned to variables, see ddl.timing_version), then run it once
    with the actual plan. Records server_ms, logical_reads, rows_returned, rows_read, lookups.
    `hint` is appended to both forms, e.g. "OPTION (RECOMPILE)"."""
    text = f"{sql.rstrip().rstrip(';')}\n{hint}".strip() if hint else sql
    stats = ctx.bench_sql(label, ddl.timing_version(text, columns), *params)
    info = ctx.inspect_sql(label, text, *params)
    access = plans.accesses(info.plan_xml[0]) if info.plan_xml else []
    m = Measured(stats=stats, rows=info.rows, logical_reads=info.logical_reads, access=access,
                 ops=info.plan.physical_ops() if info.plan else [],
                 warnings=list(info.plan.warnings) if info.plan else [])
    ctx.metric("rows_returned", m.rows, "dòng", label=label, better="none")
    ctx.metric("rows_read", plans.rows_read(access), "dòng", label=label,
               note="số dòng các operator đọc bảng / index phải xem (chưa tính lookup)")
    ctx.metric("lookups", m.lookups, "lần", label=label, note="số lần Key Lookup / RID Lookup")
    ctx.capture(f"{label}.access", m.describe(), kind="text")
    return m


def query_text(ctx: Ctx, name: str, table: str, hint: str = "") -> str:
    """sql/<name>.sql with {table} and {hint} filled in (hint: a table hint such as WITH (INDEX(IX_A)))."""
    return ctx.read(f"sql/{name}.sql").format(table=table, hint=hint)


def id_list(ctx: Ctx, sql: str, *params: Any) -> list[int]:
    """StoryIds in the order the query returns them (first column = StoryId)."""
    return [int(next(iter(r.values()))) for r in ctx.sql.query(sql, *params)]


def ids(ctx: Ctx, sql: str, *params: Any) -> set[int]:
    """StoryIds returned by a query whose first column is StoryId."""
    return set(id_list(ctx, sql, *params))


def same_order(ctx: Ctx, expected: list[int], got: list[int], what: str) -> bool:
    """Check that a page holds exactly the expected stories in the expected order."""
    ok = expected == got
    if not ok:
        ctx.capture(f"diff {what}", {"expected": expected, "got": got})
    ctx.check(ok, f"{what}: đúng {len(expected)} truyện, đúng thứ tự")
    return ok


def p50(ctx: Ctx, label: str) -> float:
    """server_ms p50 recorded under `label` by the latest bench of this scenario."""
    return next(m.value for m in reversed(ctx.metrics) if m.name == "server_ms" and m.label == label)


# --- correctness ---------------------------------------------------------------------------------
def same_ids(ctx: Ctx, expected: set[int], got: set[int], what: str) -> bool:
    """Check that a variant returns exactly the reference set; capture the difference when it does not."""
    ok = expected == got
    if not ok:
        ctx.capture(f"diff {what}", {"missing": sorted(expected - got)[:50], "extra": sorted(got - expected)[:50],
                                     "expected": len(expected), "got": len(got)})
    ctx.check(ok, f"{what}: cùng {len(expected)} truyện với kết quả tham chiếu")
    return ok


# --- Redis: Lua ------------------------------------------------------------------------------------
@lru_cache(maxsize=None)
def lua_source(name: str) -> str:
    return (TOPIC_DIR / "lua" / f"{name}.lua").read_text(encoding="utf-8")


def run_lua(ctx: Ctx, label: str, name: str, *args: Any, keys: tuple[str, ...] = ()) -> Any:
    """Time `EVAL lua/<name>.lua` on the server (one SLOWLOG entry per run), then run it once more and
    return its reply. The script text is shown in the report."""
    script = lua_source(name)
    ctx.bench_redis(label, lambda r: r.eval(script, len(keys), *keys, *args))
    ctx.statement(f"{label} (lua/{name}.lua)", script, lang="redis",
                  note="ARGV: " + " ".join(str(a) for a in args)[:300])
    return ctx.redis.eval(script, len(keys), *keys, *args)


# --- Redis: application-kept secondary indexes ----------------------------------------------------
def manual_key(ctx: Ctx, n: int, *parts: object) -> str:
    return ctx.redis.key(f"s{n}", "mx", *parts)


def build_manual(ctx: Ctx, n: int, rows: list[dict[str, Any]], kinds: tuple[str, ...] = redisidx.KINDS) -> None:
    """Write the secondary structures of `kinds` for every story (not timed). Each kind is built once per run."""
    todo = [k for k in kinds if not ctx.redis.get(manual_key(ctx, n, "built", k))]
    if not todo:
        return
    for i in range(0, len(rows), dataset.REDIS_BATCH):
        pipe = ctx.redis.pipeline(transaction=False)
        for row in rows[i:i + dataset.REDIS_BATCH]:
            for e in redisidx.entries(row, tuple(todo)):
                pipe.execute_command(*redisidx.command_args(e, manual_key(ctx, n, *e.key)))
        pipe.execute()
    for k in todo:
        ctx.redis.set(manual_key(ctx, n, "built", k), 1)


def manual_memory(ctx: Ctx, n: int, kind: str, label: str) -> int:
    """MEMORY USAGE of all keys of one kind of manual index; recorded as index_mb."""
    mem = redis_probe.namespace_memory(ctx.redis, f"s{n}:mx:{redisidx.PATTERNS[kind]}")
    ctx.metric("index_mb", mem["memory_bytes"] / 1024 / 1024, "MB", label=label,
               note=f"tổng MEMORY USAGE của {mem['keys']} key ({kind})")
    return mem["memory_bytes"]


# --- Redis: RediSearch -----------------------------------------------------------------------------
def search_name(ctx: Ctx, n: int, name: str) -> str:
    """lab:indexing:idx:<name>:s<n>; dataset.drop_search_indexes removes every lab:indexing:* index."""
    return ctx.redis.key("idx", name, f"s{n}")


def search_info(ctx: Ctx, index: str) -> dict[str, Any]:
    return redisidx.parse_ft_info(ctx.redis.execute_command("FT.INFO", index))


def create_search(ctx: Ctx, n: int, name: str, schema: list[str], filter: str | None = None,
                  label: str | None = None, options: tuple[str, ...] = ()) -> str:
    """FT.CREATE over the story Hashes of size n, then wait until the existing Hashes are indexed.
    schema: the arguments after SCHEMA, e.g. ["Slug", "TAG", "RatingAvg", "NUMERIC", "SORTABLE"];
    options: arguments placed before SCHEMA, e.g. ("STOPWORDS", "0").
    Returns the index name. Records build_s (wall clock, client side) when `label` is given."""
    index = search_name(ctx, n, name)
    drop_search(ctx, index)
    args = ["FT.CREATE", index, "ON", "HASH", "PREFIX", "1", dataset.story_prefix(ctx, n)]
    if filter:
        args += ["FILTER", filter]
    args += [*options, "SCHEMA", *schema]
    started = time.perf_counter()
    ctx.redis.execute_command(*args)
    while not redisidx.indexing_done(search_info(ctx, index)):
        if time.perf_counter() - started > SEARCH_TIMEOUT_S:
            raise TimeoutError(f"{index} still indexing after {SEARCH_TIMEOUT_S}s")
        time.sleep(0.05)
    if label:
        ctx.metric("build_s", time.perf_counter() - started, "s", label=label,
                   note="thời gian FT.CREATE + quét nền các Hash có sẵn (đo ở client, gồm cả polling 50 ms)")
        ctx.statement(f"{label} (FT.CREATE)", " ".join(str(a) for a in args), lang="redis")
    return index


def max_search_results(ctx: Ctx) -> int:
    """RediSearch's cap on offset + count of one FT.SEARCH (MAXSEARCHRESULTS, 10000 by default)."""
    for args in (("FT.CONFIG", "GET", "MAXSEARCHRESULTS"), ("CONFIG", "GET", "search-max-search-results")):
        try:
            reply = ctx.redis.execute_command(*args)
        except Exception:
            continue
        flat = [x for pair in reply for x in (pair if isinstance(pair, (list, tuple)) else [pair])] \
            if isinstance(reply, list) else [v for kv in reply.items() for v in kv]
        values = [v for v in flat[1::2] if str(v).lstrip("-").isdigit()]
        if values:
            value = int(values[0])
            return value if value > 0 else 1_000_000
    return 10_000


def search_args(index: str, query: str, fields: tuple[str, ...], offset: int = 0, count: int = 10,
                sortby: str | None = None) -> list[Any]:
    """FT.SEARCH arguments returning `fields`; sortby = "Field DESC" / "Field ASC"."""
    args: list[Any] = ["FT.SEARCH", index, query, "RETURN", len(fields), *fields]
    if sortby:
        field_name, direction = sortby.split()
        args += ["SORTBY", field_name, direction]
    return args + ["LIMIT", offset, count]


def search_ids(ctx: Ctx, args: list[Any]) -> tuple[int, list[int]]:
    """Run FT.SEARCH once: (total matches, StoryIds of the returned page in order)."""
    total, docs = redisidx.parse_search(ctx.redis.execute_command(*args))
    return total, [redisidx.key_id(key) for key, _ in docs]


def drop_search(ctx: Ctx, index: str) -> None:
    """FT.DROPINDEX without DD: the Hashes stay. No error when the index does not exist."""
    try:
        ctx.redis.execute_command("FT.DROPINDEX", index)
    except Exception as exc:
        if "unknown index" not in str(exc).lower() and "no such index" not in str(exc).lower():
            raise


def search_memory(ctx: Ctx, index: str, label: str) -> float:
    """Memory of a RediSearch index (FT.INFO), recorded as index_mb; the raw FT.INFO is captured."""
    info = search_info(ctx, index)
    mb = redisidx.index_memory_mb(info)
    ctx.metric("index_mb", mb, "MB", label=label, note="bộ nhớ của index RediSearch theo FT.INFO")
    ctx.capture(f"{label}.ft_info", {k: v for k, v in info.items() if not isinstance(v, list)})
    return mb
