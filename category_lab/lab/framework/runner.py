"""Runs the selected scenarios and writes results/<runId>/run.json.

For every scenario:  skip?  ->  setup  ->  scenario  ->  teardown (always)  ->  ScenarioResult
  skipped  the Redis target is not in `targets`, or destructive without --allow-destructive
  error    an exception was raised (traceback kept); the other scenarios still run
  failed   it ran, but at least one ctx.check(...) was false
  passed   otherwise
After each topic its Redis keys (lab:<topic>:*) and its SQL Server sandbox tables (lab.<topic>__*) are
deleted, unless RunOptions.keep is set (`lab run --keep`, to look at the data afterwards).
"""
from __future__ import annotations

import time
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Protocol

from lab.config import LAB_DIR, LabConfig
from lab.connections import RedisClient, SqlServer
from lab.framework import fixtures
from lab.framework.registry import Topic
from lab.framework.result import Environment, RunResult, ScenarioResult, TopicInfo, TopicResult
from lab.framework.scenario import Ctx, ScenarioDef

RESULTS_DIR = LAB_DIR / "results"


class Listener(Protocol):
    def scenario_started(self, s: ScenarioDef) -> None: ...
    def scenario_finished(self, s: ScenarioDef, r: ScenarioResult) -> None: ...


@dataclass
class RunOptions:
    allow_destructive: bool = False
    repeat: int | None = None                 # overrides the repeat count of every bench
    keep: bool = False                        # keep sandbox tables and Redis keys after the run
    results_dir: Path = RESULTS_DIR


class Connections:
    """Opens each DBMS connection lazily, once per run; a failed connection is remembered as an error."""

    def __init__(self, cfg: LabConfig,
                 sql_factory: Callable[[], SqlServer] | None = None,
                 redis_factory: Callable[[], RedisClient] | None = None):
        self._factories = {"sqlserver": sql_factory or (lambda: SqlServer(cfg.sql)),
                           "redis": redis_factory or (lambda: _redis_connected(cfg))}
        self._open: dict[str, object] = {}
        self.errors: dict[str, str] = {}

    def get(self, dbms: str):
        if dbms in self.errors:
            return None
        if dbms not in self._open:
            try:
                self._open[dbms] = self._factories[dbms]()
            except Exception as exc:
                self.errors[dbms] = f"{type(exc).__name__}: {exc}"
                return None
        return self._open[dbms]

    def opened(self, dbms: str):
        """The connection if it was already opened in this run, else None (never connects)."""
        return self._open.get(dbms)

    def close(self) -> None:
        for conn in self._open.values():
            conn.close()


def _redis_connected(cfg: LabConfig) -> RedisClient:
    client = RedisClient(cfg.redis)
    client.ping()                     # redis-py connects lazily: fail here, not inside a scenario
    return client


def _run_id(topics: list[Topic], target: str, now: datetime) -> str:
    name = topics[0].meta.id if len(topics) == 1 else "all"
    return f"{now:%Y%m%d-%H%M%S}-{name}-{target}"


def _environment(cfg: LabConfig, conns: Connections, dbms_needed: set[str]) -> Environment:
    env = Environment(target=cfg.target, sql_database=cfg.sql.database,
                      redis_endpoint=f"{cfg.redis.host}:{cfg.redis.port}")
    if "sqlserver" in dbms_needed and (db := conns.get("sqlserver")) is not None:
        try:
            row = db.query("SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(40)) AS v, "
                           "CAST(SERVERPROPERTY('Edition') AS NVARCHAR(100)) AS e")[0]
            env.sqlserver_version, env.sqlserver_edition = row["v"], row["e"]
        except Exception:
            pass
    if "redis" in dbms_needed and (r := conns.get("redis")) is not None:
        try:
            env.redis_version = r.info("server")["redis_version"]
        except Exception:
            pass
    return env


