"""Unit tests of redisidx.py (application-kept secondary indexes, FT.INFO parsing)."""
from datetime import datetime
from decimal import Decimal

import pytest

from topics.t4_indexing import copies, redisidx


def row(story_id=42, *, status="PUBLISHED", deleted=False, last=datetime(2026, 10, 1)):
    return {"StoryId": story_id, "AuthorId": 7, "Slug": "kiem-hiep", "CompletionStatus": "COMPLETED",
            "RatingAvg": Decimal("4.25"), "ViewCount": 900, "LastChapterAt": last,
            "PublishStatus": status, "IsDeleted": deleted}


def test_entries_of_a_public_story():
    by_kind = {e.kind: e for e in redisidx.entries(row())}
    assert set(by_kind) == set(redisidx.KINDS)
    assert by_kind["slug"].key == ("slug", "kiem-hiep") and by_kind["slug"].member == "42"
    assert by_kind["author"].key == ("author", "7") and by_kind["author"].member == "00000042"
    assert by_kind["by_rating_status"].key == ("by_rating", "COMPLETED") and by_kind["by_rating_status"].score == 4.25
    assert by_kind["by_last"].score == float(copies.epoch_ms(datetime(2026, 10, 1)))
    assert by_kind["public_by_last"].key == ("public", "by_last")


def test_hidden_deleted_or_chapterless_story_is_not_in_the_public_index():
    assert "public_by_last" not in {e.kind for e in redisidx.entries(row(status="HIDDEN"))}
    assert "public_by_last" not in {e.kind for e in redisidx.entries(row(deleted=True))}
    assert "public_by_last" not in {e.kind for e in redisidx.entries(row(last=None))}


def test_newest_first_matches_the_sql_order():
    t = datetime(2026, 10, 1)
    rows = [row(1, last=t), row(2, last=t), row(3, last=datetime(2026, 10, 2)), row(4, last=None),
            row(5, status="DRAFT", last=datetime(2026, 12, 1))]
    assert [r["StoryId"] for r in redisidx.newest_first(rows)] == [3, 2, 1]


def test_escape_tag_and_key_id():
    assert redisidx.escape_tag("kiem-hiep--copy2") == "kiem\\-hiep\\-\\-copy2"
    assert redisidx.escape_tag("COMPLETED") == "COMPLETED"
    assert redisidx.key_id("lab:indexing:s1000:story:42") == 42


def test_parse_search_with_and_without_content():
    total, docs = redisidx.parse_search([2, "k:1", ["StoryId", "1", "Title", "A"], "k:2", ["StoryId", "2"]])
    assert total == 2 and docs == [("k:1", {"StoryId": "1", "Title": "A"}), ("k:2", {"StoryId": "2"})]
    assert redisidx.parse_search([5, "k:1", "k:2"]) == (5, [("k:1", {}), ("k:2", {})])
    assert redisidx.parse_search([0]) == (0, [])


def test_entries_limited_to_kinds_and_unknown_kind():
    assert [e.kind for e in redisidx.entries(row(), ("by_rating", "slug"))] == ["by_rating", "slug"]
    with pytest.raises(ValueError):
        redisidx.entries(row(), ("by_title",))


def test_padding_orders_ties_like_story_id():
    assert sorted([redisidx.pad(10), redisidx.pad(9), redisidx.pad(100)]) == ["00000009", "00000010", "00000100"]


def test_command_args():
    entries = {e.kind: e for e in redisidx.entries(row(last=None))}
    assert redisidx.command_args(entries["slug"], "k") == ["SET", "k", "42"]
    assert redisidx.command_args(entries["author"], "k") == ["SADD", "k", "00000042"]
    assert redisidx.command_args(entries["by_rating"], "k") == ["ZADD", "k", "4.25", "00000042"]
    assert redisidx.command_args(entries["by_last"], "k") == ["ZADD", "k", "-inf", "00000042"]   # NULL sorts last


def test_index_sets_grow_and_use_known_kinds():
    assert [len(redisidx.SET_KINDS[k]) for k in (0, 1, 3, 6)] == [0, 1, 3, 6]
    for kinds in redisidx.SET_KINDS.values():
        assert set(kinds) <= set(redisidx.KINDS)
    fields = {k: sum(1 for a in redisidx.SET_SCHEMA[k] if a in ("NUMERIC", "TAG", "TEXT")) for k in (1, 3, 6)}
    assert fields == {1: 1, 3: 3, 6: 6}


def test_next_rating_wraps_like_the_sql_update():
    assert redisidx.next_rating(Decimal("4.25")) == Decimal("4.26")
    assert redisidx.next_rating(Decimal("4.99")) == Decimal("1.00")
    assert redisidx.next_rating("5.00") == Decimal("1.00")


def test_parse_ft_info_and_memory():
    reply = ["index_name", "lab:indexing:idx:x:s1000", "num_docs", "1000", "indexing", "0",
             "percent_indexed", "1", "inverted_sz_mb", "0.5", "doc_table_size_mb", "0.25",
             "attributes", [["identifier", "Slug"]]]
    info = redisidx.parse_ft_info(reply)
    assert info["num_docs"] == 1000.0 and info["index_name"] == "lab:indexing:idx:x:s1000"
    assert redisidx.indexing_done(info)
    assert redisidx.index_memory_mb(info) == 0.75
    info["total_index_memory_sz_mb"] = 2.0
    assert redisidx.index_memory_mb(info) == 2.0
    assert not redisidx.indexing_done({"indexing": 1.0, "percent_indexed": 0.4})


def test_parsers_accept_the_dict_replies_of_redis_py_8():
    info = redisidx.parse_ft_info({"index_name": "x", "num_docs": 100, "indexing": 0, "percent_indexed": "1",
                                   "inverted_sz_mb": "0.5", "attributes": [["identifier", "Slug"]]})
    assert info["num_docs"] == 100.0 and redisidx.indexing_done(info) and redisidx.index_memory_mb(info) == 0.5
    reply = {"attributes": [], "format": "STRING", "total_results": 2, "warning": [],
             "results": [{"id": "k:1", "extra_attributes": {"StoryId": "1"}, "values": []},
                         {"id": "k:2", "extra_attributes": {}, "values": []}]}
    assert redisidx.parse_search(reply) == (2, [("k:1", {"StoryId": "1"}), ("k:2", {})])
