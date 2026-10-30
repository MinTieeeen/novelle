from datetime import datetime, timedelta, timezone
from pathlib import Path

from lab.framework import compare
from lab.framework.bench import summarize
from lab.framework.result import (Artifact, Check, Environment, Metric, RunResult, ScenarioResult, TopicInfo,
                                  TopicResult)
from lab.report import builder, charts, loader

T0 = datetime(2026, 10, 30, 10, 0, tzinfo=timezone.utc)


def timing(label: str, values: list[float], resolution: float) -> Metric:
    stats = summarize(values)
    return Metric(name="server_ms", label=label, value=stats.p50, unit="ms", stats=stats, resolution_ms=resolution)


def scenario(id_: str, dbms: str, pair: str | None, metrics: list[Metric], status: str = "passed",
             artifacts: list[Artifact] | None = None, title: str = "Lấy 1 truyện") -> ScenarioResult:
    return ScenarioResult(id=id_, title=title, topic="demo", dbms=dbms, pair=pair, status=status, started_at=T0,
                          duration_s=1.0, metrics=metrics, checks=[Check(passed=True, message="ok")],
                          observations=["ghi chú <b>không phải HTML</b>"], artifacts=artifacts or [])


def run(run_id: str, start: datetime, scenarios: list[ScenarioResult], target: str = "local") -> RunResult:
    info = TopicInfo(id="demo", title="Demo topic", owner="Tester", folder="t9_demo",
                     notes_md="# Ghi chú\n\n| a | b |\n|---|---|\n| 1 | 2 |")
    return RunResult(run_id=run_id, started_at=start, environment=Environment(target=target),
                     topics=[TopicResult(topic=info, scenarios=scenarios)])


def save(results: Path, r: RunResult) -> None:
    (results / r.run_id).mkdir(parents=True, exist_ok=True)
    (results / r.run_id / "run.json").write_text(r.model_dump_json(), encoding="utf-8")


def test_pairs_and_verdicts():
    sql = scenario("demo.sqlserver.a", "sqlserver", "a",
                   [timing("pk_seek", [0.05, 0.06, 0.07], 0.01), Metric(name="lost", label="x", value=0)])
    red = scenario("demo.redis.a", "redis", "a",
                   [timing("hgetall", [0.002, 0.003, 0.004], 0.001), Metric(name="lost", label="x", value=0)])
    [p], unpaired = compare.build_pairs(TopicResult(topic=TopicInfo(id="demo", title="D", owner="o"),
                                                    scenarios=[sql, red]))
    assert unpaired == [] and p.timing_verdict.winner == "redis" and round(p.timing_verdict.ratio) == 20
    assert [(r.name, r.verdict.text) for r in p.shared] == [("lost", "bằng nhau")]

    close = compare.verdict(Metric(name="server_ms", value=0.010, resolution_ms=0.005),
                            Metric(name="server_ms", value=0.012, resolution_ms=0.001))
    assert close.winner == "tie"
    higher = compare.verdict(Metric(name="ops", value=10, better="higher"), Metric(name="ops", value=40, better="higher"))
    assert higher.winner == "redis" and higher.text == "Redis tốt hơn ×4.0"


def test_format_and_ticks():
    assert [charts.fmt_ms(v) for v in (0.0029, 0.377, 12.345, 1234)] == ["2.9 µs", "377 µs", "12.35 ms", "1,234 ms"]
    assert charts.nice_ticks(0.377) == [0.0, 0.1, 0.2, 0.3, 0.4]
    assert charts.nice_ticks(0.0035) == [0.0, 0.001, 0.002, 0.003, 0.004]


