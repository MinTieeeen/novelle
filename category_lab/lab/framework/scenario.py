"""What a team member writes: a TopicMeta in topics/<topic>/__init__.py and @scenario functions in
topics/<topic>/sqlserver.py and topics/<topic>/redis.py.

    @scenario(title="...", pair="story_by_id")
    def story_by_id(ctx: Ctx):
        stats = ctx.bench_sql("pk_seek", "SELECT * FROM dbo.Story WHERE StoryId = ?", 42)
        ctx.check(stats.p50 < 5, "PK seek dưới 5 ms phía server")

    @story_by_id.setup
    def _(ctx): ...
    @story_by_id.teardown          # always runs, even when the scenario raised
    def _(ctx): ...

The DBMS of a scenario is the file it lives in (sqlserver.py / redis.py), the topic is its folder.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Literal

from lab.framework import bench, concurrency, fixtures, redis_probe, sqlserver_probe
from lab.framework.result import Artifact, Check, Dbms, Metric, Stats

if TYPE_CHECKING:
    from lab.connections import RedisClient, SqlServer

Target = Literal["local", "aws"]
ScenarioFn = Callable[["Ctx"], Any]


@dataclass(frozen=True)
class TopicMeta:
    id: str                                   # short name used on the CLI: `lab run indexing`
    title: str
    owner: str
    research_questions: list[str] = field(default_factory=list)
    context: str = ""                         # what the topic is about, given to the report / LLM


@dataclass
class ScenarioDef:
    fn: ScenarioFn
    title: str
    id: str | None = None                     # filled in by the registry when not given
    pair: str | None = None                   # same pair on both DBMS -> compared side by side
    targets: frozenset[str] = frozenset({"local", "aws"})
    destructive: bool = False
    description: str = ""
    repeat: int = 20
    warmup: int = 3
    setup_fn: ScenarioFn | None = None
    teardown_fn: ScenarioFn | None = None
    # filled in by the registry
    topic: str = ""
    dbms: Dbms | None = None
    module_dir: Path | None = None

    def setup(self, fn: ScenarioFn) -> ScenarioFn:
        self.setup_fn = fn
        return fn

    def teardown(self, fn: ScenarioFn) -> ScenarioFn:
        self.teardown_fn = fn
        return fn

    @property
    def name(self) -> str:
        return self.fn.__name__


def scenario(title: str, *, id: str | None = None, pair: str | None = None,
             targets: set[str] | frozenset[str] = frozenset({"local", "aws"}), destructive: bool = False,
             description: str = "", repeat: int = 20, warmup: int = 3) -> Callable[[ScenarioFn], ScenarioDef]:
    """Register a function as a scenario. `targets` lists the Redis targets it supports."""
    def wrap(fn: ScenarioFn) -> ScenarioDef:
        return ScenarioDef(fn=fn, title=title, id=id, pair=pair, targets=frozenset(targets),
                           destructive=destructive, description=description or (fn.__doc__ or "").strip(),
                           repeat=repeat, warmup=warmup)
    return wrap


class Ctx:
    """Everything a scenario can use. Collected metrics/checks/notes end up in the ScenarioResult."""

    def __init__(self, scenario: ScenarioDef, sql: "SqlServer | None", redis: "RedisClient | None",
                 artifact_dir: Path, run_dir: Path, target: str, repeat: int | None = None):
        self.scenario = scenario
        self._sql = sql
        self._redis = redis
        self.target = target
        self.dir = scenario.module_dir or Path.cwd()       # topic folder, for ctx.path("sql/x.sql")
        self._artifact_dir = artifact_dir
        self._run_dir = run_dir
        self._repeat = repeat
        self.metrics: list[Metric] = []
        self.checks: list[Check] = []
        self.observations: list[str] = []
        self.artifacts: list[Artifact] = []

    # --- connections -------------------------------------------------------------------------------
    @property
    def sql(self) -> "SqlServer":
        if self._sql is None:
            raise RuntimeError("SQL Server connection is not available in this run")
        return self._sql

    @property
    def redis(self) -> "RedisClient":
        if self._redis is None:
            raise RuntimeError("Redis connection is not available in this run")
        return self._redis

    # --- files of the topic ------------------------------------------------------------------------
    def path(self, relative: str) -> Path:
        return self.dir / relative

    def read(self, relative: str) -> str:
        """Text of a file in the topic folder, e.g. ctx.read("sql/search.sql")."""
        return self.path(relative).read_text(encoding="utf-8")

    def run_sql_file(self, relative: str) -> None:
        """Run a .sql file of the topic folder (GO batches supported)."""
        self.sql.exec_file(self.path(relative))

    # --- measuring (server-side time only) ---------------------------------------------------------
    def _counts(self, repeat: int | None, warmup: int | None) -> tuple[int, int]:
        return (self._repeat or repeat or self.scenario.repeat,
                self.scenario.warmup if warmup is None else warmup)

    def bench_sql(self, label: str, sql: str, *params: Any, repeat: int | None = None,
                  warmup: int | None = None, inner: int | None = None, note: str = "") -> Stats:
        """Time one execution of a SQL statement on the server and record server_ms.
        Each sample runs the statement `inner` times in one batch (auto-calibrated when None);
        pass inner=1 for statements that change data."""
        n, w = self._counts(repeat, warmup)
        r = bench.bench_sql(self.sql, sql, *params, repeat=n, warmup=w, inner=inner)
        how = (f"SQL Server: SYSDATETIME() quanh vòng lặp {r.inner} lần trong 1 batch, chia {r.inner}; "
               f"độ phân giải ~{r.resolution_ms * 1000:.0f} µs")
        self.metrics.append(Metric(name="server_ms", label=label, value=r.stats.p50, unit="ms", stats=r.stats,
                                   method=bench.METHOD_SQL_LOOP, resolution_ms=r.resolution_ms,
                                   note=note or how))
        return r.stats

    def bench_redis(self, label: str, fn: Callable[["RedisClient"], Any], repeat: int | None = None,
                    warmup: int | None = None, note: str = "") -> Stats:
        """Time fn(client) on the server (sum of SLOWLOG durations of its commands) and record server_ms.
        fn must send its commands through the client it receives."""
        n, w = self._counts(repeat, warmup)
        stats = bench.bench_redis(self.redis, fn, repeat=n, warmup=w)
        self.metrics.append(Metric(name="server_ms", label=label, value=stats.p50, unit="ms", stats=stats,
                                   method=bench.METHOD_SLOWLOG, resolution_ms=0.001,
                                   note=note or "Redis: tổng duration trong SLOWLOG của các lệnh"))
        return stats

    # --- looking inside the DBMS (diagnostics, F3) -------------------------------------------------
    def inspect_sql(self, label: str, sql: str, *params: Any, plan: bool = True) -> "sqlserver_probe.Inspection":
        """Run the statement once with STATISTICS IO/TIME and the actual plan. Records logical_reads
        and saves the plan (text summary + .sqlplan XML, which SSMS can open) as artifacts."""
        result = sqlserver_probe.inspect(self.sql, sql, *params, plan=plan)
        self.metrics.append(Metric(name="logical_reads", label=label, value=result.logical_reads, unit="page",
                                   note="STATISTICS IO, gồm cả LOB logical reads (trang 8 KB)"))
        if result.cpu_ms is not None:
            self.metrics.append(Metric(name="cpu_ms", label=label, value=result.cpu_ms, unit="ms",
                                       resolution_ms=1.0, note="STATISTICS TIME, độ phân giải 1 ms"))
        self.capture(f"{label}.io", [vars(t) for t in result.io])
        if result.plans:
            self.capture(f"{label}.plan", "\n\n".join(p.text() for p in result.plans), kind="text")
            for i, xml in enumerate(result.plan_xml):
                self.capture(f"{label}.plan{i or ''}", xml, kind="sqlplan")
        return result

    def inspect_redis_key(self, label: str, key: str) -> dict[str, Any]:
        """Type, encoding, element count and MEMORY USAGE of one key. Records memory_bytes."""
        info = redis_probe.key_info(self.redis, key)
        self.metrics.append(Metric(name="memory_bytes", label=label, value=info["memory_bytes"] or 0, unit="byte",
                                   note=f"MEMORY USAGE, type {info['type']}, encoding {info['encoding']}"))
        return info

    # --- shared data ---------------------------------------------------------------------------------
    def sandbox_table(self, name: str, source: str, *, where: str | None = None, top: int | None = None,
                      primary_key: list[str] | None = None) -> str:
        """Copy `source` (e.g. "dbo.Story") into lab.<topic>__<name> and return that table name.
        Use it whenever a scenario creates indexes or changes data. Dropped after the topic."""
        return fixtures.copy_table(self.sql, self.scenario.topic, name, source, where=where, top=top,
                                   primary_key=primary_key)

    # --- many sessions at once -----------------------------------------------------------------------
    def workers(self, n: int, fn: Callable[["concurrency.Worker", int], Any], *, iterations: int = 1,
                dbms: Literal["sqlserver", "redis", "both"] | None = None, autocommit: bool = True,
                start_together: bool = True, timeout_s: float = 120) -> "concurrency.WorkersResult":
        """Run fn(worker, iteration) in n threads, each with its own connection(s). See concurrency.py."""
        dbms = dbms or self.scenario.dbms or "sqlserver"
        open_sql = (lambda: self.sql.new_connection(autocommit=autocommit)) if dbms in ("sqlserver", "both") else None
        open_redis = (lambda: self.redis.new_connection()) if dbms in ("redis", "both") else None
        return concurrency.run_workers(n, fn, iterations=iterations, open_sql=open_sql, open_redis=open_redis,
                                       start_together=start_together, timeout_s=timeout_s)

    def metric(self, name: str, value: float, unit: str = "", label: str = "",
               better: Literal["lower", "higher", "none"] = "lower", note: str = "") -> None:
        """Any other number: logical reads, bytes, lost updates, RPO seconds ..."""
        self.metrics.append(Metric(name=name, label=label, value=float(value), unit=unit, better=better, note=note))

    # --- conclusions -------------------------------------------------------------------------------
    def check(self, condition: bool, message: str) -> bool:
        """A statement the scenario verifies; any failed check makes the scenario 'failed'."""
        self.checks.append(Check(passed=bool(condition), message=message))
        return bool(condition)

    def observe(self, text: str) -> None:
        """A note written by the member, shown in the report next to the numbers."""
        self.observations.append(text)

    def capture(self, label: str, content: Any, kind: str | None = None) -> Path:
        """Save raw evidence (execution plan, INFO output, ...) under results/<run>/raw/."""
        if kind is None:
            kind = "json" if isinstance(content, (dict, list)) else (
                "xml" if isinstance(content, str) and content.lstrip().startswith("<") else "text")
        safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in label)
        ext = kind if kind in ("json", "xml", "sqlplan") else "txt"
        target = self._artifact_dir / f"{self.scenario.id}.{safe}.{ext}"
        target.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(content, ensure_ascii=False, indent=2, default=str) if kind == "json" else str(content)
        target.write_text(text, encoding="utf-8")
        self.artifacts.append(Artifact(label=label, path=target.relative_to(self._run_dir).as_posix(), kind=kind))
        return target
