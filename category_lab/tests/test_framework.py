import json
import textwrap
import uuid
from pathlib import Path

import pytest

from lab.config import load_config
from lab.framework import registry, runner
from lab.framework.bench import loop_batch, summarize


# --- bench -----------------------------------------------------------------------------------------
def test_summarize_percentiles():
    s = summarize([5, 1, 3, 2, 4, 10, 6, 7, 8, 9])
    assert (s.count, s.min, s.max, s.p50, s.p95, s.mean) == (10, 1, 10, 5.5, 10, 5.5)
    assert s.samples == [5, 1, 3, 2, 4, 10, 6, 7, 8, 9]          # original order kept


def test_loop_batch_runs_statement_k_times_between_server_clock_reads():
    batch = loop_batch("SELECT * FROM dbo.Story WHERE StoryId = ?;", 50)
    lines = batch.splitlines()
    assert lines[1] == "DECLARE @lab_i INT = 0, @lab_t0 DATETIME2(7) = SYSDATETIME();"
    assert lines[2] == "WHILE @lab_i < 50"
    assert "WHERE StoryId = ?;" in batch and ";;" not in batch and batch.count("?") == 1
    assert lines[-1] == "SELECT DATEDIFF_BIG(MICROSECOND, @lab_t0, SYSDATETIME()) / 50.0 AS lab_server_us;"


def test_metric_is_coarse_when_resolution_above_ten_percent():
    from lab.framework.result import Metric
    assert Metric(name="server_ms", value=0.05, resolution_ms=0.02).coarse
    assert not Metric(name="server_ms", value=0.05, resolution_ms=0.005).coarse
    assert not Metric(name="rows", value=3).coarse


# --- a throw-away topics package ---------------------------------------------------------------------
@pytest.fixture
def topics_dir(tmp_path: Path) -> Path:
    root = tmp_path / f"fake_topics_{uuid.uuid4().hex[:6]}"      # unique name: no clash in sys.modules
    folder = root / "t9_demo"
    folder.mkdir(parents=True)
    (root / "__init__.py").write_text("")
    (root / "_template").mkdir()                                    # ignored by discovery
    (folder / "__init__.py").write_text(
        'from lab.framework import TopicMeta\nTOPIC = TopicMeta(id="demo", title="Demo", owner="Tester")\n')
    (folder / "sqlserver.py").write_text(textwrap.dedent('''
        from lab.framework import scenario
        CALLS = []

        @scenario(title="ok", pair="p1")
        def ok(ctx):
            ctx.metric("rows", 3, "row")
            ctx.check(True, "fine")

        @scenario(title="bad check")
        def bad(ctx):
            ctx.check(False, "not fine")

        @scenario(title="boom")
        def boom(ctx):
            raise ValueError("kaboom")

        @boom.teardown
        def _(ctx):
            CALLS.append("teardown")

        @scenario(title="aws only", targets={"aws"})
        def aws_only(ctx):
            pass

        @scenario(title="dangerous", destructive=True)
        def dangerous(ctx):
            pass
    '''))
    (folder / "redis.py").write_text(textwrap.dedent('''
        from lab.framework import scenario

        @scenario(title="ok", pair="p1", id="custom.id")
        def ok(ctx):
            ctx.observe("note")
    '''))
    return root


def test_discover_assigns_topic_dbms_and_ids(topics_dir):
    topics = registry.discover(topics_dir)
    assert [t.meta.id for t in topics] == ["demo"]
    ids = [(s.dbms, s.id) for s in topics[0].scenarios]
    assert ("sqlserver", "demo.sqlserver.ok") in ids and ("redis", "custom.id") in ids
    assert len(ids) == 6

    only_redis = registry.select(topics, "demo", "redis")
    assert [s.id for s in only_redis[0].scenarios] == ["custom.id"]
    assert registry.select(topics, "all", "all", "demo.sqlserver.b*")[0].scenarios[0].title == "bad check"
    assert registry.select(topics, "nope") == []


class FakeConn:
    closed = False

    def close(self):
        self.closed = True


class FakeRedis(FakeConn):
    cleaned: list[str] = []

    def scoped(self, ns):
        FakeRedis.cleaned.append(ns)
        return self

    def cleanup(self):
        return 0


def test_runner_statuses_and_json(topics_dir, tmp_path):
    cfg = load_config("local", environ={"DB_HOST": "h", "MIGRATOR_PASSWORD": "p"},
                      backend_env=tmp_path / "none", lab_env=tmp_path / "none")
    conns = runner.Connections(cfg, sql_factory=FakeConn, redis_factory=FakeRedis)
    topics = registry.discover(topics_dir)

    result, run_dir = runner.run(topics, cfg, runner.RunOptions(results_dir=tmp_path / "results"), conns=conns)

    status = {s.id: s.status for s in result.topics[0].scenarios}
    assert status == {"demo.sqlserver.ok": "passed", "demo.sqlserver.bad": "failed",
                      "demo.sqlserver.boom": "error", "demo.sqlserver.aws_only": "skipped",
                      "demo.sqlserver.dangerous": "skipped", "custom.id": "passed"}
    boom = next(s for s in result.topics[0].scenarios if s.id == "demo.sqlserver.boom")
    assert "kaboom" in boom.error

    import importlib
    module = importlib.import_module(f"{topics_dir.name}.t9_demo.sqlserver")
    assert module.CALLS == ["teardown"]                      # teardown ran although the scenario raised

    saved = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    assert saved["run_id"].endswith("-demo-local") and len(saved["topics"][0]["scenarios"]) == 6


def test_runner_reports_unreachable_dbms(topics_dir, tmp_path):
    cfg = load_config("local", environ={"DB_HOST": "h", "MIGRATOR_PASSWORD": "p"},
                      backend_env=tmp_path / "none", lab_env=tmp_path / "none")

    def broken():
        raise ConnectionError("no route")

    conns = runner.Connections(cfg, sql_factory=FakeConn, redis_factory=broken)
    topics = registry.select(registry.discover(topics_dir), "demo", "redis")
    result, _ = runner.run(topics, cfg, runner.RunOptions(results_dir=tmp_path / "results"), conns=conns)
    only = result.topics[0].scenarios[0]
    assert only.status == "error" and "no route" in only.error