def run_scenario(s: ScenarioDef, conns: Connections, cfg: LabConfig, options: RunOptions,
                 run_dir: Path) -> ScenarioResult:
    started = datetime.now(timezone.utc)
    clock = time.perf_counter()
    base = dict(id=s.id, title=s.title, topic=s.topic, dbms=s.dbms, pair=s.pair,
                description=s.description, started_at=started)

    def done(**kw) -> ScenarioResult:
        return ScenarioResult(**base, duration_s=round(time.perf_counter() - clock, 3), **kw)

    if cfg.target not in s.targets:
        return done(status="skipped", skip_reason=f"không hỗ trợ target '{cfg.target}' "
                                                  f"(chỉ: {', '.join(sorted(s.targets))})")
    if s.destructive and not options.allow_destructive:
        return done(status="skipped", skip_reason="scenario destructive, cần --allow-destructive")

    # Every scenario gets SQL Server; Redis scenarios also get Redis. SQL scenarios get Redis only
    # if it is reachable (some load data from one DBMS into the other).
    sql = conns.get("sqlserver")
    redis = conns.get("redis")
    own = conns.get(s.dbms)
    if own is None:
        return done(status="error", error=f"không kết nối được {s.dbms}: {conns.errors.get(s.dbms)}")
    redis_scoped = redis.scoped(s.topic) if redis is not None else None

    ctx = Ctx(s, sql, redis_scoped, artifact_dir=run_dir / "raw", run_dir=run_dir,
              target=cfg.target, repeat=options.repeat)
    error = ""
    try:
        if s.setup_fn:
            s.setup_fn(ctx)
        s.fn(ctx)
    except Exception:
        error = traceback.format_exc(limit=6)
    finally:
        if s.teardown_fn:
            try:
                s.teardown_fn(ctx)
            except Exception:
                error += "\n[teardown] " + traceback.format_exc(limit=4)

    status = "error" if error else ("failed" if any(not c.passed for c in ctx.checks) else "passed")
    return done(status=status, error=error.strip(), metrics=ctx.metrics, checks=ctx.checks,
                observations=ctx.observations, artifacts=ctx.artifacts)


def _read_notes(folder: Path) -> str:
    notes = folder / "NOTES.md"
    return notes.read_text(encoding="utf-8") if notes.is_file() else ""


def cleanup_topic(topic: str, conns: Connections) -> None:
    """Drop what the topic's scenarios left behind. Failures are ignored: `lab clean` can retry."""
    if (redis := conns.opened("redis")) is not None:
        try:
            redis.scoped(topic).cleanup()
        except Exception:
            pass
    if (db := conns.opened("sqlserver")) is not None:
        try:
            fixtures.drop_topic_tables(db, topic)
        except Exception:
            pass


def run(topics: list[Topic], cfg: LabConfig, options: RunOptions | None = None,
        listener: Listener | None = None, conns: Connections | None = None) -> tuple[RunResult, Path]:
    options = options or RunOptions()
    now = datetime.now(timezone.utc)
    run_id = _run_id(topics, cfg.target, now.astimezone())
    run_dir = options.results_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    conns = conns or Connections(cfg)
    needed = {s.dbms for t in topics for s in t.scenarios}
    result = RunResult(run_id=run_id, started_at=now, environment=_environment(cfg, conns, needed))
    try:
        for topic in topics:
            topic_result = TopicResult(topic=TopicInfo(
                id=topic.meta.id, title=topic.meta.title, owner=topic.meta.owner,
                research_questions=list(topic.meta.research_questions), context=topic.meta.context,
                folder=topic.folder.name, notes_md=_read_notes(topic.folder)))
            for s in topic.scenarios:
                if listener:
                    listener.scenario_started(s)
                r = run_scenario(s, conns, cfg, options, run_dir)
                topic_result.scenarios.append(r)
                if listener:
                    listener.scenario_finished(s, r)
            if not options.keep:
                cleanup_topic(topic.meta.id, conns)
            result.topics.append(topic_result)
    finally:
        conns.close()
        result.finished_at = datetime.now(timezone.utc)
        (run_dir / "run.json").write_text(result.model_dump_json(indent=2), encoding="utf-8")
    return result, run_dir
