"""Loads results/<runId>/run.json files into one report per topic.

A topic's report takes the NEWEST result of every scenario of that topic across the selected runs, so a
member can re-run one DBMS (or one scenario) without losing the other results. A skipped scenario never
hides an earlier real result. Only runs against one Redis target are combined, so local and aws numbers
are never mixed; `run_id` restricts the report to that single run.

Artifact paths inside a run.json are relative to that run's folder. The loader rewrites them to be
relative to the results/ folder ("<runId>/raw/..."), so one report can use artifacts of many runs.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from lab.framework.result import RunResult, ScenarioResult, TopicResult
from lab.framework.runner import RESULTS_DIR


@dataclass
class RunRef:
    """A run that contributed to a topic report."""
    run_id: str
    started_at: datetime
    target: str
    scenarios: int                      # how many of the report's scenarios come from this run


@dataclass
class LoadedReport:
    """Everything one topic report is built from. `result` holds exactly one topic."""
    result: RunResult
    runs: list[RunRef] = field(default_factory=list)
    results_dir: Path = RESULTS_DIR

    @property
    def topic(self) -> TopicResult:
        return self.result.topics[0]

    @property
    def sources(self) -> list[str]:
        return [r.run_id for r in self.runs]


def list_runs(results_dir: Path = RESULTS_DIR) -> list[RunResult]:
    runs = []
    for path in results_dir.glob("*/run.json"):
        try:
            runs.append(RunResult.model_validate_json(path.read_text(encoding="utf-8")))
        except ValueError:
            continue                          # half-written or from an older format: ignore
    return sorted(runs, key=lambda r: r.started_at)


def _rebase(run: RunResult) -> RunResult:
    run = run.model_copy(deep=True)
    for topic in run.topics:
        for s in topic.scenarios:
            for a in s.artifacts:
                a.path = f"{run.run_id}/{a.path}"
    return run


def load_topic_reports(results_dir: Path = RESULTS_DIR, *, run_id: str | None = None, target: str | None = None,
                       topics_filter: set[str] | None = None) -> list[LoadedReport]:
    """One LoadedReport per topic found in the selected runs (oldest topic folder first)."""
    runs = list_runs(results_dir)
    if run_id is not None:
        runs = [r for r in runs if r.run_id == run_id]
        if not runs:
            raise FileNotFoundError(f"{results_dir / run_id / 'run.json'} not found")
    elif target is not None:
        runs = [r for r in runs if r.environment.target == target]
    if not runs:
        raise FileNotFoundError(f"no run.json under {results_dir}" + (f" for target {target}" if target else ""))

    infos: dict[str, TopicResult] = {}                                  # topic id -> newest topic info
    chosen: dict[str, dict[str, tuple[ScenarioResult, RunResult]]] = {}  # topic -> scenario id -> (result, run)
    order: dict[str, list[str]] = {}                                    # first-seen order of scenario ids
    for run in map(_rebase, runs):                                      # oldest first: newer results win
        for t in run.topics:
            tid = t.topic.id
            if topics_filter is not None and tid not in topics_filter:
                continue
            infos[tid] = t
            picked = chosen.setdefault(tid, {})
            for s in t.scenarios:
                if s.status == "skipped" and s.id in picked:
                    continue                                            # a skip never hides a real result
                if s.id not in picked:
                    order.setdefault(tid, []).append(s.id)
                picked[s.id] = (s, run)

    reports = []
    for tid, picked in chosen.items():
        scenarios = [picked[sid][0] for sid in order[tid]]
        used: dict[str, RunRef] = {}
        for _, run in picked.values():
            ref = used.setdefault(run.run_id, RunRef(run.run_id, run.started_at, run.environment.target, 0))
            ref.scenarios += 1
        refs = sorted(used.values(), key=lambda r: r.started_at)
        latest = max((run for _, run in picked.values()), key=lambda r: r.started_at)
        result = RunResult(run_id=f"{tid}-{latest.run_id}", started_at=refs[0].started_at,
                           finished_at=latest.finished_at, environment=latest.environment,
                           topics=[TopicResult(topic=infos[tid].topic, scenarios=scenarios)])
        reports.append(LoadedReport(result, refs, results_dir))
    return sorted(reports, key=lambda r: _topic_order(r.topic))


def _topic_order(t: TopicResult) -> tuple[int, str]:
    folder = t.topic.folder
    try:
        return int(folder[1:].split("_", 1)[0]), folder
    except (ValueError, IndexError):
        return 999, t.topic.id
