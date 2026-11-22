"""SQL text the indexing scenarios generate: index definitions and the timing form of a query.

Plain Python, no database and no lab imports, so it is unit-tested directly (tests/test_ddl.py).

An Index is declared once and created on whichever copy a variant uses:

    COVERING = Index("IX_Status_Rating_Cover", key=("CompletionStatus", "RatingAvg"),
                     include=("Title", "ChapterCount"))
    COVERING.create_sql("lab.indexing__Story_10000")
    # CREATE NONCLUSTERED INDEX [IX_Status_Rating_Cover] ON lab.indexing__Story_10000
    #     ([CompletionStatus], [RatingAvg]) INCLUDE ([Title], [ChapterCount]);
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,120}$")
_KEY = re.compile(r"^(?P<col>[A-Za-z][A-Za-z0-9_]*)(?:\s+(?P<dir>ASC|DESC))?$", re.IGNORECASE)
_TABLE = re.compile(r"^(dbo|lab)\.[A-Za-z][A-Za-z0-9_]*$")


def _table(table: str) -> str:
    if not _TABLE.match(table):
        raise ValueError(f"table must look like lab.Name, got '{table}'")
    return table


@dataclass(frozen=True)
class Index:
    """A nonclustered rowstore index. `key` items are "Column" or "Column DESC"; `where` makes it a
    filtered index and must be a constant predicate written by the scenario author (no parameters)."""
    name: str
    key: tuple[str, ...]
    include: tuple[str, ...] = ()
    where: str | None = None
    unique: bool = False

    def __post_init__(self) -> None:
        if not _NAME.match(self.name):
            raise ValueError(f"invalid index name '{self.name}'")
        if not self.key:
            raise ValueError(f"index {self.name} has no key column")
        for item in self.key:
            if not _KEY.match(item.strip()):
                raise ValueError(f"invalid key column '{item}' in {self.name}")
        for col in self.include:
            if not _NAME.match(col):
                raise ValueError(f"invalid INCLUDE column '{col}' in {self.name}")
        if self.where is not None and (";" in self.where or "--" in self.where):
            raise ValueError(f"filter of {self.name} must be a single predicate")

    @property
    def key_columns(self) -> tuple[str, ...]:
        return tuple(_KEY.match(k.strip()).group("col") for k in self.key)

    def create_sql(self, table: str) -> str:
        keys = []
        for item in self.key:
            m = _KEY.match(item.strip())
            keys.append(f"[{m.group('col')}]" + (f" {m.group('dir').upper()}" if m.group("dir") else ""))
        sql = (f"CREATE {'UNIQUE ' if self.unique else ''}NONCLUSTERED INDEX [{self.name}] ON {_table(table)}\n"
               f"    ({', '.join(keys)})")
        if self.include:
            sql += f" INCLUDE ({', '.join(f'[{c}]' for c in self.include)})"
        if self.where:
            sql += f"\n    WHERE {self.where}"
        return sql + ";"

    def drop_sql(self, table: str) -> str:
        return f"DROP INDEX IF EXISTS [{self.name}] ON {_table(table)};"


def timing_version(sql: str, columns: dict[str, str | tuple[str, str]]) -> str:
    """The same query with its select list assigned to variables (SELECT @c = expr ...), so the server runs
    the same plan without sending rows over the network; used for the timing only (approach of t3).

    columns: alias -> SQL type, or alias -> (expression, SQL type) when the expression is not the alias.
    Only the first SELECT ... FROM is rewritten; ORDER BY / OFFSET stay as they are."""
    if not columns:
        raise ValueError("columns must not be empty")
    cols = {c: (v if isinstance(v, tuple) else (c, v)) for c, v in columns.items()}
    declare = "DECLARE " + ", ".join(f"@{c} {t}" for c, (_, t) in cols.items()) + ";\n"
    assign = ", ".join(f"@{c} = {e}" for c, (e, _) in cols.items())
    rewritten, count = re.subn(_SELECT_LIST, lambda m: f"SELECT {m.group('top') or ''}{assign}\nFROM",
                               sql, count=1)
    if count != 1:
        raise ValueError("query must contain SELECT ... FROM")
    return declare + rewritten


_SELECT_LIST = re.compile(r"SELECT\s+(?P<top>TOP\s*\([^)]*\)\s+)?.*?\s+FROM\b", re.S | re.IGNORECASE)
