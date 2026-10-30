import shutil
from pathlib import Path

import pyodbc
import pytest

from lab import maintenance
from lab.connections import sql_error_number
from lab.framework import fixtures, registry
from lab.framework.concurrency import run_workers
from lab.framework.registry import TOPICS_DIR
from lab.framework.sqlserver_probe import clean_message, parse_io, parse_plan, parse_time

# Messages exactly as pyodbc returns them from RDS (SQL Server 2019).
IO_MSG = ("[Microsoft][ODBC Driver 18 for SQL Server][SQL Server]Table 'Chapter'. Scan count 1, logical reads 61, "
          "physical reads 1, page server reads 0, read-ahead reads 19, page server read-ahead reads 0, "
          "lob logical reads 4, lob physical reads 0, lob page server reads 0, lob read-ahead reads 0.")
TIME_MSGS = ["SQL Server parse and compile time: \n   CPU time = 3 ms, elapsed time = 5 ms.",
             "\n SQL Server Execution Times:\n   CPU time = 0 ms,  elapsed time = 40 ms.",
             "\n SQL Server Execution Times:\n   CPU time = 16 ms,  elapsed time = 1 ms."]

PLAN = """<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan"><BatchSequence><Batch><Statements>
<StmtSimple StatementText="SELECT TOP (10) ..." StatementSubTreeCost="0.0421"><QueryPlan>
 <MissingIndexes><MissingIndexGroup Impact="87.5"><MissingIndex Database="[NovelleDB]" Schema="[dbo]" Table="[Story]">
   <ColumnGroup Usage="INEQUALITY"><Column Name="[RatingAvg]"/></ColumnGroup></MissingIndex></MissingIndexGroup></MissingIndexes>
 <RelOp NodeId="0" PhysicalOp="Sort" LogicalOp="TopN Sort" EstimateRows="10" EstimatedTotalSubtreeCost="0.0421">
  <RunTimeInformation><RunTimeCountersPerThread Thread="0" ActualRows="10"/></RunTimeInformation>
  <TopSort Rows="10">
   <RelOp NodeId="1" PhysicalOp="Clustered Index Scan" LogicalOp="Clustered Index Scan" EstimateRows="150"
          EstimatedTotalSubtreeCost="0.0102">
    <RunTimeInformation><RunTimeCountersPerThread Thread="0" ActualRows="150" ActualLogicalReads="46"/></RunTimeInformation>
    <IndexScan><Object Database="[NovelleDB]" Schema="[dbo]" Table="[Story]" Index="[PK_Story]"/></IndexScan>
   </RelOp>
  </TopSort>
 </RelOp>
</QueryPlan></StmtSimple></Statements></Batch></BatchSequence></ShowPlanXML>"""


def test_statistics_io_and_time_are_parsed():
    io = parse_io([clean_message(IO_MSG)])
    assert len(io) == 1
    assert (io[0].table, io[0].logical_reads, io[0].physical_reads, io[0].read_ahead_reads,
            io[0].lob_logical_reads) == ("Chapter", 61, 1, 19, 4)
    assert parse_time(TIME_MSGS) == (16, 3)
    assert clean_message(IO_MSG).startswith("Table 'Chapter'")


def test_showplan_operators_tree_and_missing_index():
    [plan] = parse_plan(PLAN)
    assert plan.physical_ops() == ["Sort", "Clustered Index Scan"]
    scan = plan.operators[1]
    assert (scan.depth, scan.object, scan.actual_rows, scan.actual_logical_reads) == (1, "[Story].[PK_Story]", 150, 46)
    assert plan.operators[0].actual_logical_reads is None
    assert plan.missing_indexes == ["[Story] impact 87.5%: INEQUALITY [RatingAvg]"]
    assert "Clustered Index Scan [Story].[PK_Story]" in plan.text()


def test_sql_error_number_from_pyodbc_error():
    exc = pyodbc.Error("40001", "[40001] [Microsoft][ODBC Driver 18 for SQL Server][SQL Server]Transaction "
                                "(Process ID 57) was deadlocked on lock resources ... Rerun the transaction. (1205) "
                                "(SQLExecDirectW)")
    assert sql_error_number(exc) == 1205
    assert sql_error_number(ValueError("(1205) (SQLExecDirectW)")) is None


def test_sandbox_names_are_validated():
    assert fixtures.sandbox_name("indexing", "Story") == "lab.indexing__Story"
    for bad in ("Story; DROP TABLE x", "1abc", "a-b"):
        with pytest.raises(ValueError):
            fixtures.sandbox_name("indexing", bad)


def test_run_workers_starts_together_and_collects_errors():
    seen = []

    def fn(worker, iteration):
        seen.append(worker.index)
        if worker.index == 2 and iteration == 1:
            raise RuntimeError("conflict")
        return iteration

    r = run_workers(4, fn, iterations=3)
    assert (r.calls, r.succeeded, len(r.errors)) == (12, 11, 1)
    assert r.errors[0].worker == 2 and r.errors[0].iteration == 1 and r.error_counts() == {"RuntimeError": 1}
    assert r.results[2] == [0, None, 2] and r.count(0) == 4
    assert sorted(set(seen)) == [0, 1, 2, 3]


def test_scaffold_creates_a_discoverable_topic(tmp_path: Path):
    topics = tmp_path / "scaffold_topics"
    topics.mkdir()
    (topics / "__init__.py").write_text("")
    shutil.copytree(TOPICS_DIR / "_template", topics / "_template")

    target = maintenance.scaffold("t5_concurrency", owner="Nguyễn Văn A", title="Concurrency control",
                                  topics_dir=topics)
    text = (target / "__init__.py").read_text(encoding="utf-8")
    assert 'id="concurrency"' in text and 'owner="Nguyễn Văn A"' in text and "__TOPIC_ID__" not in text
    assert "lab.concurrency__Story" in (target / "sqlserver.py").read_text(encoding="utf-8")

    [topic] = registry.discover(topics)
    assert topic.meta.id == "concurrency" and {s.dbms for s in topic.scenarios} == {"sqlserver", "redis"}

    with pytest.raises(FileExistsError):
        maintenance.scaffold("t5_concurrency", owner="B", topics_dir=topics)
    with pytest.raises(ValueError):
        maintenance.scaffold("concurrency", owner="B", topics_dir=topics)
