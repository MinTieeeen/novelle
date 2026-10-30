"""Command line entry point: `uv run lab <command>`.

Commands:          config, check (F1), list, run (F2)
Later phases add:  scaffold, clean (F3), report (F4-F5)
"""
from __future__ import annotations

from enum import Enum

import typer
from rich.console import Console
from rich.table import Table

from lab import views
from lab.checks import run_checks
from lab.config import ConfigError, LabConfig, load_config, mask
from lab.framework import registry, runner

app = typer.Typer(help="Novelle DBMS Lab: SQL Server (AWS RDS) vs Redis.", no_args_is_help=True,
                  add_completion=False)
console = Console()

STATUS_STYLE = {"PASS": "bold green", "WARN": "bold yellow", "FAIL": "bold red"}

TargetOption = typer.Option(None, "--target", "-t",
                            help="Redis dùng để test: local (docker compose) hoặc aws (EC2 qua tunnel). "
                                 "Mặc định lấy từ LAB_TARGET.")


def _load(target: str | None) -> LabConfig:
    try:
        return load_config(target)
    except ConfigError as exc:
        console.print(f"[bold red]Lỗi cấu hình:[/] {exc}")
        raise typer.Exit(2)


@app.command()
def config(target: str | None = TargetOption) -> None:
    """In cấu hình đang dùng (mật khẩu được che)."""
    cfg = _load(target)
    table = Table(title=f"Cấu hình lab (target = {cfg.target})", show_header=False)
    table.add_column(style="cyan")
    table.add_column()
    table.add_row("SQL Server", f"{cfg.sql.host}:{cfg.sql.port} / {cfg.sql.database}")
    table.add_row("SQL user", f"{cfg.sql.user} (password {mask(cfg.sql.password)})")
    table.add_row("ODBC driver", cfg.sql.driver)
    table.add_row("Redis", f"{cfg.redis.host}:{cfg.redis.port} db {cfg.redis.db} "
                           f"(password {mask(cfg.redis.password)})")
    table.add_row("Gemini", f"{cfg.gemini_model}, key {mask(cfg.gemini_api_key)}")
    table.add_row("File .env", "\n".join(cfg.sources) or "(không có, chỉ dùng biến môi trường)")
    console.print(table)


@app.command()
def check(target: str | None = TargetOption,
          sql: bool = typer.Option(True, "--sql/--no-sql", help="Kiểm tra SQL Server."),
          redis: bool = typer.Option(True, "--redis/--no-redis", help="Kiểm tra Redis.")) -> None:
    """Kiểm tra kết nối, phiên bản, quyền, module và độ trễ mạng tới 2 DBMS."""
    cfg = _load(target)
    with console.status("Đang kiểm tra..."):
        report = run_checks(cfg, sql=sql, redis=redis)

    table = Table(title=f"lab check (Redis target = {cfg.target})")
    for col in ("Nhóm", "Hạng mục", "Kết quả", "Chi tiết", "ms"):
        table.add_column(col, justify="right" if col == "ms" else "left")
    previous = None
    for r in report.results:
        table.add_row(r.group if r.group != previous else "", r.name,
                      f"[{STATUS_STYLE[r.status]}]{r.status}[/]", r.detail, f"{r.elapsed_ms:.0f}")
        previous = r.group
    console.print(table)

    if not report.ok:
        console.print("[bold red]Có hạng mục FAIL, lab chưa chạy được.[/]")
        raise typer.Exit(1)
    console.print("[bold green]Sẵn sàng.[/] WARN không chặn lab nhưng một số topic có thể cần.")


class DbmsChoice(str, Enum):
    all = "all"
    sqlserver = "sqlserver"
    redis = "redis"


def _discover() -> list[registry.Topic]:
    try:
        return registry.discover()
    except registry.RegistryError as exc:
        console.print(f"[bold red]Lỗi khai báo topic:[/] {exc}")
        raise typer.Exit(2)


@app.command("list")
def list_(topic: str = typer.Argument("all", help="id topic (vd. indexing) hoặc 'all'."),
          dbms: DbmsChoice = typer.Option(DbmsChoice.all, "--dbms", "-d")) -> None:
    """Liệt kê topic, owner và scenario tìm thấy trong topics/."""
    topics = registry.select(_discover(), topic, dbms.value)
    if not topics:
        console.print(f"[yellow]Không có scenario nào khớp '{topic}'.[/]")
        raise typer.Exit(1)
    console.print(views.topics_table(topics))


@app.command()
def run(topic: str = typer.Argument(..., help="id topic (vd. indexing) hoặc 'all'."),
        dbms: DbmsChoice = typer.Option(DbmsChoice.all, "--dbms", "-d", help="Chỉ chạy scenario của 1 DBMS."),
        scenario: str | None = typer.Option(None, "--scenario", "-s",
                                            help="Glob trên scenario id, vd. 'indexing.sqlserver.*'."),
        target: str | None = TargetOption,
        repeat: int | None = typer.Option(None, "--repeat", "-n", min=1,
                                          help="Ghi đè số lần đo của mọi bench."),
        allow_destructive: bool = typer.Option(False, "--allow-destructive",
                                               help="Cho phép chạy scenario có destructive=True.")) -> None:
    """Chạy scenario, in kết quả và lưu results/<runId>/run.json."""
    cfg = _load(target)
    topics = registry.select(_discover(), topic, dbms.value, scenario)
    if not topics:
        console.print(f"[yellow]Không có scenario nào khớp.[/] Xem `lab list`.")
        raise typer.Exit(1)
    for t in topics:
        for err in t.load_errors:
            console.print(f"[bold red]Không nạp được {t.folder.name}/{err}[/]")

    console.print(f"[bold]Chạy {sum(len(t.scenarios) for t in topics)} scenario[/] "
                  f"(SQL Server = RDS, Redis = {cfg.target})")
    result, run_dir = runner.run(topics, cfg, runner.RunOptions(allow_destructive=allow_destructive, repeat=repeat),
                                 listener=views.ProgressPrinter(console))

    for table in views.scenario_details(result):
        console.print(table)
    if (pairs := views.pair_comparison(result)) is not None:
        console.print(pairs)
    if views.coarse_timing_used(result):
        console.print(f"{views.COARSE} SQL Server được đo bằng SYSDATETIME(), chỉ chính xác khoảng 1 ms. "
                      "Cấp quyền VIEW SERVER STATE cho user của lab để dùng sys.dm_exec_query_stats (µs).")
    counts = views.status_counts(result)
    console.print(" · ".join(f"[{views.RUN_STYLE[k]}]{k}: {v}[/]" for k, v in counts.items()))
    console.print(f"Kết quả: [cyan]{(run_dir / 'run.json').as_posix()}[/]")
    if counts.get("error") or counts.get("failed") or any(t.load_errors for t in topics):
        raise typer.Exit(1)


if __name__ == "__main__":
    app()
