"""Shared test data, so scenarios never change the application's tables.

SQL Server sandbox   Schema `lab` in NovelleDB. ctx.sandbox_table("Story") copies dbo.Story into
                     lab.<topic>__Story (SELECT INTO, so no indexes, constraints or triggers are copied;
                     a clustered primary key can be added). After the topic the runner drops every
                     lab.<topic>__* table unless `lab run --keep` is used. `lab clean` does the same.
Redis                load_hashes / load_json copy rows into keys of the topic namespace (lab:<topic>:...),
                     which the runner deletes after the topic.
"""
from __future__ import annotations

import json
import re
from decimal import Decimal
from typing import Any, Iterable

from lab.connections import RedisClient, SqlServer

SCHEMA = "lab"
_IDENT = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,100}$")
_SOURCE = re.compile(r"^(dbo|lab)\.(\[[A-Za-z0-9_]+\]|[A-Za-z][A-Za-z0-9_]*)$")


def _ident(name: str, what: str) -> str:
    if not _IDENT.match(name):
        raise ValueError(f"invalid {what} '{name}': letters, digits and _ only, starting with a letter")
    return name


def sandbox_name(topic: str, name: str) -> str:
    """lab.<topic>__<name>, e.g. lab.indexing__Story."""
    return f"{SCHEMA}.{_ident(topic, 'topic id')}__{_ident(name, 'table name')}"


def ensure_schema(db: SqlServer) -> None:
    db.exec(f"IF SCHEMA_ID(N'{SCHEMA}') IS NULL EXEC (N'CREATE SCHEMA {SCHEMA} AUTHORIZATION dbo');")


def copy_table(db: SqlServer, topic: str, name: str, source: str, *, where: str | None = None,
               top: int | None = None, primary_key: Iterable[str] | None = None) -> str:
    """Create (or recreate) lab.<topic>__<name> as a copy of `source` and return its name.
    `where` is a SQL condition written by the scenario author, e.g. "PublishStatus = 'PUBLISHED'"."""
    if not _SOURCE.match(source):
        raise ValueError(f"source must look like dbo.Table or dbo.[Table], got '{source}'")
    table = sandbox_name(topic, name)
    ensure_schema(db)
    db.exec(f"DROP TABLE IF EXISTS {table};")
    db.exec(f"SELECT {f'TOP ({int(top)}) ' if top else ''}* INTO {table} FROM {source}"
            + (f" WHERE {where}" if where else "") + ";")
    if primary_key:
        cols = ", ".join(f"[{_ident(c, 'column')}]" for c in primary_key)
        db.exec(f"ALTER TABLE {table} ADD CONSTRAINT [PK_{topic}__{name}] PRIMARY KEY CLUSTERED ({cols});")
    return table


def topic_tables(db: SqlServer, topic: str | None = None) -> list[str]:
    """Sandbox tables of a topic (or all of them when topic is None)."""
    rows = db.query("SELECT t.name FROM sys.tables t WHERE t.schema_id = SCHEMA_ID(?)", SCHEMA)
    prefix = f"{topic}__" if topic else ""
    return [f"{SCHEMA}.{r['name']}" for r in rows if r["name"].startswith(prefix)]


def drop_topic_tables(db: SqlServer, topic: str | None = None) -> list[str]:
    dropped = []
    for table in topic_tables(db, topic):
        schema, name = table.split(".", 1)
        db.exec(f"DROP TABLE IF EXISTS [{schema}].[{name}];")
        dropped.append(table)
    return dropped


# --- Redis --------------------------------------------------------------------------------------------
def _plain(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray)):
        return value.hex()
    return value


def load_hashes(client: RedisClient, rows: list[dict[str, Any]], kind: str, id_field: str) -> int:
    """One Hash per row at lab:<topic>:<kind>:<id>. NULL becomes an empty string. Returns rows loaded."""
    pipe = client.raw.pipeline(transaction=False)
    for row in rows:
        mapping = {k: "" if v is None else str(_plain(v)) for k, v in row.items()}
        pipe.hset(client.key(kind, row[id_field]), mapping=mapping)
    pipe.execute()
    return len(rows)


def load_json(client: RedisClient, rows: list[dict[str, Any]], kind: str, id_field: str) -> int:
    """One RedisJSON document per row at lab:<topic>:<kind>:<id>."""
    pipe = client.raw.pipeline(transaction=False)
    for row in rows:
        doc = {k: _plain(v) for k, v in row.items()}
        pipe.execute_command("JSON.SET", client.key(kind, row[id_field]), "$", json.dumps(doc, ensure_ascii=False))
    pipe.execute()
    return len(rows)


def load_strings(client: RedisClient, rows: list[dict[str, Any]], kind: str, id_field: str) -> int:
    """One String holding the row as JSON text at lab:<topic>:<kind>:<id> (the cache-aside layout)."""
    pipe = client.raw.pipeline(transaction=False)
    for row in rows:
        pipe.set(client.key(kind, row[id_field]), json.dumps({k: _plain(v) for k, v in row.items()},
                                                             ensure_ascii=False))
    pipe.execute()
    return len(rows)
