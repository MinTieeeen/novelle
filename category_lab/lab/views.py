"""Rich terminal output for `lab list` and `lab run`."""
from __future__ import annotations

from collections import defaultdict

from rich.console import Console
from rich.table import Table

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


def _verdict(sql_m: Metric, redis_m: Metric) -> str:
    """Which DBMS did better on one metric, honouring `better` and the timing resolution."""
    if sql_m.better == "none":
        return "-"
    noise = (sql_m.resolution_ms or 0) + (redis_m.resolution_ms or 0)
    if abs(sql_m.value - redis_m.value) <= noise:
        return "[yellow]ngang nhau trong sai số đo[/]" if noise else "bằng nhau"
    lower_wins = sql_m.better == "lower"
    sql_wins = (sql_m.value < redis_m.value) == lower_wins
    win, lose = (sql_m, redis_m) if sql_wins else (redis_m, sql_m)
    name = "SQL Server" if sql_wins else "Redis"
    if win.value and lose.value and (win.value > 0) == (lose.value > 0):
        ratio = max(win.value, lose.value) / min(win.value, lose.value)
        return f"{name} tốt hơn ×{ratio:.1f}"
    return f"{name} tốt hơn"


def pair_comparison(result: RunResult) -> Table | None:
    """For every pair: the best server_ms variant of each DBMS, then every metric (same name and label)
    that both sides recorded, e.g. lost_updates · atomic_update."""
    pairs: dict[str, dict[str, list[Metric]]] = defaultdict(lambda: defaultdict(list))
    titles: dict[str, str] = {}
    for topic in result.topics:
        for s in topic.scenarios:
            if s.pair and s.status in ("passed", "failed"):
                key = f"{topic.topic.id}/{s.pair}"
                titles.setdefault(key, s.title)
                pairs[key][s.dbms] += s.metrics
    if not pairs:
        return None
    table = Table(title="So sánh theo cặp (thời gian = xử lý phía server, p50)")
    for col in ("Cặp", "Metric", "SQL Server", "Redis", "Kết luận"):
        table.add_column(col)
    for key, by_dbms in pairs.items():
        sql_ms, redis_ms = by_dbms.get("sqlserver", []), by_dbms.get("redis", [])
        rows: list[tuple[str, str, str, str]] = []

        def timing_cell(ms: list[Metric]) -> str:
            return "\n".join(f"{m.label or '-'}: {m.value:.3f}{COARSE if m.coarse else ''}" for m in ms) or "-"

        sql_t = [m for m in sql_ms if m.name == "server_ms"]
        redis_t = [m for m in redis_ms if m.name == "server_ms"]
        if sql_t and redis_t:
            verdict = _verdict(min(sql_t, key=lambda m: m.value), min(redis_t, key=lambda m: m.value))
            rows.append(("server_ms (ms)", timing_cell(sql_t), timing_cell(redis_t),
                         verdict + " [dim](biến thể tốt nhất)[/]"))
        elif sql_t or redis_t:
            rows.append(("server_ms (ms)", timing_cell(sql_t), timing_cell(redis_t), "-"))

        redis_by_id = {(m.name, m.label): m for m in redis_ms if m.name != "server_ms"}
        for m in sql_ms:
            other = redis_by_id.get((m.name, m.label))
            if m.name == "server_ms" or other is None:
                continue
            rows.append((f"{m.name} · {m.label}" + (f" ({m.unit})" if m.unit else ""),
                         f"{m.value:g}", f"{other.value:g}", _verdict(m, other)))

        for i, (metric, sql_text, redis_text, verdict) in enumerate(rows or [("-", "-", "-", "-")]):
            table.add_row(f"{key}\n[dim]{titles[key]}[/]" if i == 0 else "", metric, sql_text, redis_text, verdict)
        table.add_section()
    return table


def coarse_timing_used(result: RunResult) -> bool:
    return any(m.coarse for t in result.topics for s in t.scenarios for m in s.metrics)


def status_counts(result: RunResult) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for t in result.topics:
        for s in t.scenarios:
            counts[s.status] += 1
    return dict(counts)
