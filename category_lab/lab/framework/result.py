"""Result models written to results/<runId>/run.json and read by the report (phase F4).

RunResult ─┬─ environment (target, DBMS versions)
           └─ topics: TopicResult ─┬─ meta (title, owner, research questions)
                                   └─ scenarios: ScenarioResult ─┬─ metrics   (numbers, e.g. server_ms)
                                                                 ├─ checks    (PASS/FAIL statements)
                                                                 ├─ observations (member's notes)
                                                                 └─ artifacts (raw files: plans, INFO ...)
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Dbms = Literal["sqlserver", "redis"]
ScenarioStatus = Literal["passed", "failed", "error", "skipped"]


class Stats(BaseModel):
    """Summary of repeated measurements. `samples` keeps the raw values (same unit as the summary)."""
    count: int
    min: float
    p50: float
    p95: float
    max: float
    mean: float
    samples: list[float] = Field(default_factory=list)


class Metric(BaseModel):
    name: str                        # e.g. "server_ms", "logical_reads", "lost_updates"
    label: str = ""                  # variant measured, e.g. "no_index" / "covering_index"
    value: float                     # the headline number (p50 for timings)
    unit: str = ""
    better: Literal["lower", "higher", "none"] = "lower"
    stats: Stats | None = None       # present for timings
    method: str = ""                 # how a timing was measured: sysdatetime_loop | slowlog
    resolution_ms: float | None = None   # smallest difference the timing method can see

    @property
    def coarse(self) -> bool:
        """True when the method's resolution is more than 10% of the measured value."""
        return self.resolution_ms is not None and self.resolution_ms > 0.1 * max(self.value, 1e-9)

    note: str = ""


class Check(BaseModel):
    passed: bool
    message: str


class Artifact(BaseModel):
    label: str
    path: str                        # relative to the run folder
    kind: str = "text"               # text | json | xml


class ScenarioResult(BaseModel):
    id: str
    title: str
    topic: str
    dbms: Dbms
    pair: str | None = None
    description: str = ""
    status: ScenarioStatus
    skip_reason: str = ""
    error: str = ""
    started_at: datetime
    duration_s: float
    metrics: list[Metric] = Field(default_factory=list)
    checks: list[Check] = Field(default_factory=list)
    observations: list[str] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)


class TopicInfo(BaseModel):
    id: str
    title: str
    owner: str
    research_questions: list[str] = Field(default_factory=list)
    context: str = ""


class TopicResult(BaseModel):
    topic: TopicInfo
    scenarios: list[ScenarioResult] = Field(default_factory=list)


class Environment(BaseModel):
    target: str
    sqlserver_version: str = ""
    sqlserver_edition: str = ""
    redis_version: str = ""
    sql_database: str = ""
    redis_endpoint: str = ""


class RunResult(BaseModel):
    run_id: str
    started_at: datetime
    finished_at: datetime | None = None
    environment: Environment
    topics: list[TopicResult] = Field(default_factory=list)
