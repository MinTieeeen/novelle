"""Reading execution plans in plain words.

The lab's probe gives the operators of a plan; this module also reads, from the plan XML, which
conditions an operator uses to seek in an index (Seek Predicate) and which it only checks row by row
(Residual Predicate), and how many rows each operator really read.
"""
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

NS = "{http://schemas.microsoft.com/sqlserver/2004/07/showplan}"
HIDDEN_OPS = {"Compute Scalar", "Constant Scan"}       # bookkeeping operators, not part of the access path
SCAN_TYPES = {"EQ": "=", "GE": ">=", "GT": ">", "LE": "<=", "LT": "<"}


@dataclass
class Step:
    """One operator of the plan, root first."""
    op: str                                  # physical operator, Key Lookup named as such
    logical: str = ""                        # logical operator, e.g. Inner Join, Aggregate, TopN Sort
    depth: int = 0                           # depth in the plan tree (root = 0)
    table: str = ""                          # table it reads, sandbox suffixes removed (Story, Author ...)
    index: str = ""                          # index it reads, "" if none
    seek: list[str] = field(default_factory=list)       # Seek Predicates
    residual: list[str] = field(default_factory=list)   # Residual Predicates
    actual_rows: float | None = None         # rows the operator handed up (after its residual predicate)
    rows_read: float | None = None           # rows it looked at (ActualRowsRead, before the residual)
    executions: float | None = None          # how many times the operator ran (ActualExecutions)
    estimated_rows: float = 0.0


def _clean(text: str, params: dict[str, str]) -> str:
    text = re.sub(r"(\[[^\]]+\]\.){1,3}(?=\[)", "", text)           # [db].[schema].[table].[col] -> [col]
    text = re.sub(r"\[([A-Za-z_][A-Za-z0-9_]*)\]", r"\1", text)      # [col] -> col
    for name, value in params.items():
        text = re.sub(rf"\[?{re.escape(name)}\b\]?", value, text)
    return text.replace("CONVERT_IMPLICIT", "CONVERT")


def _seek_text(seek_predicates: ET.Element, params: dict[str, str]) -> list[str]:
    out = []
    for keys in seek_predicates.iter(f"{NS}SeekKeys"):
        for rng in keys:                                                 # Prefix / StartRange / EndRange
            cols = [c.get("Column") for c in rng.find(f"{NS}RangeColumns").iter(f"{NS}ColumnReference")]
            exprs = [e.get("ScalarString", "?") for e in rng.find(f"{NS}RangeExpressions")
                     .findall(f"{NS}ScalarOperator")]
            sign = SCAN_TYPES.get(rng.get("ScanType", "EQ"), rng.get("ScanType", "="))
            out += [f"{c} {sign} {_clean(e, params)}" for c, e in zip(cols, exprs)]
    return out


def _actual(relop: ET.Element, attr: str) -> float | None:
    counters = relop.findall(f"{NS}RunTimeInformation/{NS}RunTimeCountersPerThread")
    values = [float(c.get(attr)) for c in counters if c.get(attr) is not None]
    return sum(values) if values else None


def steps(plan_xml: str, params: dict[str, str] | None = None) -> list[Step]:
    """Operators of the first statement, root first, with their predicates."""
    params = params or {}
    root = ET.fromstring(plan_xml)
    top = next(root.iter(f"{NS}QueryPlan")).find(f"{NS}RelOp")
    out: list[Step] = []

    def walk(relop: ET.Element, depth: int) -> None:
        op = relop.get("PhysicalOp", "")
        step = Step(op=op, logical=relop.get("LogicalOp", ""), depth=depth,
                    actual_rows=_actual(relop, "ActualRows"),
                    rows_read=_actual(relop, "ActualRowsRead"),
                    executions=_actual(relop, "ActualExecutions"),
                    estimated_rows=float(relop.get("EstimateRows", 0)))
        for child in relop:                              # the operator element: IndexScan, Filter, Top ...
            if child.tag == f"{NS}RunTimeInformation" or child.tag == f"{NS}OutputList":
                continue
            obj = child.find(f"{NS}Object")
            if obj is not None:
                step.table = _table(obj.get("Table", ""))
                step.index = (obj.get("Index") or "").strip("[]")
            if child.get("Lookup") in ("1", "true"):
                step.op = "Key Lookup"
            seek = child.find(f"{NS}SeekPredicates")
            if seek is not None:
                step.seek = _seek_text(seek, params)
            pred = child.find(f"{NS}Predicate/{NS}ScalarOperator")
            if pred is not None:
                step.residual = [_clean(pred.get("ScalarString", ""), params)]
        if step.op not in HIDDEN_OPS:
            out.append(step)
        for child in _child_relops(relop):
            walk(child, depth + 1)

    walk(top, 0)
    # Some versions do not mark a key lookup with Lookup="1": a Clustered Index Seek on a table that a
    # nonclustered Index Seek of the same plan also reads is the lookup of that seek's rows.
    seek_tables = {s.table for s in out if s.op == "Index Seek"}
    for s in out:
        if s.op == "Clustered Index Seek" and s.table in seek_tables:
            s.op = "Key Lookup"
    return out


