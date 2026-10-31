import json
from pathlib import Path

import pytest

from lab.llm import GeminiConfig
from lab.framework.result import Environment, Statement
from lab.llm import gemini_client as gemini
from lab.report import builder, loader
from test_report import T0, run, save, scenario, timing

ANSWER = {
    "scenarios": [{"scenario_id": "demo.sqlserver.a", "comment": "SQL Server dùng clustered index seek, 50 µs."},
                  {"scenario_id": "demo.redis.a", "comment": "Redis HGETALL chỉ 3 µs vì dữ liệu nằm trong RAM."},
                  {"scenario_id": "not.a.scenario", "comment": "bị bỏ qua"}],
    "comparison": "Redis nhanh hơn khoảng 17 lần ở phía server.",
    "recommendation": "Dùng Redis làm cache cho trang chi tiết truyện.",
    "caveats": ["Chỉ 150 truyện."],
}


def llm(model="m", fallbacks=(), delays=(5, 15, 40)) -> GeminiConfig:
    return GeminiConfig(api_key="k", model=model, fallback_models=tuple(fallbacks), temperature=0.3, timeout_s=60,
                        retry_delays_s=tuple(delays), max_statement_chars=1500, max_plan_chars=2000)


class Resp:
    def __init__(self, text):
        self.text = text


class APIError(Exception):
    def __init__(self, code):
        super().__init__(f"HTTP {code}")
        self.code = code


class FakeClient:
    def __init__(self, failures=()):
        self.failures = list(failures)
        self.calls = []
        self.models = self

    def generate_content(self, model, contents, config):
        self.calls.append(contents)
        if self.failures:
            raise APIError(self.failures.pop(0))
        return Resp(json.dumps(ANSWER, ensure_ascii=False))


def make_results(tmp_path: Path) -> Path:
    results = tmp_path / "results"
    sql = scenario("demo.sqlserver.a", "sqlserver", "a", [timing("pk_seek", [0.05], 0.01)])
    sql.statements = [Statement(label="pk_seek", lang="sql", text="SELECT * FROM dbo.Story WHERE StoryId = 1")]
    red = scenario("demo.redis.a", "redis", "a", [timing("hgetall", [0.003], 0.001)])
    skipped = scenario("demo.redis.b", "redis", "b", [], status="skipped")
    save(results, run("r1", T0, [sql, red, skipped]))
    return results


def test_payload_contains_results_but_no_connection_details(tmp_path):
    results = make_results(tmp_path)
    loaded = loader.load("r1", results)
    loaded.result.environment = Environment(target="local", sqlserver_version="15.0", redis_version="7.4.2",
                                            sql_database="NovelleDB", redis_endpoint="redis:6379")
    payload = gemini.build_payload(loaded.result.topics[0], loaded.result.environment, results, llm())
    text = json.dumps(payload, ensure_ascii=False)
    assert [s["scenario_id"] for s in payload["scenarios"]] == ["demo.sqlserver.a", "demo.redis.a"]   # no skipped
    assert "SELECT * FROM dbo.Story WHERE StoryId = 1" in text and '"p95"' in text
    assert "redis:6379" not in text and "NovelleDB" not in text


def test_generate_uses_cache_and_retries(tmp_path):
    results = make_results(tmp_path)
    loaded = loader.load("r1", results)
    client = FakeClient(failures=[503, 502])          # overloaded: retried on the same model
    sleeps = []
    res = gemini.generate(loaded.result.topics, loaded.result.environment, results, llm("m"),
                          client=client, sleep=sleeps.append)
    c = res.commentary["demo"]
    assert not res.errors and len(client.calls) == 3 and sleeps == [5, 15]
    assert set(c.by_scenario) == {"demo.sqlserver.a", "demo.redis.a"} and not c.cached

    again = gemini.generate(loaded.result.topics, loaded.result.environment, results, llm("m"),
                            client=FakeClient())
    assert again.commentary["demo"].cached and again.commentary["demo"].comparison == ANSWER["comparison"]

    other_model = FakeClient()
    gemini.generate(loaded.result.topics, loaded.result.environment, results, llm("m2"),
                    client=other_model)
    assert len(other_model.calls) == 1                                             # model is part of the key


def test_errors_are_reported_per_topic(tmp_path):
    results = make_results(tmp_path)
    loaded = loader.load("r1", results)
    res = gemini.generate(loaded.result.topics, loaded.result.environment, results, llm("m"),
                          client=FakeClient(failures=[400]), sleep=lambda s: None)
    assert res.commentary == {} and "400" in res.errors["demo"]


