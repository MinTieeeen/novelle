"""Builds the HTML report of ONE topic: a self-contained file (CSS, JS and SVG charts inlined) that opens
offline, prints to PDF and can go into the submission ZIP. It is written into the topic's own folder:

    for loaded in load_topic_reports(target="local"):
        build(loaded, TOPICS_DIR / loaded.topic.topic.folder)
        # -> topics/<folder>/reports/<yyyymmdd-hhmmss>-<target>.html and topics/<folder>/reports/latest.html

`commentary` (phase F5) maps topic id -> gemini.Commentary: per-scenario comments go into the DBMS tabs,
the SQL Server vs Redis comparison closes the topic. `ai_note` explains a missing commentary.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import markdown
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

from lab.framework import compare
from lab.framework.result import Artifact, Metric, ScenarioResult, TopicResult
from lab.report import charts, notes
from lab.report.loader import LoadedReport

HERE = Path(__file__).parent
REPORTS_SUBDIR = "reports"                 # topics/<folder>/reports/
LATEST_NAME = "latest.html"
NOTES_NAME = "NOTES.md"
REPORT_TZ = timezone(timedelta(hours=7), "GMT+7")   # times are shown in Vietnam time
MAX_EMBED_BYTES = 200_000
STATUS = {  # icon + label: a status colour never carries meaning alone
    "passed": ("✔", "Đạt", "good"), "failed": ("✘", "Không đạt", "critical"),
    "error": ("⚠", "Lỗi", "critical"), "skipped": ("–", "Bỏ qua", "muted"),
}


@dataclass
class ArtifactView:
    label: str
    kind: str
    href: str                     # relative link from the report file
    text: str | None              # embedded content (text/json/xml), None for .sqlplan or too large


@dataclass
class ScenarioView:
    s: ScenarioResult
    status_icon: str
    status_label: str
    status_class: str
    extra_metrics: list[Metric]   # everything except server_ms
    artifacts: list[ArtifactView] = field(default_factory=list)
    timings: list[Metric] = field(default_factory=list)   # server_ms variants, for the tab's timing table
    comment: str = ""                                     # the author's comment saved in NOTES.md
    ai_comment: str | None = None                          # Gemini's comment on this scenario


@dataclass
class PairView:
    pair: compare.Pair
    chart: Markup
    timing_rows: list[tuple[str, Metric]]
    sql: ScenarioView | None
    redis: ScenarioView | None


@dataclass
class TopicStats:
    """Numbers for the topic overview."""
    scenarios: int = 0
    by_dbms: dict[str, int] = field(default_factory=dict)
    by_status: dict[str, int] = field(default_factory=dict)
    pairs: int = 0
    checks_passed: int = 0
    checks_total: int = 0
    metrics: int = 0
    duration_s: float = 0.0


@dataclass
class TopicView:
    t: TopicResult
    pairs: list[PairView]
    unpaired: list[ScenarioView]
    notes_html: Markup
    stats: TopicStats
    summary: list[dict[str, Any]]
    commentary: Any = None        # Commentary of the topic (lab/llm)
    ai_error: str | None = None
    topic_comment: str = ""       # the author's topic-wide comment saved in NOTES.md


def _artifact(a: Artifact, results_dir: Path, report_dir: Path) -> ArtifactView:
    path = results_dir / a.path
    href = Path(os.path.relpath(path, report_dir)).as_posix()
    text = None
    if a.kind != "sqlplan" and path.is_file() and path.stat().st_size <= MAX_EMBED_BYTES:
        text = path.read_text(encoding="utf-8", errors="replace")
    return ArtifactView(a.label, a.kind, href, text)


def _scenario(s: ScenarioResult | None, results_dir: Path, report_dir: Path,
              comments: dict[str, str] | None = None, saved: dict[str, str] | None = None) -> ScenarioView | None:
    if s is None:
        return None
    icon, label, css = STATUS[s.status]
    return ScenarioView(s, icon, label, css, [m for m in s.metrics if m.name != "server_ms"],
                        [_artifact(a, results_dir, report_dir) for a in s.artifacts],
                        timings=[m for m in s.metrics if m.name == "server_ms"],
                        ai_comment=(comments or {}).get(s.id), comment=(saved or {}).get(s.id, ""))


def _stats(t: TopicResult, pairs: int) -> TopicStats:
    st = TopicStats(scenarios=len(t.scenarios), pairs=pairs)
    for s in t.scenarios:
        st.by_dbms[s.dbms] = st.by_dbms.get(s.dbms, 0) + 1
        st.by_status[s.status] = st.by_status.get(s.status, 0) + 1
        st.checks_total += len(s.checks)
        st.checks_passed += sum(1 for c in s.checks if c.passed)
        st.metrics += len(s.metrics)
        st.duration_s += s.duration_s
    return st


def _summary(pairs: list[compare.Pair]) -> list[dict[str, Any]]:
    rows = []
    for p in pairs:
        best = {d: min(p.timings(d), key=lambda m: m.value, default=None) for d in ("sqlserver", "redis")}
        rows.append({"pair": p, "sql": best["sqlserver"], "redis": best["redis"], "verdict": p.timing_verdict,
                     "shared": p.shared, "sql_status": p.sql.status if p.sql else None,
                     "redis_status": p.redis.status if p.redis else None})
    return rows


def _topic(t: TopicResult, results_dir: Path, report_dir: Path, commentary: dict | None,
           ai_errors: dict | None, notes_text: str) -> TopicView:
    """notes_text: the topic's NOTES.md as it is now (falls back to the copy saved with the run)."""
    saved = notes.read_comments(notes_text)
    c = (commentary or {}).get(t.topic.id)
    comments = c.by_scenario if c else {}
    pairs, unpaired = compare.build_pairs(t)
    views = []
    for p in pairs:
        bars = [charts.Bar("sqlserver", m) for m in p.timings("sqlserver")] + \
               [charts.Bar("redis", m) for m in p.timings("redis")]
        views.append(PairView(p, charts.timing_chart(bars, p.title), [(b.dbms, b.metric) for b in bars],
                              _scenario(p.sql, results_dir, report_dir, comments, saved),
                              _scenario(p.redis, results_dir, report_dir, comments, saved)))
    own_text = notes.strip_block(notes_text)
    notes_html = Markup(markdown.markdown(own_text, extensions=["tables", "fenced_code"])) if own_text else Markup("")
    return TopicView(t, views, [_scenario(s, results_dir, report_dir, comments, saved) for s in unpaired],
                     notes_html, _stats(t, len(pairs)), _summary(pairs), c, (ai_errors or {}).get(t.topic.id),
                     saved.get(notes.TOPIC_COMMENT_ID, ""))