def test_report_is_self_contained_and_escapes_text(tmp_path: Path):
    results = tmp_path / "results"
    raw = results / "r1" / "raw"
    raw.mkdir(parents=True)
    (raw / "demo.sqlserver.a.plan.txt").write_text("Clustered Index Seek <PK_Story>", encoding="utf-8")
    (raw / "demo.sqlserver.a.plan.sqlplan").write_text("<ShowPlanXML/>", encoding="utf-8")
    sql = scenario("demo.sqlserver.a", "sqlserver", "a", [timing("<script>x</script>", [0.05, 0.06], 0.01)],
                   artifacts=[Artifact(label="plan", path="raw/demo.sqlserver.a.plan.txt", kind="text"),
                              Artifact(label="plan xml", path="raw/demo.sqlserver.a.plan.sqlplan", kind="sqlplan")])
    red = scenario("demo.redis.a", "redis", "a", [timing("hgetall", [0.002, 0.003], 0.001)])
    save(results, run("r1", T0, [sql, red]))

    out = builder.build(loader.load("r1", results), tmp_path / "reports" / "r1.html")
    html = out.read_text(encoding="utf-8")
    assert "<script>x</script>" not in html and "&lt;script&gt;x&lt;/script&gt;" in html
    assert "Clustered Index Seek &lt;PK_Story&gt;" in html                       # embedded text artifact, escaped
    assert 'href="../results/r1/raw/demo.sqlserver.a.plan.sqlplan"' in html      # link relative to the report
    assert "<table>" in html and "Ghi chú" in html                                # NOTES.md rendered as markdown
    assert "ghi chú &lt;b&gt;" in html
    assert "Redis tốt hơn" in html and 'class="chart"' in html
    assert "<link" not in html and "src=\"http" not in html                       # nothing loaded from the network


def test_inline_params_skips_literals_and_comments():
    from lab.framework.bench import inline_params
    sql = "SELECT '?' AS q, x FROM t -- what?\nWHERE a = ? /* b = ? */ AND n = ? AND s = ?"
    assert inline_params(sql, (1, None, "O'Neil")) == \
        "SELECT '?' AS q, x FROM t -- what?\nWHERE a = 1 /* b = ? */ AND n = NULL AND s = N'O''Neil'"
    assert inline_params("WHERE a = ?", ()) == "WHERE a = ?"                     # count mismatch: unchanged
    assert inline_params("WHERE a = 'it''s ?' AND b = ?", (2,)) == "WHERE a = 'it''s ?' AND b = 2"


def test_pair_has_sql_and_redis_tabs_with_statements(tmp_path: Path):
    from lab.framework.result import Statement
    results = tmp_path / "results"
    sql = scenario("demo.sqlserver.a", "sqlserver", "a", [timing("pk_seek", [0.05], 0.01)])
    sql.statements = [Statement(label="pk_seek", lang="sql", text="SELECT * FROM dbo.Story WHERE StoryId = 1")]
    red = scenario("demo.redis.a", "redis", "a", [timing("hgetall", [0.003], 0.001)])
    red.statements = [Statement(label="hgetall", lang="redis", text="HGETALL lab:demo:story:1", note="1 lệnh")]
    old = scenario("demo.redis.b", "redis", "b", [], title="Không có câu lệnh")    # result from before the feature
    save(results, run("r1", T0, [sql, red, old]))

    html = builder.render(loader.load("r1", results), tmp_path / "reports" / "r1.html")
    assert 'role="tablist"' in html and 'id="pair-demo-a-tab-sqlserver"' in html
    import re
    assert re.search(r'id="pair-demo-a-code-sqlserver" aria-labelledby="[^"]+"\s*>', html)   # first tab shown
    assert re.search(r'id="pair-demo-a-code-redis" aria-labelledby="[^"]+"\s*hidden>', html)  # second hidden
    assert "SELECT * FROM dbo.Story WHERE StoryId = 1" in html and "HGETALL lab:demo:story:1" in html
    assert "không ghi lại câu lệnh" in html                                       # pair b, Redis side
    assert '<span class="pair-key">' not in html


def test_latest_per_scenario_merges_runs(tmp_path: Path):
    results = tmp_path / "results"
    old_sql = scenario("demo.sqlserver.a", "sqlserver", "a", [timing("v", [1.0], 0.01)])
    save(results, run("r1", T0, [old_sql, scenario("demo.redis.a", "redis", "a", [timing("v", [0.1], 0.001)])]))
    new_sql = scenario("demo.sqlserver.a", "sqlserver", "a", [timing("v", [2.0], 0.01)])
    save(results, run("r2", T0 + timedelta(hours=1), [new_sql]))                   # only SQL Server re-run
    save(results, run("r3", T0 + timedelta(hours=2), [scenario("demo.redis.a", "redis", "a", [], status="skipped")]))
    save(results, run("aws1", T0 + timedelta(hours=3), [new_sql], target="aws"))

    merged = loader.load_latest_per_scenario(results, target="local")
    [topic] = merged.result.topics
    by_id = {s.id: s for s in topic.scenarios}
    assert by_id["demo.sqlserver.a"].metrics[0].value == 2.0                       # newest SQL Server result
    assert by_id["demo.redis.a"].status == "passed"                                # a later skip does not hide it
    assert merged.sources == ["r1", "r2"]