def _table(name: str) -> str:
    """[query_processing__Story_10000] -> Story; [Genre] -> Genre."""
    name = name.strip("[]")
    name = re.sub(r"^query_processing__", "", name)
    return re.sub(r"_\d+$", "", name)


def children(plan: list[Step], i: int) -> list[list[Step]]:
    """The input subtrees of plan[i] (each a list of steps), in plan order."""
    d, sub = plan[i].depth, []
    for s in plan[i + 1:]:
        if s.depth <= d:
            break
        sub.append(s)
    groups: list[list[Step]] = []
    for s in sub:
        if not groups or s.depth <= groups[-1][0].depth:
            groups.append([s])
        else:
            groups[-1].append(s)
    return groups


def joins(plan: list[Step]) -> list[str]:
    """Each join of the plan in plain words, deepest first, e.g. "Nested Loops: Genre với StoryGenre"."""
    out = []
    for i, s in enumerate(plan):
        if "Join" not in s.logical or s.op not in ("Nested Loops", "Hash Match", "Merge Join"):
            continue
        sides = []
        for group in children(plan, i):
            names = list(dict.fromkeys(x.table for x in group if x.table and x.op != "Key Lookup"))
            sides.append(" + ".join(names) or group[0].op)          # e.g. a Table Spool (worktable)
        rows = "" if s.actual_rows is None else f", {s.actual_rows:.0f} dòng ra"
        out.append(f"{s.op} ({' với '.join(sides)}{rows})")
    return list(reversed(out))


def _child_relops(relop: ET.Element):
    for child in relop:
        if child.tag == f"{NS}RelOp":
            yield child
        else:
            yield from _child_relops(child)


def shape(plan: list[Step]) -> str:
    """One line, root first, e.g. "Top → Nested Loops → Index Seek[IX_Story_RatingAvg] → Key Lookup"."""
    return " → ".join(f"{s.op}[{s.index}]" if s.index and s.op != "Key Lookup" else s.op for s in plan)


def access(plan: list[Step]) -> str:
    """How the rows are found, in plain words."""
    ops = [s.op for s in plan]
    seek = next((s for s in plan if s.op == "Index Seek"), None)
    if seek:
        text = f"tra index {seek.index}"
        if "Key Lookup" in ops:
            text += ", rồi lấy thêm thông tin từng truyện (Index Seek + Key Lookup)"
        else:
            text += " (Index Seek)"
        return text
    scan = next((s for s in plan if s.op == "Index Scan"), None)
    if scan:
        return f"quét index {scan.index} (Index Scan)"
    return "quét cả bảng (Clustered Index Scan)"


def seek_predicates(plan: list[Step]) -> list[str]:
    # A Key Lookup seeks by the primary key of the row it was handed (StoryId = StoryId): that is how the
    # lookup works, not a condition of the query.
    return [p for s in plan if s.op != "Key Lookup" for p in s.seek]


def residual_predicates(plan: list[Step]) -> list[str]:
    return [p for s in plan for p in s.residual]


def rows_read(plan: list[Step]) -> float:
    """Rows the table / index operator looked at, before any residual check."""
    reads = [s for s in plan if s.index and s.op != "Key Lookup"]
    if not reads:
        return 0
    s = reads[-1]
    return s.rows_read if s.rows_read is not None else (s.actual_rows or 0)


def aggregates(plan: list[Step]) -> list[Step]:
    """Operators that compute an aggregate (AVG, COUNT ...): Stream Aggregate, or Hash Match as Aggregate."""
    return [s for s in plan if s.logical in ("Aggregate", "Partial Aggregate")
            or s.op == "Stream Aggregate"]
