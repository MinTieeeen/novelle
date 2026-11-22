"""Unit tests of ddl.py (index DDL and the timing form of a query)."""
import pytest

from topics.t4_indexing.ddl import Index, timing_version

T = "lab.indexing__Story_1000"


def test_plain_index():
    assert Index("IX_Author", key=("AuthorId",)).create_sql(T) == \
        "CREATE NONCLUSTERED INDEX [IX_Author] ON lab.indexing__Story_1000\n    ([AuthorId]);"


def test_composite_covering_filtered_unique():
    idx = Index("IX_Pub", key=("LastChapterAt DESC", "StoryId desc"), include=("Title", "ChapterCount"),
                where="PublishStatus = 'PUBLISHED' AND IsDeleted = 0", unique=True)
    assert idx.create_sql(T) == (
        "CREATE UNIQUE NONCLUSTERED INDEX [IX_Pub] ON lab.indexing__Story_1000\n"
        "    ([LastChapterAt] DESC, [StoryId] DESC) INCLUDE ([Title], [ChapterCount])\n"
        "    WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0;")
    assert idx.key_columns == ("LastChapterAt", "StoryId")


def test_drop():
    assert Index("IX_A", key=("A",)).drop_sql(T) == "DROP INDEX IF EXISTS [IX_A] ON lab.indexing__Story_1000;"


@pytest.mark.parametrize("kwargs", [
    {"name": "IX bad", "key": ("A",)},
    {"name": "IX_A", "key": ()},
    {"name": "IX_A", "key": ("A; DROP TABLE x",)},
    {"name": "IX_A", "key": ("A",), "include": ("B C",)},
    {"name": "IX_A", "key": ("A",), "where": "A = 1; DROP TABLE x"},
])
def test_invalid_definitions_are_rejected(kwargs):
    with pytest.raises(ValueError):
        Index(**kwargs)


def test_table_name_is_checked():
    with pytest.raises(ValueError):
        Index("IX_A", key=("A",)).create_sql("lab.x; DROP TABLE y")


def test_timing_version_assigns_to_variables():
    sql = "SELECT StoryId, Title FROM lab.t WHERE AuthorId = ? ORDER BY StoryId"
    assert timing_version(sql, {"StoryId": "INT", "Title": "NVARCHAR(300)"}) == (
        "DECLARE @StoryId INT, @Title NVARCHAR(300);\n"
        "SELECT @StoryId = StoryId, @Title = Title\nFROM lab.t WHERE AuthorId = ? ORDER BY StoryId")


def test_timing_version_keeps_top_and_expressions():
    sql = "SELECT TOP (20) s.StoryId, LEFT(s.Title, 10) AS T\nFROM lab.t s ORDER BY s.StoryId DESC"
    out = timing_version(sql, {"StoryId": ("s.StoryId", "INT"), "T": ("LEFT(s.Title, 10)", "NVARCHAR(10)")})
    assert out.splitlines()[1] == "SELECT TOP (20) @StoryId = s.StoryId, @T = LEFT(s.Title, 10)"
    assert out.endswith("FROM lab.t s ORDER BY s.StoryId DESC")


def test_timing_version_rewrites_only_the_first_select():
    sql = "SELECT StoryId FROM lab.t WHERE StoryId IN (SELECT StoryId FROM lab.u)"
    out = timing_version(sql, {"StoryId": "INT"})
    assert out.count("@StoryId") == 2                     # DECLARE + the outer select
    assert "(SELECT StoryId FROM lab.u)" in out


def test_timing_version_needs_a_select():
    with pytest.raises(ValueError):
        timing_version("UPDATE lab.t SET A = 1", {"A": "INT"})
