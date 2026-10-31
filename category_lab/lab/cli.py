"""Command line entry point: `uv run lab <command>`.

Commands:  config, check (F1), list, run (F2), scaffold, clean (F3), report (F4, Gemini commentary F5)
"""
from __future__ import annotations

import webbrowser
from enum import Enum
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from lab import maintenance, views
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
    llm = cfg.llm
    table.add_row("LLM", f"{llm.display_name} · {llm.model} (dự phòng: {', '.join(llm.fallback_models) or 'không'}), "
                         f"key {mask(llm.api_key)}")
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
                                               help="Cho phép chạy scenario có destructive=True."),
        keep: bool = typer.Option(False, "--keep",
                                  help="Giữ bảng lab.<topic>__* và key lab:<topic>:* sau khi chạy để xem lại "
                                       "(dọn bằng `lab clean`).")) -> None:
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
    result, run_dir = runner.run(topics, cfg, runner.RunOptions(allow_destructive=allow_destructive, repeat=repeat,
                                                                   keep=keep),
                                 listener=views.ProgressPrinter(console))

    for table in views.scenario_details(result):
        console.print(table)
    if (pairs := views.pair_comparison(result)) is not None:
        console.print(pairs)
    if views.coarse_timing_used(result):
        console.print(f"{views.COARSE} Độ phân giải của phép đo lớn hơn 10% giá trị, nên chữ số cuối không đáng tin. "
                      "Redis SLOWLOG tính theo µs nguyên; SQL Server chia theo số lần lặp trong batch (inner=).")
    counts = views.status_counts(result)
    console.print(" · ".join(f"[{views.RUN_STYLE[k]}]{k}: {v}[/]" for k, v in counts.items()))
    console.print(f"Kết quả: [cyan]{(run_dir / 'run.json').as_posix()}[/]")
    if counts.get("error") or counts.get("failed") or any(t.load_errors for t in topics):
        raise typer.Exit(1)

    if keep:
        console.print("[yellow]--keep: dữ liệu lab được giữ lại, nhớ chạy `lab clean <topic>` khi xong.[/]")


@app.command()
def scaffold(folder: str = typer.Argument(..., help="Tên folder mới, dạng t<số>_<id>, vd. t5_concurrency."),
             owner: str = typer.Option(..., "--owner", "-o", help="Tên người phụ trách topic."),
             title: str | None = typer.Option(None, "--title", help="Tên topic hiển thị trong report.")) -> None:
    """Tạo folder topic mới từ topics/_template (không ghi đè folder đã có)."""
    try:
        target = maintenance.scaffold(folder, owner, title)
    except (ValueError, FileExistsError) as exc:
        console.print(f"[bold red]Không tạo được:[/] {exc}")
        raise typer.Exit(2)
    console.print(f"[green]Đã tạo[/] {target.relative_to(target.parents[1]).as_posix()}/")
    for f in sorted(p for p in target.rglob("*") if p.is_file()):
        console.print(f"  {f.relative_to(target).as_posix()}")
    console.print(f"Tiếp theo: sửa TOPIC trong __init__.py, viết scenario, rồi `lab run {folder.split('_', 1)[1]}`.")


@app.command()
def clean(topic: str = typer.Argument(..., help="id topic, hoặc 'all' để xoá mọi bảng lab.* và key lab:*."),
          target: str | None = TargetOption,
          sql: bool = typer.Option(True, "--sql/--no-sql"),
          redis: bool = typer.Option(True, "--redis/--no-redis")) -> None:
    """Xoá dữ liệu lab còn sót: bảng sandbox lab.<topic>__* trên RDS và key lab:<topic>:* trên Redis."""
    cfg = _load(target)
    if topic != "all" and not maintenance.TOPIC_ID.match(topic):
        console.print(f"[bold red]id topic không hợp lệ:[/] {topic}")
        raise typer.Exit(2)
    r = maintenance.clean(cfg, None if topic == "all" else topic, sql=sql, redis=redis)
    if sql:
        console.print(f"SQL Server: xoá {len(r.tables)} bảng" + (f" ({', '.join(r.tables)})" if r.tables else ""))
    if redis:
        console.print(f"Redis ({cfg.target}): xoá {r.redis_keys} key")
    for err in r.errors:
        console.print(f"[bold red]{err}[/]")
    if r.errors:
        raise typer.Exit(1)


@app.command()
def report(run_id: str = typer.Argument("latest", help="runId trong results/, hoặc 'latest'."),
           latest_per_topic: bool = typer.Option(False, "--latest-per-topic", "-a",
                                                 help="Gộp kết quả mới nhất của mọi scenario, mọi topic "
                                                      "thành một report (dùng cho báo cáo chung của nhóm)."),
           target: str | None = typer.Option(None, "--target", "-t",
                                             help="Khi gộp: chỉ lấy các lần chạy với Redis target này."),
           out: Path | None = typer.Option(None, "--out", "-o", help="Đường dẫn file HTML (mặc định reports/)."),
           open_: bool = typer.Option(False, "--open", help="Mở report bằng trình duyệt sau khi tạo."),
           llm: bool = typer.Option(True, "--llm/--no-llm", help="Thêm nhận xét của Gemini (cần GEMINI_API_KEY)."),
           refresh_llm: bool = typer.Option(False, "--refresh-llm",
                                            help="Hỏi lại Gemini dù kết quả không đổi (bỏ qua cache).")) -> None:
    """Tạo report HTML (một file, mở offline) từ kết quả trong results/."""
    from lab.report import builder, loader   # imported here so `lab run` stays light
    from lab.llm.clients import client_for

    try:
        if latest_per_topic:
            existing = {t.meta.id for t in _discover()}      # skip results of topics deleted since
            loaded = loader.load_latest_per_scenario(target=target, topics_filter=existing)
        else:
            loaded = loader.load(run_id)
    except FileNotFoundError as exc:
        console.print(f"[bold red]Không tìm thấy kết quả:[/] {exc}")
        raise typer.Exit(1)
    commentary, ai_errors, ai_note = None, {}, ""
    if not llm:
        ai_note = "report tạo với --no-llm"
    else:
        cfg = _load(None).llm
        if not cfg.enabled:
            ai_note = f"chưa đặt {cfg.env_keys().api_key} trong category_lab/.env"
            console.print(f"[yellow]Bỏ qua nhận xét AI:[/] {ai_note}")
        else:
            def progress(topic: str, how: str) -> None:
                text = {"cache": "dùng cache",
                        "stale": "[yellow]mọi model đều lỗi, dùng nhận xét của lần trước[/]"}.get(how)
                console.print(f"  {cfg.display_name} · {topic}: " + (text or f"đang hỏi {how.split(':', 1)[1]} ..."))
            res = client_for(cfg).generate(loaded.result.topics, loaded.result.environment,
                                                      loaded.results_dir, cfg, refresh=refresh_llm,
                                                      progress=progress)
            commentary, ai_errors = res.commentary, res.errors
            for topic, err in ai_errors.items():
                console.print(f"  [bold red]{cfg.display_name} · {topic} lỗi:[/] {err}", soft_wrap=True)
    path = builder.build(loaded, out, commentary, ai_errors, ai_note)
    n = sum(len(t.scenarios) for t in loaded.result.topics)
    console.print(f"[green]Đã tạo report[/] ({len(loaded.result.topics)} topic, {n} scenario, "
                  f"từ {len(loaded.sources)} lần chạy): [cyan]{path.as_posix()}[/]")
    if open_:
        webbrowser.open(path.resolve().as_uri())


if __name__ == "__main__":
    app()
