"""Rich terminal output for `lab list` and `lab run`."""
from __future__ import annotations

from collections import defaultdict

from rich.console import Console
from rich.table import Table

from lab.framework.bench import METHOD_SYSDATETIME
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


COARSE = "[yellow]*[/]"   # marks timings measured with SYSDATETIME (~1 ms steps)


def _fmt(m: Metric) -> str:
    if m.stats:
        mark = COARSE if m.method == METHOD_SYSDATETIME else ""
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


def pair_comparison(result: RunResult) -> Table | None:
    """For every pair, put the server_ms p50 of each DBMS side by side."""
    pairs: dict[str, dict[str, list[Metric]]] = defaultdict(lambda: defaultdict(list))
    titles: dict[str, str] = {}
    for topic in result.topics:
        for s in topic.scenarios:
            if s.pair and s.status in ("passed", "failed"):
                key = f"{topic.topic.id}/{s.pair}"
                titles.setdefault(key, s.title)
                pairs[key][s.dbms] += [m for m in s.metrics if m.name == "server_ms"]
    if not pairs:
        return None
    table = Table(title="So sánh theo cặp: thời gian xử lý phía server, p50 (ms)")
    for col in ("Cặp", "SQL Server", "Redis", "Nhanh hơn"):
        table.add_column(col)
    for key, by_dbms in pairs.items():
        def cell(dbms: str) -> tuple[str, float | None]:
            ms = by_dbms.get(dbms, [])
            if not ms:
                return "-", None
            best = min(ms, key=lambda m: m.value)
            lines = [f"{m.label or 'server_ms'}: {m.value:.3f}" + (COARSE if m.method == METHOD_SYSDATETIME else "")
                     for m in ms]
            return "\n".join(lines), best.value
        sql_text, sql_best = cell("sqlserver")
        redis_text, redis_best = cell("redis")
        verdict = "-"
        coarse = any(m.method == METHOD_SYSDATETIME for m in by_dbms.get("sqlserver", []))
        if coarse:
            verdict = "[yellow]chưa so được: SQL Server đo bằng SYSDATETIME (~1 ms)[/]"
        elif sql_best and redis_best:
            faster, ratio = ("Redis", sql_best / redis_best) if redis_best < sql_best else ("SQL Server", redis_best / sql_best)
            verdict = f"{faster} ×{ratio:.1f} (biến thể tốt nhất)"
        table.add_row(f"{key}\n[dim]{titles[key]}[/]", sql_text, redis_text, verdict)
    return table


def coarse_timing_used(result: RunResult) -> bool:
    return any(m.method == METHOD_SYSDATETIME for t in result.topics for s in t.scenarios for m in s.metrics)


def status_counts(result: RunResult) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for t in result.topics:
        for s in t.scenarios:
            counts[s.status] += 1
    return dict(counts)
