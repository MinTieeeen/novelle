"""Pairs the SQL Server and Redis scenarios of a topic and decides which DBMS did better per metric.
Used by the terminal view (`lab run`) and the HTML report, so both always agree.

A pair is the two scenarios with the same `pair` key in one topic. Its rows are:
  * timing   every server_ms variant of each side, and one verdict on the best variant of each
  * shared   every other metric recorded with the same name and label on both sides
             (e.g. lost_updates · atomic_update)
Metrics only one side has (logical_reads, memory_bytes) stay with their scenario.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from lab.framework.result import Metric, ScenarioResult, TopicResult

Winner = Literal["sqlserver", "redis", "tie", "none"]
COMPARABLE = ("passed", "failed")


@dataclass
class Verdict:
    winner: Winner
    text: str                       # plain text, no markup
    ratio: float | None = None


@dataclass
class SharedRow:
    name: str
    label: str
    unit: str
    sql: Metric
    redis: Metric
    verdict: Verdict


@dataclass
class Pair:
    topic: str
    key: str
    title: str
    sql: ScenarioResult | None = None
    redis: ScenarioResult | None = None
    timing_verdict: Verdict | None = None
    shared: list[SharedRow] = field(default_factory=list)

    def timings(self, dbms: str) -> list[Metric]:
        s = self.sql if dbms == "sqlserver" else self.redis
        return [m for m in s.metrics if m.name == "server_ms"] if s and s.status in COMPARABLE else []


def verdict(sql_m: Metric, redis_m: Metric) -> Verdict:
    """Which DBMS did better on one metric, honouring `better` and the timing resolution."""
    if sql_m.better == "none":
        return Verdict("none", "-")
    noise = (sql_m.resolution_ms or 0) + (redis_m.resolution_ms or 0)
    if abs(sql_m.value - redis_m.value) <= noise:
        return Verdict("tie", "ngang nhau trong sai số đo" if noise else "bằng nhau")
    sql_wins = (sql_m.value < redis_m.value) == (sql_m.better == "lower")
    win, lose = (sql_m, redis_m) if sql_wins else (redis_m, sql_m)
    name = "SQL Server" if sql_wins else "Redis"
    if win.value > 0 and lose.value > 0:
        ratio = max(win.value, lose.value) / min(win.value, lose.value)
        return Verdict("sqlserver" if sql_wins else "redis", f"{name} tốt hơn ×{ratio:.1f}", ratio)
    return Verdict("sqlserver" if sql_wins else "redis", f"{name} tốt hơn")


def build_pairs(topic: TopicResult) -> tuple[list[Pair], list[ScenarioResult]]:
    """(pairs in first-seen order, scenarios without a pair)."""
    pairs: dict[str, Pair] = {}
    unpaired: list[ScenarioResult] = []
    for s in topic.scenarios:
        if not s.pair:
            unpaired.append(s)
            continue
        p = pairs.setdefault(s.pair, Pair(topic=topic.topic.id, key=s.pair, title=s.title))
        if s.dbms == "sqlserver":
            p.sql = s
        else:
            p.redis = s

    for p in pairs.values():
        sql_t, redis_t = p.timings("sqlserver"), p.timings("redis")
        if sql_t and redis_t:
            p.timing_verdict = verdict(min(sql_t, key=lambda m: m.value), min(redis_t, key=lambda m: m.value))
        if p.sql and p.redis and p.sql.status in COMPARABLE and p.redis.status in COMPARABLE:
            redis_by_id = {(m.name, m.label): m for m in p.redis.metrics if m.name != "server_ms"}
            for m in p.sql.metrics:
                other = redis_by_id.get((m.name, m.label))
                if m.name != "server_ms" and other is not None:
                    p.shared.append(SharedRow(m.name, m.label, m.unit, m, other, verdict(m, other)))
    return list(pairs.values()), unpaired
