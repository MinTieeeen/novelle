"""Looks inside SQL Server while a statement runs: I/O per table, CPU, the actual execution plan, locks.

inspect(db, sql, *params) runs the statement ONCE with
    SET STATISTICS IO, TIME ON;  SET STATISTICS XML ON;
and returns
    io        logical / physical / read-ahead / LOB reads per table   (STATISTICS IO messages)
    cpu_ms    CPU time of the execution, ms resolution                  (STATISTICS TIME messages)
    plan      operators of the actual plan with estimated vs actual rows, the index each one touches,
              per-operator logical reads, warnings and missing-index suggestions (showplan XML)
These are diagnostics. The timing used for comparisons is bench.bench_sql (server_ms).
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any

from lab.connections import SqlServer

SHOWPLAN_NS = {"p": "http://schemas.microsoft.com/sqlserver/2004/07/showplan"}
_DRIVER_PREFIX = re.compile(r"^(\[[^\]]*\])+")
_IO_LINE = re.compile(r"Table '(?P<table>[^']+)'\. Scan count (?P<scan>\d+), logical reads (?P<logical>\d+), "
                      r"physical reads (?P<physical>\d+).*?read-ahead reads (?P<readahead>\d+)"
                      r"(?:.*?lob logical reads (?P<lob>\d+))?")
_TIME_BLOCK = re.compile(r"(?P<kind>parse and compile time|Execution Times):\s*CPU time = (?P<cpu>\d+) ms,"
                         r"\s*elapsed time = (?P<elapsed>\d+) ms", re.S)


@dataclass
class TableIO:
    table: str
    scan_count: int
    logical_reads: int
    physical_reads: int
    read_ahead_reads: int
    lob_logical_reads: int


@dataclass
class PlanOperator:
    node_id: int
    depth: int
    physical_op: str
    logical_op: str
    object: str                 # [Table].[Index] the operator reads, "" if none
    estimated_rows: float
    actual_rows: float | None
    actual_logical_reads: float | None
    estimated_cost: float

    def line(self) -> str:
        actual = "?" if self.actual_rows is None else f"{self.actual_rows:g}"
        reads = "" if self.actual_logical_reads is None else f", reads {self.actual_logical_reads:g}"
        target = f" {self.object}" if self.object else ""
        return (f"{'  ' * self.depth}{self.physical_op}{target}  "
                f"(est {self.estimated_rows:g}, actual {actual}{reads}, cost {self.estimated_cost:.4f})")


@dataclass
class PlanSummary:
    statement: str
    total_cost: float
    operators: list[PlanOperator] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    missing_indexes: list[str] = field(default_factory=list)

    def text(self) -> str:
        lines = [f"Statement cost {self.total_cost:.4f}: {self.statement[:200]}"]
        lines += [op.line() for op in self.operators]
        lines += [f"WARNING {w}" for w in self.warnings]
        lines += [f"MISSING INDEX {m}" for m in self.missing_indexes]
        return "\n".join(lines)

    def physical_ops(self) -> list[str]:
        return [op.physical_op for op in self.operators]


@dataclass
class Inspection:
    rows: int                               # rows returned by the statement
    io: list[TableIO]
    cpu_ms: int | None
    compile_cpu_ms: int | None
    plans: list[PlanSummary]
    plan_xml: list[str]
    messages: list[str]

    @property
    def logical_reads(self) -> int:
        return sum(t.logical_reads + t.lob_logical_reads for t in self.io)

    @property
    def plan(self) -> PlanSummary | None:
        return self.plans[0] if self.plans else None


# --- parsing ----------------------------------------------------------------------------------------
def clean_message(text: str) -> str:
    return _DRIVER_PREFIX.sub("", text).strip()


def parse_io(messages: list[str]) -> list[TableIO]:
    out = []
    for text in messages:
        for m in _IO_LINE.finditer(text):
            out.append(TableIO(table=m["table"], scan_count=int(m["scan"]), logical_reads=int(m["logical"]),
                               physical_reads=int(m["physical"]), read_ahead_reads=int(m["readahead"]),
                               lob_logical_reads=int(m["lob"] or 0)))
    return out


def parse_time(messages: list[str]) -> tuple[int | None, int | None]:
    """(execution CPU ms, parse-and-compile CPU ms), summed over the statements of the batch."""
    exec_cpu = compile_cpu = None
    for m in _TIME_BLOCK.finditer("\n".join(messages)):
        cpu = int(m["cpu"])
        if m["kind"].startswith("parse"):
            compile_cpu = (compile_cpu or 0) + cpu
        else:
            exec_cpu = (exec_cpu or 0) + cpu
    return exec_cpu, compile_cpu


def _operator_object(relop: ET.Element) -> str:
    # The operator-specific element (IndexScan, Update, ...) is a direct child of RelOp; its own
    # <Object> children name the table/index. Nested RelOps are deeper and are not looked at here.
    for child in relop:
        for obj in child.findall("p:Object", SHOWPLAN_NS):
            parts = [obj.get("Table"), obj.get("Index")]
            return ".".join(p for p in parts if p)
    return ""


def _actual(relop: ET.Element, attr: str) -> float | None:
    counters = relop.findall("p:RunTimeInformation/p:RunTimeCountersPerThread", SHOWPLAN_NS)
    values = [float(c.get(attr)) for c in counters if c.get(attr) is not None]
    return sum(values) if values else None


def parse_plan(xml_text: str) -> list[PlanSummary]:
    root = ET.fromstring(xml_text)
    summaries = []
    for stmt in root.iter(f"{{{SHOWPLAN_NS['p']}}}StmtSimple"):
        summary = PlanSummary(statement=stmt.get("StatementText", "").strip(),
                              total_cost=float(stmt.get("StatementSubTreeCost", 0)))

        def walk(relop: ET.Element, depth: int) -> None:
            summary.operators.append(PlanOperator(
                node_id=int(relop.get("NodeId", -1)), depth=depth,
                physical_op=relop.get("PhysicalOp", ""), logical_op=relop.get("LogicalOp", ""),
                object=_operator_object(relop), estimated_rows=float(relop.get("EstimateRows", 0)),
                actual_rows=_actual(relop, "ActualRows"),
                actual_logical_reads=_actual(relop, "ActualLogicalReads"),
                estimated_cost=float(relop.get("EstimatedTotalSubtreeCost", 0))))
            for child in _child_relops(relop):
                walk(child, depth + 1)

        query_plan = stmt.find("p:QueryPlan", SHOWPLAN_NS)
        if query_plan is not None:
            top = query_plan.find("p:RelOp", SHOWPLAN_NS)
            if top is not None:
                walk(top, 0)
            for w in query_plan.iter(f"{{{SHOWPLAN_NS['p']}}}Warnings"):
                summary.warnings += [_local(e.tag) + "".join(f" {k}={v}" for k, v in e.attrib.items()) for e in w]
                summary.warnings += [f"{k}={v}" for k, v in w.attrib.items()]
            for group in query_plan.iter(f"{{{SHOWPLAN_NS['p']}}}MissingIndexGroup"):
                for mi in group.findall("p:MissingIndex", SHOWPLAN_NS):
                    cols = {cg.get("Usage"): [c.get("Name") for c in cg.findall("p:Column", SHOWPLAN_NS)]
                            for cg in mi.findall("p:ColumnGroup", SHOWPLAN_NS)}
                    summary.missing_indexes.append(
                        f"{mi.get('Table')} impact {group.get('Impact')}%: "
                        + "; ".join(f"{k} {', '.join(v)}" for k, v in cols.items()))
        summaries.append(summary)
    return summaries


def _local(tag: str) -> str:
    return tag.split("}", 1)[-1]


def _child_relops(relop: ET.Element):
    """RelOps directly under `relop`: the first RelOp met on each path, without crossing another one."""
    def find(node: ET.Element):
        for child in node:
            if _local(child.tag) == "RelOp":
                yield child
            else:
                yield from find(child)
    yield from find(relop)


# --- running ----------------------------------------------------------------------------------------
def inspect(db: SqlServer, sql: str, *params: Any, plan: bool = True) -> Inspection:
    """Run `sql` once with STATISTICS IO/TIME (and the actual plan) and collect everything."""
    batch = ("SET STATISTICS IO, TIME ON;\n" + ("SET STATISTICS XML ON;\n" if plan else "")
             + f"{sql.strip().rstrip(';')};\n"
             + ("SET STATISTICS XML OFF;\n" if plan else "") + "SET STATISTICS IO, TIME OFF;")
    messages: list[str] = []
    xml_plans: list[str] = []
    rows = 0
    with db.conn.cursor() as cur:
        cur.execute(batch, *params)
        while True:
            messages += [clean_message(m[1]) for m in (cur.messages or [])]
            if cur.description is not None:
                name = cur.description[0][0]
                data = cur.fetchall()
                if "Showplan" in name:
                    xml_plans += [str(r[0]) for r in data]
                else:
                    rows += len(data)
            if not cur.nextset():
                break
        messages += [clean_message(m[1]) for m in (cur.messages or [])]
    cpu, compile_cpu = parse_time(messages)
    plans = [s for x in xml_plans for s in parse_plan(x)]
    return Inspection(rows=rows, io=parse_io(messages), cpu_ms=cpu, compile_cpu_ms=compile_cpu,
                      plans=plans, plan_xml=xml_plans, messages=messages)


def session_id(db: SqlServer) -> int:
    return int(db.scalar("SELECT @@SPID"))


def locks(db: SqlServer, session_ids: list[int] | None = None) -> list[dict[str, Any]]:
    """Locks currently held or requested in this database (sys.dm_tran_locks). Seeing other sessions
    needs VIEW SERVER STATE; without it the query fails and this returns []."""
    sql = ("SELECT l.request_session_id AS session_id, l.resource_type, l.request_mode, l.request_status, "
           "OBJECT_NAME(p.object_id) AS object_name, l.resource_description "
           "FROM sys.dm_tran_locks l LEFT JOIN sys.partitions p ON p.hobt_id = l.resource_associated_entity_id "
           "WHERE l.resource_database_id = DB_ID() AND l.resource_type <> 'DATABASE'")
    try:
        rows = db.query(sql)
    except Exception:
        return []
    return [r for r in rows if session_ids is None or r["session_id"] in session_ids]


def waiting_tasks(db: SqlServer) -> list[dict[str, Any]]:
    """Sessions currently blocked and by whom (sys.dm_os_waiting_tasks); [] without permission."""
    try:
        return db.query("SELECT session_id, blocking_session_id, wait_type, wait_duration_ms, resource_description "
                        "FROM sys.dm_os_waiting_tasks WHERE blocking_session_id IS NOT NULL")
    except Exception:
        return []
