import json
import threading
import urllib.error
import urllib.request
from dataclasses import replace
from pathlib import Path

import pytest

from lab.config import ENV_FILES, load_config
from lab.llm.gemini_client import Suggestion
from lab.report import builder, notes, server
from lab.report.loader import load_topic_reports
from test_report import T0, run, save, scenario, timing


def make_topic(tmp_path: Path):
    results = tmp_path / "results"
    sql = scenario("demo.sqlserver.a", "sqlserver", "a", [timing("pk_seek", [0.05], 0.01)])
    red = scenario("demo.redis.a", "redis", "a", [timing("hgetall", [0.003], 0.001)])
    save(results, run("r1", T0, [sql, red]))
    folder = tmp_path / "topics" / "t9_demo"
    folder.mkdir(parents=True)
    (folder / "NOTES.md").write_text("# Demo\n\nPhần tự viết của thành viên.\n", encoding="utf-8")
    return results, folder


# --- NOTES.md block ------------------------------------------------------------------------------------
def test_comments_round_trip_and_keep_own_text(tmp_path):
    results, folder = make_topic(tmp_path)
    topic = load_topic_reports(results, run_id="r1")[0].topic
    path = folder / "NOTES.md"

    notes.save_comments(path, topic, {"_topic": "Kết luận chung.", "demo.redis.a": "Redis nhanh.\n\n## Có tiêu đề",
                                      "demo.sqlserver.a": ""})
    text = path.read_text(encoding="utf-8")
    assert text.startswith("# Demo") and "Phần tự viết của thành viên." in text
    assert notes.read_comments(text) == {"_topic": "Kết luận chung.", "demo.redis.a": "Redis nhanh.\n\n## Có tiêu đề"}
    assert "#### Redis · `demo.redis.a`" in text and "demo.sqlserver.a" not in text   # empty comments are dropped

    notes.save_comments(path, topic, {"demo.sqlserver.a": "SQL seek."})                 # second save replaces the block
    text = path.read_text(encoding="utf-8")
    assert notes.read_comments(text) == {"demo.sqlserver.a": "SQL seek."}
    assert text.count("lab:comments:start") == 1 and "Phần tự viết" in text
    assert "lab:comments" not in notes.strip_block(text)


def test_validate_rejects_bad_comments(tmp_path):
    results, _ = make_topic(tmp_path)
    topic = load_topic_reports(results, run_id="r1")[0].topic
    for bad in ({"other.id": "x"}, {"_topic": "x" * 11}, {"_topic": "<!-- /lab:comment -->"}, {"_topic": 3}):
        with pytest.raises(ValueError):
            notes.validate(topic, bad, max_chars=10)


def test_static_report_shows_saved_comments_read_only(tmp_path):
    results, folder = make_topic(tmp_path)
    loaded = load_topic_reports(results, run_id="r1")[0]
    notes.save_comments(folder / "NOTES.md", loaded.topic, {"demo.redis.a": "Đã lưu <b>trước</b>."})
    html = builder.build(loaded, folder).read_text(encoding="utf-8")
    assert 'data-comment-id="demo.redis.a"' in html and "Đã lưu &lt;b&gt;trước&lt;/b&gt;." in html
    assert 'readonly' in html and 'class="edit-hint"' in html and '<meta name="lab-token" content=' not in html
    assert "lab:comments:start" not in html                                         # block not shown twice


# --- the server -------------------------------------------------------------------------------------------
@pytest.fixture
def served(tmp_path):
    results, folder = make_topic(tmp_path)
    cfg = load_config("local", environ={"DB_HOST": "h", "MIGRATOR_PASSWORD": "p", "GEMINI_API_KEY": "k"},
                      files=replace(ENV_FILES, local=tmp_path / "none"))
    asked = []

    def fake_suggest(loaded, comment_id, draft):
        asked.append((comment_id, draft))
        return Suggestion(f"Gợi ý cho {comment_id}", "fake-model")

    app = server.LabApp(cfg=cfg, folders={"demo": folder}, results_dir=results, token="secret", suggest=fake_suggest)
    httpd = server.make_server(app, "127.0.0.1", 0)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}", folder, asked
    httpd.shutdown()
    httpd.server_close()


def call(url, body=None, token="secret"):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", "X-Lab-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def test_page_suggest_and_save(served):
    base, folder, asked = served
    status, page = call(base + "/topic/demo")
    assert status == 200 and '<meta name="lab-token" content="secret">' in page

    status, body = call(base + "/api/suggest", {"topic": "demo", "id": "demo.redis.a", "draft": "nháp"})
    assert status == 200 and json.loads(body) == {"text": "Gợi ý cho demo.redis.a", "model": "fake-model"}
    assert asked == [("demo.redis.a", "nháp")]

    status, body = call(base + "/api/notes", {"topic": "demo", "comments": {"_topic": "Chung.", "demo.redis.a": "R."}})
    saved = json.loads(body)
    assert status == 200 and saved["notes"] == "topics/t9_demo/NOTES.md" and saved["report"].startswith("topics/t9_demo/reports/")
    assert notes.read_comments((folder / "NOTES.md").read_text(encoding="utf-8")) == {"_topic": "Chung.", "demo.redis.a": "R."}
    assert ">R.</textarea>" in (folder / "reports" / "latest.html").read_text(encoding="utf-8")
    assert ">Chung.</textarea>" in call(base + "/topic/demo")[1]                    # the page shows what was saved


def test_server_refuses_bad_requests(served):
    base, folder, _ = served
    assert call(base + "/api/notes", {"topic": "demo", "comments": {}}, token="wrong")[0] == 403
    assert call(base + "/api/notes", {"topic": "demo", "comments": {"x.y": "z"}})[0] == 400
    assert call(base + "/api/notes", {"topic": "nope", "comments": {}})[0] == 404
    assert call(base + "/results/../../topics/t9_demo/NOTES.md")[0] == 404              # no path traversal
    assert call(base + "/topic/nope")[0] == 404
    assert "Phần tự viết" in (folder / "NOTES.md").read_text(encoding="utf-8")       # untouched