def test_report_puts_comments_in_tabs_and_comparison_at_topic_end(tmp_path):
    results = make_results(tmp_path)
    loaded = loader.load("r1", results)
    res = gemini.generate(loaded.result.topics, loaded.result.environment, results, llm("m"),
                          client=FakeClient())
    html = builder.render(loaded, tmp_path / "reports" / "r1.html", res.commentary)
    redis_tab = html[html.index('id="pair-demo-a-code-redis"'):html.index('id="pair-demo-b-code-sqlserver"')]
    assert "HGETALL chỉ 3 µs" in redis_tab and "clustered index seek" not in redis_tab
    ai = html.index('id="ai-demo"')
    assert ai > html.index('id="pair-demo-b"')                                     # after every pair
    assert ANSWER["comparison"] in html[ai:] and ANSWER["recommendation"] in html[ai:]
    assert "bị bỏ qua" not in html

    no_llm = builder.render(loaded, tmp_path / "reports" / "r1.html", None, ai_note="report tạo với --no-llm")
    assert "Chưa có nhận xét AI (report tạo với --no-llm)" in no_llm


class PerModelClient(FakeClient):
    """Fails with 503 for the models in `down`, answers for the others."""

    def __init__(self, down):
        super().__init__()
        self.down, self.models_asked = set(down), []

    def generate_content(self, model, contents, config):
        self.models_asked.append(model)
        if model in self.down:
            raise APIError(503)
        return Resp(json.dumps(ANSWER, ensure_ascii=False))


def test_fallback_model_then_stale_cache(tmp_path):
    results = make_results(tmp_path)
    loaded = loader.load("r1", results)
    cfg = llm("main", fallbacks=("backup",))
    args = dict(sleep=lambda s: None)

    client = PerModelClient(down={"main"})
    res = gemini.generate(loaded.result.topics, loaded.result.environment, results, cfg, client=client, **args)
    assert res.commentary["demo"].model == "backup" and not res.errors
    assert client.models_asked.count("main") == len(cfg.retry_delays_s) + 1 and client.models_asked[-1] == "backup"

    # results change, every model is down: the previous answer is shown, marked stale
    loaded.result.topics[0].scenarios[0].metrics[0].value = 9.9
    res = gemini.generate(loaded.result.topics, loaded.result.environment, results, cfg,
                          client=PerModelClient(down={"main", "backup"}), **args)
    c = res.commentary["demo"]
    assert c.stale and "503" in res.errors["demo"] and c.comparison == ANSWER["comparison"]
    html = builder.render(loaded, tmp_path / "reports" / "r1.html", res.commentary, res.errors)
    assert "nhận xét từ lần trước" in html


class QuotaClient(PerModelClient):
    """429 for the models in `down`, 404 for those in `gone`."""

    def __init__(self, down=(), gone=()):
        super().__init__(down=())
        self.quota, self.gone = set(down), set(gone)

    def generate_content(self, model, contents, config):
        self.models_asked.append(model)
        if model in self.quota:
            raise APIError(429)
        if model in self.gone:
            raise APIError(404)
        return Resp(json.dumps(ANSWER, ensure_ascii=False))


def test_used_up_quota_switches_model_at_once_and_for_the_rest_of_the_run(tmp_path):
    results = make_results(tmp_path)
    loaded = loader.load("r1", results)
    first = loaded.result.topics[0]
    second = first.model_copy(deep=True)
    second.topic.id = "demo2"
    cfg = llm("gemini-3.8-flash", fallbacks=("gemini-3.7-flash", "gemini-3.6-flash"))
    client = QuotaClient(down={"gemini-3.8-flash"}, gone={"gemini-3.7-flash"})
    events = []
    res = gemini.generate([first, second], loaded.result.environment, results, cfg, client=client,
                          sleep=lambda s: pytest.fail("a used-up quota must not be retried"),
                          progress=lambda t, how: events.append((t, how)))
    assert {c.model for c in res.commentary.values()} == {"gemini-3.6-flash"} and not res.errors
    # each failing model asked once in the whole run; the second topic goes straight to 3.6
    assert client.models_asked == ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.6-flash"]
    assert ("demo", "skip:gemini-3.8-flash:hết quota") in events


def test_all_models_out_of_quota_is_reported(tmp_path):
    results = make_results(tmp_path)
    loaded = loader.load("r1", results)
    cfg = llm("a", fallbacks=("b",))
    res = gemini.generate(loaded.result.topics, loaded.result.environment, results, cfg,
                          client=QuotaClient(down={"a", "b"}))
    assert "mọi model đều hết quota" in res.errors["demo"] and "a (hết quota)" in res.errors["demo"]


def test_check_key_reports_the_first_model_that_works():
    class Ping(QuotaClient):
        def get(self, model):
            return None
    client = Ping(down={"a"})
    assert gemini.check_key(llm("a", fallbacks=("b",)), client=client) == "b (bỏ qua: a hết quota)"
    with pytest.raises(RuntimeError, match="không model nào"):
        gemini.check_key(llm("a"), client=Ping(down={"a"}))
