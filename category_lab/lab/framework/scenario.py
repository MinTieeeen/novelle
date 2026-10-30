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

from lab.framework import bench
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
                  warmup: int | None = None, note: str = "") -> Stats:
        """Time a SQL statement/batch on the server and record server_ms (+ server_cpu_ms and
        logical_reads when sys.dm_exec_query_stats is readable). Returns the elapsed-time stats."""
        n, w = self._counts(repeat, warmup)
        r = bench.bench_sql(self.sql, sql, *params, repeat=n, warmup=w)
        if r.method == bench.METHOD_QUERY_STATS:
            how = "SQL Server: last_elapsed_time trong sys.dm_exec_query_stats (µs, do engine đo)"
        else:
            how = ("SQL Server: SYSDATETIME() trước/sau câu lệnh. Độ phân giải khoảng 1 ms trên RDS, "
                   "cần quyền VIEW SERVER STATE để đo chính xác hơn")
        self.metrics.append(Metric(name="server_ms", label=label, value=r.elapsed_ms.p50, unit="ms",
                                   stats=r.elapsed_ms, method=r.method, note=note or how))
        if r.cpu_ms is not None:
            self.metrics.append(Metric(name="server_cpu_ms", label=label, value=r.cpu_ms.p50, unit="ms",
                                       stats=r.cpu_ms, method=r.method, note="last_worker_time"))
        if r.logical_reads is not None:
            self.metrics.append(Metric(name="logical_reads", label=label, value=r.logical_reads.p50, unit="page",
                                       stats=r.logical_reads, method=r.method, note="last_logical_reads (trang 8 KB)"))
        return r.elapsed_ms

    def bench_redis(self, label: str, fn: Callable[["RedisClient"], Any], repeat: int | None = None,
                    warmup: int | None = None, note: str = "") -> Stats:
        """Time fn(client) on the server (sum of SLOWLOG durations of its commands) and record server_ms.
        fn must send its commands through the client it receives."""
        n, w = self._counts(repeat, warmup)
        stats = bench.bench_redis(self.redis, fn, repeat=n, warmup=w)
        self.metrics.append(Metric(name="server_ms", label=label, value=stats.p50, unit="ms", stats=stats,
                                   method=bench.METHOD_SLOWLOG,
                                   note=note or "Redis: tổng duration trong SLOWLOG của các lệnh"))
        return stats

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
        ext = kind if kind in ("json", "xml") else "txt"
        target = self._artifact_dir / f"{self.scenario.id}.{safe}.{ext}"
        target.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(content, ensure_ascii=False, indent=2, default=str) if kind == "json" else str(content)
        target.write_text(text, encoding="utf-8")
        self.artifacts.append(Artifact(label=label, path=target.relative_to(self._run_dir).as_posix(), kind=kind))
        return target
