"""`lab check`: verifies that the lab can run before anyone writes a scenario.

Each check returns a CheckResult with a status:
  PASS  ready          WARN  works, but something a topic needs is missing          FAIL  cannot run
The checks never modify the databases.
"""
from __future__ import annotations

import statistics
import time
from dataclasses import dataclass, field
from typing import Callable, Literal

from lab.config import LabConfig
from lab.connections import RedisClient, SqlServer

Status = Literal["PASS", "WARN", "FAIL"]


@dataclass
class CheckResult:
    group: str
    name: str
    status: Status
    detail: str
    elapsed_ms: float = 0.0


@dataclass
class CheckReport:
    results: list[CheckResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(r.status != "FAIL" for r in self.results)


def round_trip_ms(fn: Callable[[], object], samples: int) -> tuple[float, float]:
    """Median and max time of a trivial call: the network round trip that every query pays."""
    fn()                                        # warm up the connection
    times = []
    for _ in range(samples):
        start = time.perf_counter()
        fn()
        times.append((time.perf_counter() - start) * 1000)
    return statistics.median(times), max(times)


def _run(report: CheckReport, group: str, name: str, fn: Callable[[], tuple[Status, str]]) -> bool:
    start = time.perf_counter()
    try:
        status, detail = fn()
    except Exception as exc:                    # a check must never crash the command
        status, detail = "FAIL", f"{type(exc).__name__}: {exc}"
    report.results.append(CheckResult(group, name, status, detail, (time.perf_counter() - start) * 1000))
    return status != "FAIL"


def check_sqlserver(cfg: LabConfig, report: CheckReport) -> None:
    group = "SQL Server (RDS)"
    holder: dict[str, SqlServer] = {}

    def connect() -> tuple[Status, str]:
        holder["db"] = SqlServer(cfg.sql)
        return "PASS", f"{cfg.sql.user}@{cfg.sql.host}:{cfg.sql.port}/{cfg.sql.database}"

    if not _run(report, group, "Kết nối", connect):
        return
    db = holder["db"]
    try:
        def version() -> tuple[Status, str]:
            row = db.query("SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(40)) AS v, "
                           "CAST(SERVERPROPERTY('ProductLevel') AS NVARCHAR(40)) AS lvl, "
                           "CAST(SERVERPROPERTY('Edition') AS NVARCHAR(100)) AS ed")[0]
            return "PASS", f"{row['v']} {row['lvl']}, {row['ed']}"

        def rights() -> tuple[Status, str]:
            row = db.query(
                "SELECT IS_ROLEMEMBER('db_owner') AS owner, "
                "HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'SHOWPLAN') AS showplan, "
                "HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DATABASE STATE') AS dbstate, "
                "HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS ddl")[0]
            missing = [n for n, k in (("SHOWPLAN", "showplan"), ("VIEW DATABASE STATE", "dbstate"),
                                      ("CREATE TABLE", "ddl")) if not row[k]]
            detail = ("db_owner" if row["owner"] else "không phải db_owner") + (
                f"; thiếu: {', '.join(missing)}" if missing else "; đủ SHOWPLAN, VIEW DATABASE STATE, DDL")
            return ("WARN" if missing else "PASS"), detail

        def fulltext() -> tuple[Status, str]:
            installed = db.scalar("SELECT FULLTEXTSERVICEPROPERTY('IsFullTextInstalled')")
            has_index = db.scalar("SELECT COUNT(*) FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('dbo.Story')")
            if not installed:
                return "WARN", "Full-Text Search chưa cài trên instance"
            return ("PASS" if has_index else "WARN"), (
                "đã cài, có full-text index trên dbo.Story" if has_index else "đã cài nhưng dbo.Story chưa có full-text index")

        def data() -> tuple[Status, str]:
            rows = db.query(
                "SELECT t.name, SUM(p.rows) AS n FROM sys.tables t "
                "JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1) "
                "WHERE t.schema_id = SCHEMA_ID('dbo') AND t.name IN ('User','Story','Chapter','Rating','ReadingHistory') "
                "GROUP BY t.name ORDER BY t.name")
            counts = {r["name"]: int(r["n"]) for r in rows}
            if not counts.get("Story"):
                return "WARN", "chưa có dữ liệu seed (chạy novelle_backend/scripts/db-seed.*)"
            return "PASS", ", ".join(f"{k}={v:,}" for k, v in counts.items())

        def sandbox() -> tuple[Status, str]:
            exists = db.scalar("SELECT COUNT(*) FROM sys.schemas WHERE name = 'lab'")
            tables = db.scalar("SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID('lab')") if exists else 0
            return ("PASS", f"schema lab đã có, {tables} bảng sandbox còn lại"
                            + (" (dọn bằng `lab clean all`)" if tables else "")) if exists else (
                "WARN", "chưa có schema lab (tự tạo khi scenario gọi ctx.sandbox_table)")

        def rtt() -> tuple[Status, str]:
            med, worst = round_trip_ms(lambda: db.scalar("SELECT 1"), samples=10)
            return "PASS", f"SELECT 1: median {med:.1f} ms, max {worst:.1f} ms (10 lần)"

        for name, fn in (("Phiên bản", version), ("Quyền", rights), ("Full-text", fulltext),
                         ("Dữ liệu dbo", data), ("Sandbox", sandbox), ("Round trip", rtt)):
            _run(report, group, name, fn)
    finally:
        db.close()


def check_redis(cfg: LabConfig, report: CheckReport) -> None:
    group = f"Redis ({cfg.redis.target})"
    client = RedisClient(cfg.redis)
    try:
        def connect() -> tuple[Status, str]:
            client.ping()
            return "PASS", f"{cfg.redis.host}:{cfg.redis.port}"

        if not _run(report, group, "Kết nối", connect):
            return

        def version() -> tuple[Status, str]:
            info = client.info("server")
            return "PASS", f"Redis {info['redis_version']} ({info.get('os', '?')})"

        def modules() -> tuple[Status, str]:
            names = set(client.modules())
            missing = [m for m in ("search", "ReJSON") if m not in names]
            return ("WARN" if missing else "PASS"), (
                f"thiếu module: {', '.join(missing)}" if missing else "có search (RediSearch), ReJSON (RedisJSON)")

        def persistence() -> tuple[Status, str]:
            aof = client.config_get("appendonly").get("appendonly")
            fsync = client.config_get("appendfsync").get("appendfsync")
            save = client.config_get("save").get("save") or "(tắt)"
            return ("PASS" if aof == "yes" else "WARN"), f"AOF={aof}, appendfsync={fsync}, RDB save={save}"

        def memory() -> tuple[Status, str]:
            info = client.info("memory")
            limit = info.get("maxmemory_human", "0B")
            return "PASS", (f"đang dùng {info['used_memory_human']}, maxmemory "
                            f"{limit if limit != '0B' else 'không giới hạn'}, policy {info.get('maxmemory_policy')}")

        def lab_keys() -> tuple[Status, str]:
            count = sum(1 for _ in client.raw.scan_iter(match="lab:*", count=1000))
            return "PASS", f"{count} key lab:* đang tồn tại"

        def rtt() -> tuple[Status, str]:
            med, worst = round_trip_ms(client.ping, samples=20)
            return "PASS", f"PING: median {med:.2f} ms, max {worst:.2f} ms (20 lần)"

        for name, fn in (("Phiên bản", version), ("Module", modules), ("Persistence", persistence),
                         ("Bộ nhớ", memory), ("Key của lab", lab_keys), ("Round trip", rtt)):
            _run(report, group, name, fn)
    finally:
        client.close()


def check_llm(cfg: LabConfig, report: CheckReport) -> None:
    # Only checks that the key is configured; the API is first called in phase F5.
    report.results.append(CheckResult(
        "Gemini", "API key", "PASS" if cfg.gemini_api_key else "WARN",
        f"đã đặt, model {cfg.gemini_model}" if cfg.gemini_api_key
        else "chưa đặt GEMINI_API_KEY (chỉ cần cho report có nhận xét AI)"))


def run_checks(cfg: LabConfig, sql: bool = True, redis: bool = True) -> CheckReport:
    report = CheckReport()
    if sql:
        check_sqlserver(cfg, report)
    if redis:
        check_redis(cfg, report)
    check_llm(cfg, report)
    return report
