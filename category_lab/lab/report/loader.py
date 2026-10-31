"""Finds and loads results/<runId>/run.json for the report.

Artifact paths inside a run.json are relative to that run's folder. The loader rewrites them to be
relative to the results/ folder ("<runId>/raw/..."), so a report can combine scenarios from many runs.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from lab.framework.result import RunResult, TopicResult
from lab.framework.runner import RESULTS_DIR


@dataclass
class LoadedReport:
    result: RunResult
    sources: list[str]            # run ids the report is built from
    results_dir: Path


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


def load(run_id: str = "latest", results_dir: Path = RESULTS_DIR) -> LoadedReport:
    """One run: its id, or "latest"."""
    if run_id == "latest":
        runs = list_runs(results_dir)
        if not runs:
            raise FileNotFoundError(f"no run.json under {results_dir}; run `lab run <topic>` first")
        run = runs[-1]
    else:
        path = results_dir / run_id / "run.json"
        if not path.is_file():
            raise FileNotFoundError(f"{path} not found")
        run = RunResult.model_validate_json(path.read_text(encoding="utf-8"))
    return LoadedReport(_rebase(run), [run.run_id], results_dir)


def load_latest_per_scenario(results_dir: Path = RESULTS_DIR, target: str | None = None,
                             topics_filter: set[str] | None = None) -> LoadedReport:
    """The newest result of every scenario across all runs, grouped by topic. This is how the team gets
    one report when each member runs their own topic (or only one DBMS of it) separately.
    `target` keeps only runs against that Redis target, so local and aws numbers are never mixed.
    `topics_filter` keeps only these topic ids (the CLI passes the topics that still exist in topics/)."""
    runs = [r for r in list_runs(results_dir) if target is None or r.environment.target == target]
    if not runs:
        raise FileNotFoundError(f"no run.json under {results_dir}" + (f" for target {target}" if target else ""))
    topics: dict[str, TopicResult] = {}
    scenarios: dict[tuple[str, str], tuple[int, object]] = {}
    sources: list[str] = []
    order = 0
    for run in map(_rebase, runs):                       # oldest first, newer results overwrite
        used = False
        for t in run.topics:
            if topics_filter is not None and t.topic.id not in topics_filter:
                continue
            topics[t.topic.id] = TopicResult(topic=t.topic, scenarios=[])      # newest topic info wins
            for s in t.scenarios:
                if s.status == "skipped" and (t.topic.id, s.id) in scenarios:
                    continue                             # a skip never hides an earlier real result
                key = (t.topic.id, s.id)
                first_seen = scenarios[key][0] if key in scenarios else (order := order + 1)
                scenarios[key] = (first_seen, s)
                used = True
        if used:
            sources.append(run.run_id)
    for (topic_id, _), (_, s) in sorted(scenarios.items(), key=lambda kv: kv[1][0]):
        topics[topic_id].scenarios.append(s)

    latest = runs[-1]
    merged = RunResult(run_id=f"combined-{datetime.now():%Y%m%d-%H%M%S}", started_at=runs[0].started_at,
                       finished_at=datetime.now(timezone.utc), environment=latest.environment,
                       topics=[topics[k] for k in sorted(topics, key=lambda k: _topic_order(topics[k]))])
    return LoadedReport(merged, sources, results_dir)


def _topic_order(t: TopicResult) -> tuple[int, str]:
    folder = t.topic.folder
    try:
        return int(folder[1:].split("_", 1)[0]), folder
    except (ValueError, IndexError):
        return 999, t.topic.id
