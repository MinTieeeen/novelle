"""Which index an execution plan reads and how: the access operators of a showplan XML.

The lab probe (sqlserver_probe) lists every operator; the indexing scenarios need, for each operator that
reads a table or an index: the index name, the columns used to SEEK (Seek Predicate) and the columns only
checked row by row (Residual Predicate), whether it is a Key / RID Lookup, and how many rows it read.

Plain Python (xml.etree only), unit-tested with small hand-written plans (tests/test_plans.py).
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

NS = "{http://schemas.microsoft.com/sqlserver/2004/07/showplan}"


@dataclass
class Access:
    op: str                                   # physical operator; "Key Lookup" for clustered-index lookups
    index: str                                # index name, "" for a heap
    seek_columns: list[str] = field(default_factory=list)
    residual_columns: list[str] = field(default_factory=list)
    actual_rows: float | None = None          # rows handed to the parent (after the residual predicate)
    rows_read: float | None = None            # rows looked at (ActualRowsRead, before the residual predicate)
    executions: float | None = None           # how many times it ran (a lookup runs once per row)

    @property
    def is_lookup(self) -> bool:
        return self.op in ("Key Lookup", "RID Lookup")

    def text(self) -> str:
        parts = [self.op + (f" {self.index}" if self.index else "")]
        if self.seek_columns:
            parts.append("seek: " + ", ".join(self.seek_columns))
        if self.residual_columns:
            parts.append("kiểm tra từng dòng: " + ", ".join(self.residual_columns))
        if self.executions and self.executions > 1:
            parts.append(f"{self.executions:g} lần")
        return " · ".join(parts)


def _sum(relop: ET.Element, attr: str) -> float | None:
    info = relop.find(f"{NS}RunTimeInformation")
    if info is None:
        return None
    values = [float(c.get(attr)) for c in info.findall(f"{NS}RunTimeCountersPerThread") if c.get(attr) is not None]
    return sum(values) if values else None


def _columns(node: ET.Element | None) -> list[str]:
    if node is None:
        return []
    seen: list[str] = []
    for ref in node.iter(f"{NS}ColumnReference"):
        col = ref.get("Column")
        if col and not col.startswith(("Bmk", "Expr", "Uniq")) and col not in seen:
            seen.append(col)
    return seen


def _strip(name: str | None) -> str:
    return (name or "").strip("[]")


def accesses(plan_xml: str) -> list[Access]:
    """Access operators of the first statement, in plan order (root first)."""
    root = ET.fromstring(plan_xml)
    found: list[Access] = []
    for relop in root.iter(f"{NS}RelOp"):
        node = next((c for c in relop if c.tag in (f"{NS}IndexScan", f"{NS}TableScan")), None)
        if node is None:
            continue
        op = relop.get("PhysicalOp", "")
        if node.get("Lookup") == "1" and op != "RID Lookup":
            op = "Key Lookup"
        obj = node.find(f"{NS}Object")
        found.append(Access(op=op, index=_strip(obj.get("Index")) if obj is not None else "",
                            seek_columns=_columns(node.find(f"{NS}SeekPredicates")),
                            residual_columns=_columns(node.find(f"{NS}Predicate")),
                            actual_rows=_sum(relop, "ActualRows"), rows_read=_sum(relop, "ActualRowsRead"),
                            executions=_sum(relop, "ActualExecutions")))
    return found


def uses_index(found: list[Access], name: str) -> bool:
    return any(a.index == name and not a.is_lookup for a in found)


def lookups(found: list[Access]) -> int:
    """Number of Key / RID lookups executed (0 when the index covers the query)."""
    return int(sum((a.executions or 0) for a in found if a.is_lookup))


def rows_read(found: list[Access]) -> int:
    """Rows the access operators looked at, lookups excluded (the work of finding the rows)."""
    return int(sum((a.rows_read if a.rows_read is not None else a.actual_rows or 0)
                   for a in found if not a.is_lookup))


def describe(found: list[Access]) -> str:
    return " → ".join(a.text() for a in found) or "(không đọc bảng / index)"
