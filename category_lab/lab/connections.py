"""Thin wrappers around pyodbc and redis-py used by every scenario.

SqlServer  one autocommit connection to RDS + helpers (query, scalar, exec, exec_file with GO batches).
           `new_connection()` opens extra connections for concurrency scenarios.
RedisClient  a redis-py client plus a key namespace "lab:<namespace>:" so lab data never mixes with
           the application's keys, and `cleanup()` removes everything in that namespace.

Parameters are always passed separately (`?` placeholders for pyodbc), never formatted into SQL.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Iterator, Sequence

import pyodbc
import redis

from lab.config import RedisConfig, SqlServerConfig

# A batch separator is a line containing only GO (a trailing comment is allowed; "GO <count>" is not supported).
_GO = re.compile(r"^\s*GO\s*(?:--.*)?$", re.IGNORECASE | re.MULTILINE)

LAB_KEY_ROOT = "lab"


_SQL_ERROR_NUMBER = re.compile(r"\((\d{3,6})\)\s*\(SQL\w+\)")


def sql_error_number(exc: BaseException) -> int | None:
    """SQL Server error number inside a pyodbc error, e.g. 1205 (deadlock victim), 2627 (duplicate key),
    50000+ (RAISERROR/THROW from a procedure). None for anything else."""
    if not isinstance(exc, pyodbc.Error):
        return None
    numbers = [int(n) for n in _SQL_ERROR_NUMBER.findall(" ".join(str(a) for a in exc.args))]
    return numbers[0] if numbers else None


def split_batches(script: str) -> list[str]:
    """Split a T-SQL script on GO lines, like sqlcmd does. Empty batches are dropped."""
    return [b.strip() for b in _GO.split(script) if b.strip()]


class SqlServer:
    def __init__(self, config: SqlServerConfig, autocommit: bool = True):
        self.config = config
        self.conn = self._connect(autocommit)

    def _connect(self, autocommit: bool) -> pyodbc.Connection:
        if self.config.driver not in pyodbc.drivers():
            raise RuntimeError(
                f"ODBC driver '{self.config.driver}' is not installed. Installed: {pyodbc.drivers() or 'none'}. "
                "Use the lab Docker image or install 'ODBC Driver 18 for SQL Server'."
            )
        return pyodbc.connect(self.config.connection_string(), autocommit=autocommit,
                              timeout=self.config.login_timeout)

    def new_connection(self, autocommit: bool = True) -> "SqlServer":
        """A separate session (own SPID), e.g. one per worker in a concurrency scenario."""
        return SqlServer(self.config, autocommit=autocommit)

    # --- running SQL -------------------------------------------------------------------------
    def query(self, sql: str, *params: Any) -> list[dict[str, Any]]:
        """Run a statement and return the first result set as a list of dicts."""
        with self.conn.cursor() as cur:
            cur.execute(sql, *params)
            while cur.description is None and cur.nextset():   # skip row counts of earlier statements
                pass
            if cur.description is None:
                return []
            columns = [c[0] for c in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]

    def scalar(self, sql: str, *params: Any) -> Any:
        rows = self.query(sql, *params)
        return next(iter(rows[0].values())) if rows else None

    def exec(self, sql: str, *params: Any) -> int:
        """Run a statement that returns no rows; returns the affected row count (-1 if unknown)."""
        with self.conn.cursor() as cur:
            cur.execute(sql, *params)
            count = cur.rowcount
            while cur.nextset():
                pass
            return count

    def exec_script(self, script: str) -> None:
        for batch in split_batches(script):
            self.exec(batch)

    def exec_file(self, path: str | Path) -> None:
        self.exec_script(Path(path).read_text(encoding="utf-8"))

    def messages(self, sql: str, *params: Any) -> tuple[list[dict[str, Any]], list[str]]:
        """Run a statement and also return the informational messages (PRINT, SET STATISTICS ...)."""
        rows: list[dict[str, Any]] = []
        texts: list[str] = []
        with self.conn.cursor() as cur:
            cur.execute(sql, *params)
            while True:
                texts.extend(m[1] for m in (cur.messages or []))
                if cur.description is not None and not rows:
                    columns = [c[0] for c in cur.description]
                    rows = [dict(zip(columns, r)) for r in cur.fetchall()]
                if not cur.nextset():
                    break
        return rows, texts

    def close(self) -> None:
        try:
            self.conn.close()
        except pyodbc.Error:
            pass

    def __enter__(self) -> "SqlServer":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


class RedisClient:
    """redis-py client with a lab key namespace. Every redis-py command is available directly
    (`client.hset(...)`, `client.pipeline()`, `client.ft(...)`) through attribute delegation."""

    def __init__(self, config: RedisConfig, namespace: str = "core", client_name: str | None = None):
        self.config = config
        self.namespace = namespace
        # client_name is set on every pooled connection (shows up in CLIENT LIST and SLOWLOG).
        self.raw = redis.Redis(host=config.host, port=config.port, password=config.password, db=config.db,
                               decode_responses=True, socket_connect_timeout=5, socket_timeout=30,
                               client_name=client_name)

    @property
    def prefix(self) -> str:
        return f"{LAB_KEY_ROOT}:{self.namespace}:"

    def key(self, *parts: object) -> str:
        """key("story", 12) -> "lab:<namespace>:story:12"."""
        return self.prefix + ":".join(str(p) for p in parts)

    def scoped(self, namespace: str) -> "RedisClient":
        """Same server, another namespace (one per topic)."""
        clone = object.__new__(RedisClient)
        clone.config, clone.namespace, clone.raw = self.config, namespace, self.raw
        return clone

    def new_connection(self, client_name: str | None = None) -> "RedisClient":
        """A client with its own connection pool, e.g. one per worker in a concurrency scenario."""
        return RedisClient(self.config, self.namespace, client_name)

    def iter_keys(self, pattern: str = "*") -> Iterator[str]:
        yield from self.raw.scan_iter(match=self.prefix + pattern, count=1000)

    def cleanup(self) -> int:
        """Delete every key of this namespace (SCAN + UNLINK, never KEYS)."""
        removed = 0
        batch: list[str] = []
        for k in self.iter_keys():
            batch.append(k)
            if len(batch) == 500:
                removed += self.raw.unlink(*batch)
                batch.clear()
        if batch:
            removed += self.raw.unlink(*batch)
        return removed

    def modules(self) -> Sequence[str]:
        return [m["name"] for m in self.raw.module_list()]

    def close(self) -> None:
        self.raw.close()

    def __getattr__(self, name: str) -> Any:
        if name == "raw":                      # not set yet: avoid infinite recursion
            raise AttributeError(name)
        return getattr(self.raw, name)

    def __enter__(self) -> "RedisClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
