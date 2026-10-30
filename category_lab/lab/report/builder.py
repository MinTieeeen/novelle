"""Builds the HTML report: one self-contained file (CSS, JS and SVG charts inlined) that opens offline,
prints to PDF and can go into the submission ZIP.

    path = build(load("latest"))                  # reports/<runId>.html
    path = build(load_latest_per_scenario())      # reports/combined-<time>.html

`commentary` (phase F5) maps topic id -> AI commentary; without it the report says none was generated.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import markdown
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

from lab.config import LAB_DIR
from lab.framework import compare
from lab.framework.result import Artifact, Metric, ScenarioResult, TopicResult
from lab.report import charts
from lab.report.loader import LoadedReport

HERE = Path(__file__).parent
REPORTS_DIR = LAB_DIR / "reports"
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
    extra_metrics: list[Metric]   # everything except server_ms (shown in the chart/table)
    artifacts: list[ArtifactView] = field(default_factory=list)


@dataclass
class PairView:
    pair: compare.Pair
    chart: Markup
    timing_rows: list[tuple[str, Metric]]
    sql: ScenarioView | None
    redis: ScenarioView | None


@dataclass
class TopicView:
    t: TopicResult
    pairs: list[PairView]
    unpaired: list[ScenarioView]
    notes_html: Markup
    counts: dict[str, int]
    commentary: Any = None


def _artifact(a: Artifact, results_dir: Path, report_dir: Path) -> ArtifactView:
    path = results_dir / a.path
    href = Path(os.path.relpath(path, report_dir)).as_posix()
    text = None
    if a.kind != "sqlplan" and path.is_file() and path.stat().st_size <= MAX_EMBED_BYTES:
        text = path.read_text(encoding="utf-8", errors="replace")
    return ArtifactView(a.label, a.kind, href, text)


def _scenario(s: ScenarioResult | None, results_dir: Path, report_dir: Path) -> ScenarioView | None:
    if s is None:
        return None
    icon, label, css = STATUS[s.status]
    return ScenarioView(s, icon, label, css, [m for m in s.metrics if m.name != "server_ms"],
                        [_artifact(a, results_dir, report_dir) for a in s.artifacts])


def _topic(t: TopicResult, results_dir: Path, report_dir: Path, commentary: dict | None) -> TopicView:
    pairs, unpaired = compare.build_pairs(t)
    views = []
    for p in pairs:
        bars = [charts.Bar("sqlserver", m) for m in p.timings("sqlserver")] + \
               [charts.Bar("redis", m) for m in p.timings("redis")]
        views.append(PairView(p, charts.timing_chart(bars, p.title), [(b.dbms, b.metric) for b in bars],
                              _scenario(p.sql, results_dir, report_dir), _scenario(p.redis, results_dir, report_dir)))
    counts: dict[str, int] = {}
    for s in t.scenarios:
        counts[s.status] = counts.get(s.status, 0) + 1
    notes = Markup(markdown.markdown(t.topic.notes_md, extensions=["tables", "fenced_code"])) if t.topic.notes_md else Markup("")
    return TopicView(t, views, [_scenario(s, results_dir, report_dir) for s in unpaired], notes, counts,
                     (commentary or {}).get(t.topic.id))


def summary_rows(topics: list[TopicView]) -> list[dict[str, Any]]:
    rows = []
    for tv in topics:
        for pv in tv.pairs:
            p = pv.pair
            best = {d: min(p.timings(d), key=lambda m: m.value, default=None) for d in ("sqlserver", "redis")}
            rows.append({"topic": tv.t.topic, "pair": p, "sql": best["sqlserver"], "redis": best["redis"],
                         "verdict": p.timing_verdict, "shared": p.shared})
    return rows


def render(loaded: LoadedReport, out: Path, commentary: dict | None = None) -> str:
    env = Environment(loader=FileSystemLoader(HERE / "templates"), autoescape=select_autoescape(["html", "j2"]),
                      trim_blocks=True, lstrip_blocks=True)
    env.filters["ms"] = charts.fmt_ms
    env.filters["value"] = charts.fmt_value
    report_dir = out.parent
    topics = [_topic(t, loaded.results_dir, report_dir, commentary) for t in loaded.result.topics]
    counts: dict[str, int] = {}
    for tv in topics:
        for k, v in tv.counts.items():
            counts[k] = counts.get(k, 0) + v
    return env.get_template("report.html.j2").render(
        run=loaded.result, env=loaded.result.environment, sources=loaded.sources, topics=topics,
        summary=summary_rows(topics), counts=counts, status=STATUS, dbms_name=charts.DBMS_NAME,
        generated_at=datetime.now().astimezone(), commentary_enabled=commentary is not None,
        css=Markup((HERE / "static" / "report.css").read_text(encoding="utf-8")),
        js=Markup((HERE / "static" / "report.js").read_text(encoding="utf-8")),
    )


def build(loaded: LoadedReport, out: Path | None = None, commentary: dict | None = None) -> Path:
    out = out or REPORTS_DIR / f"{loaded.result.run_id}.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(loaded, out, commentary), encoding="utf-8")
    return out
