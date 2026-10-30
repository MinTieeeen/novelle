"""Rich terminal output for `lab list` and `lab run`."""
from __future__ import annotations

from collections import defaultdict

from rich.console import Console
from rich.table import Table

from lab.framework import compare
from lab.framework.registry import Topic
from lab.framework.result import Metric, RunResult, ScenarioResult
from lab.framework.scenario import ScenarioDef

RUN_STYLE = {"passed": "bold green", "failed": "bold red", "error": "bold magenta", "skipped": "dim"}
DBMS_LABEL = {"sqlserver": "SQL Server", "redis": "Redis"}


def topics_table(topics: list[Topic]) -> Table:
    table = Table(title="Topic và scenario")
    for col in ("Topic", "Owner", "DBMS", "Scenario id", "Pair", "Target", "Ghi chú"):
        table.add_column(col)
    for t in topics:
        first = True
        for s in t.scenarios:
            notes = "destructive" if s.destructive else ""
            table.add_row(f"{t.meta.id}\n[dim]{t.folder.name}[/]" if first else "", t.meta.owner if first else "",
                          DBMS_LABEL[s.dbms], f"{s.id}\n[dim]{s.title}[/]", s.pair or "-",
                          ",".join(sorted(s.targets)), notes)
            first = False
        for err in t.load_errors:
            table.add_row(t.meta.id if first else "", t.meta.owner if first else "", "", f"[red]LỖI {err}[/]",
                          "", "", "")
            first = False
        table.add_section()
    return table


class ProgressPrinter:
    """Listener used by the runner: one line per scenario as it finishes."""

    def __init__(self, console: Console):
        self.console = console

    def scenario_started(self, s: ScenarioDef) -> None:
        self.console.print(f"[dim]▶ {s.id} ...[/]")

    def scenario_finished(self, s: ScenarioDef, r: ScenarioResult) -> None:
        extra = r.skip_reason or (r.error.strip().splitlines()[-1] if r.error else "")
        self.console.print(f"  [{RUN_STYLE[r.status]}]{r.status.upper():8}[/] {s.id} "
                           f"[dim]({r.duration_s:.1f}s)[/] {extra}")


COARSE = "[yellow]*[/]"   # the timing method cannot resolve this value well (resolution > 10%)


def _fmt(m: Metric) -> str:
    if m.stats:
        mark = COARSE if m.coarse else ""
        return f"{m.stats.p50:.3f}{mark} [dim](p95 {m.stats.p95:.3f}, n={m.stats.count})[/]"
    return f"{m.value:g}"


def scenario_details(result: RunResult) -> list[Table]:
    tables = []
    for topic in result.topics:
        table = Table(title=f"{topic.topic.title}  [dim]({topic.topic.owner})[/]", show_lines=False)
        for col in ("DBMS", "Scenario", "Kết quả", "Metric", "Giá trị", "Đơn vị"):
            table.add_column(col)
        for s in topic.scenarios:
            rows = [(f"{m.name}" + (f" · {m.label}" if m.label else ""), _fmt(m), m.unit) for m in s.metrics] or [("", "", "")]
            for i, (name, value, unit) in enumerate(rows):
                table.add_row(DBMS_LABEL[s.dbms] if i == 0 else "", s.title if i == 0 else "",
                              f"[{RUN_STYLE[s.status]}]{s.status}[/]" if i == 0 else "", name, value, unit)
            for c in s.checks:
                table.add_row("", "", "", "[green]✔[/]" if c.passed else "[red]✘[/]", c.message, "")
            table.add_section()
        tables.append(table)
    return tables


def _verdict_markup(v: compare.Verdict | None, suffix: str = "") -> str:
    if v is None:
        return "-"
    return f"[yellow]{v.text}[/]" if v.winner == "tie" and v.text != "bằng nhau" else v.text + suffix


def pair_comparison(result: RunResult) -> Table | None:
    """For every pair: the best server_ms variant of each DBMS, then every metric (same name and label)
    that both sides recorded, e.g. lost_updates · atomic_update. Logic lives in framework/compare.py."""
    table = Table(title="So sánh theo cặp (thời gian = xử lý phía server, p50)")
    for col in ("Cặp", "Metric", "SQL Server", "Redis", "Kết luận"):
        table.add_column(col)
    found = False
    for topic in result.topics:
        for p in compare.build_pairs(topic)[0]:
            found = True
            rows: list[tuple[str, str, str, str]] = []

            def timing_cell(ms: list[Metric]) -> str:
                return "\n".join(f"{m.label or '-'}: {m.value:.3f}{COARSE if m.coarse else ''}" for m in ms) or "-"

            sql_t, redis_t = p.timings("sqlserver"), p.timings("redis")
            if sql_t or redis_t:
                rows.append(("server_ms (ms)", timing_cell(sql_t), timing_cell(redis_t),
                             _verdict_markup(p.timing_verdict, " [dim](biến thể tốt nhất)[/]")))
            for r in p.shared:
                rows.append((f"{r.name} · {r.label}" + (f" ({r.unit})" if r.unit else ""),
                             f"{r.sql.value:g}", f"{r.redis.value:g}", _verdict_markup(r.verdict)))
            for i, (metric, sql_text, redis_text, verdict) in enumerate(rows or [("-", "-", "-", "-")]):
                table.add_row(f"{p.topic}/{p.key}\n[dim]{p.title}[/]" if i == 0 else "", metric, sql_text,
                              redis_text, verdict)
            table.add_section()
    return table if found else None


def coarse_timing_used(result: RunResult) -> bool:
    return any(m.coarse for t in result.topics for s in t.scenarios for m in s.metrics)


def status_counts(result: RunResult) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for t in result.topics:
        for s in t.scenarios:
            counts[s.status] += 1
    return dict(counts)