def _local_time(value: datetime) -> str:
    return value.astimezone(REPORT_TZ).strftime("%d/%m/%Y %H:%M")


def render(loaded: LoadedReport, out: Path, commentary: dict | None = None, ai_errors: dict | None = None,
           ai_note: str = "", notes_text: str | None = None) -> str:
    """HTML of the report of loaded.topic. `out` is where the file will be written (for relative links).
    notes_text is the topic's current NOTES.md; None uses the copy saved with the run."""
    env = Environment(loader=FileSystemLoader(HERE / "templates"), autoescape=select_autoescape(["html", "j2"]),
                      trim_blocks=True, lstrip_blocks=True)
    env.filters["ms"] = charts.fmt_ms
    env.filters["value"] = charts.fmt_value
    env.filters["local_time"] = _local_time
    text = loaded.topic.topic.notes_md if notes_text is None else notes_text
    tv = _topic(loaded.topic, loaded.results_dir, out.parent, commentary, ai_errors, text)
    return env.get_template("report.html.j2").render(
        tv=tv, topic=tv.t.topic, env=loaded.result.environment, runs=loaded.runs, status=STATUS,
        dbms_name=charts.DBMS_NAME, generated_at=datetime.now(timezone.utc),
        commentary_enabled=commentary is not None, ai_note=ai_note,
        css=Markup((HERE / "static" / "report.css").read_text(encoding="utf-8")),
        js=Markup((HERE / "static" / "report.js").read_text(encoding="utf-8")),
    )


def build(loaded: LoadedReport, topic_dir: Path, commentary: dict | None = None,
          ai_errors: dict | None = None, ai_note: str = "") -> Path:
    """Write topics/<folder>/reports/<time>-<target>.html and refresh latest.html; returns the new file."""
    out_dir = topic_dir / REPORTS_SUBDIR
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(REPORT_TZ).strftime("%Y%m%d-%H%M%S")
    out = out_dir / f"{stamp}-{loaded.result.environment.target}.html"
    notes_path = topic_dir / NOTES_NAME
    html = render(loaded, out, commentary, ai_errors, ai_note,
                  notes_path.read_text(encoding="utf-8") if notes_path.is_file() else None)
    out.write_text(html, encoding="utf-8")
    (out_dir / LATEST_NAME).write_text(html, encoding="utf-8")       # same folder: relative links still work
    return out
