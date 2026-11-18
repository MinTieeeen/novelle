"""Unit tests of plans.py on small hand-written showplans (same element names as SQL Server 2019)."""
from topics.t4_indexing import plans

NS = 'xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan"'


def runtime(rows, read=None, executions=1):
    read_attr = f' ActualRowsRead="{read}"' if read is not None else ""
    return (f'<RunTimeInformation><RunTimeCountersPerThread Thread="0" ActualRows="{rows}"{read_attr} '
            f'ActualExecutions="{executions}"/></RunTimeInformation>')


def col(name):
    return f'<ColumnReference Database="[NovelleDB]" Schema="[lab]" Table="[indexing__Story_1000]" Column="{name}"/>'


# Nested Loops( Index Seek IX_Status_Rating (seek on both columns), Key Lookup PK (residual on nothing) )
SEEK_LOOKUP = f"""<ShowPlanXML {NS}><BatchSequence><Batch><Statements><StmtSimple><QueryPlan>
<RelOp NodeId="0" PhysicalOp="Nested Loops" LogicalOp="Inner Join">{runtime(12)}
  <NestedLoops>
    <RelOp NodeId="1" PhysicalOp="Index Seek" LogicalOp="Index Seek">{runtime(12, 12)}
      <IndexScan Ordered="1">
        <Object Database="[NovelleDB]" Schema="[lab]" Table="[indexing__Story_1000]" Index="[IX_Status_Rating]"/>
        <SeekPredicates><SeekPredicateNew><SeekKeys>
          <Prefix ScanType="EQ"><RangeColumns>{col("CompletionStatus")}</RangeColumns></Prefix>
          <StartRange ScanType="GE"><RangeColumns>{col("RatingAvg")}</RangeColumns></StartRange>
        </SeekKeys></SeekPredicateNew></SeekPredicates>
      </IndexScan>
    </RelOp>
    <RelOp NodeId="3" PhysicalOp="Clustered Index Seek" LogicalOp="Clustered Index Seek">{runtime(12, None, 12)}
      <IndexScan Lookup="1" Ordered="1">
        <Object Database="[NovelleDB]" Schema="[lab]" Table="[indexing__Story_1000]" Index="[PK_indexing__Story_1000]"/>
        <SeekPredicates><SeekPredicateNew><SeekKeys><Prefix ScanType="EQ"><RangeColumns>{col("StoryId")}</RangeColumns></Prefix></SeekKeys></SeekPredicateNew></SeekPredicates>
      </IndexScan>
    </RelOp>
  </NestedLoops>
</RelOp></QueryPlan></StmtSimple></Statements></Batch></BatchSequence></ShowPlanXML>"""

# Sort( Table Scan of a heap with a residual predicate ), RID Lookup shape is covered separately
HEAP_SCAN = f"""<ShowPlanXML {NS}><BatchSequence><Batch><Statements><StmtSimple><QueryPlan>
<RelOp NodeId="0" PhysicalOp="Sort" LogicalOp="Sort">{runtime(4)}
  <Sort><RelOp NodeId="1" PhysicalOp="Table Scan" LogicalOp="Table Scan">{runtime(4, 1000)}
    <TableScan><Object Database="[NovelleDB]" Schema="[lab]" Table="[indexing__StoryHeap_1000]"/>
      <Predicate><ScalarOperator>{col("AuthorId")}</ScalarOperator></Predicate>
    </TableScan>
  </RelOp></Sort>
</RelOp></QueryPlan></StmtSimple></Statements></Batch></BatchSequence></ShowPlanXML>"""

RID_LOOKUP = f"""<ShowPlanXML {NS}><BatchSequence><Batch><Statements><StmtSimple><QueryPlan>
<RelOp NodeId="2" PhysicalOp="RID Lookup" LogicalOp="RID Lookup">{runtime(4, None, 4)}
  <IndexScan Lookup="1"><Object Database="[NovelleDB]" Schema="[lab]" Table="[indexing__StoryHeap_1000]"/>
    <SeekPredicates><SeekPredicateNew><SeekKeys><Prefix ScanType="EQ"><RangeColumns>
      <ColumnReference Column="Bmk1000"/></RangeColumns></Prefix></SeekKeys></SeekPredicateNew></SeekPredicates>
  </IndexScan>
</RelOp></QueryPlan></StmtSimple></Statements></Batch></BatchSequence></ShowPlanXML>"""


def test_index_seek_with_key_lookup():
    found = plans.accesses(SEEK_LOOKUP)
    assert [a.op for a in found] == ["Index Seek", "Key Lookup"]
    seek, lookup = found
    assert seek.index == "IX_Status_Rating"
    assert seek.seek_columns == ["CompletionStatus", "RatingAvg"]
    assert seek.residual_columns == []
    assert lookup.index == "PK_indexing__Story_1000" and lookup.is_lookup
    assert plans.lookups(found) == 12
    assert plans.rows_read(found) == 12
    assert plans.uses_index(found, "IX_Status_Rating")
    assert not plans.uses_index(found, "PK_indexing__Story_1000")      # only as a lookup
    assert plans.describe(found) == ("Index Seek IX_Status_Rating · seek: CompletionStatus, RatingAvg → "
                                     "Key Lookup PK_indexing__Story_1000 · seek: StoryId · 12 lần")


def test_heap_scan_with_residual_predicate():
    (scan,) = plans.accesses(HEAP_SCAN)
    assert scan.op == "Table Scan" and scan.index == ""
    assert scan.residual_columns == ["AuthorId"]
    assert scan.rows_read == 1000 and scan.actual_rows == 4
    assert plans.rows_read([scan]) == 1000


def test_rid_lookup_and_bookmark_columns_are_ignored():
    (rid,) = plans.accesses(RID_LOOKUP)
    assert rid.op == "RID Lookup" and rid.is_lookup
    assert rid.seek_columns == []                         # Bmk1000 is the row locator, not a column
    assert plans.lookups([rid]) == 4


def test_no_access_operator():
    xml = f'<ShowPlanXML {NS}><BatchSequence/></ShowPlanXML>'
    assert plans.accesses(xml) == []
    assert plans.describe([]) == "(không đọc bảng / index)"
