"""Unit tests of picks.py (parameters chosen from the data)."""
from decimal import Decimal as D

import pytest

from topics.t4_indexing import picks


def test_median_author_prefers_the_newest_copy():
    rows = [{"AuthorId": a, "StoryId": i} for i, a in enumerate([1, 1, 1, 2, 2, 3, 3, 4, 5])]
    # counts: 1->3, 2->2, 3->2, 4->1, 5->1; median count = 2, authors 2 and 3 -> the higher id
    assert picks.median_author(rows) == (3, 2)


def test_middle_row():
    rows = [{"StoryId": i} for i in (5, 1, 4, 2, 3)]
    assert picks.middle_row(rows)["StoryId"] == 3


def test_threshold_counts_ties():
    values = [D("5.00"), D("4.50"), D("4.50"), D("4.00"), D("3.00")]
    assert picks.threshold(values, 0.2) == (D("5.00"), 1)
    assert picks.threshold(values, 0.4) == (D("4.50"), 3)          # the tie pulls in a third row
    assert picks.threshold(values, 1.0) == (D("3.00"), 5)
    assert picks.threshold(values, 0.0001) == (D("5.00"), 1)        # at least one row
    with pytest.raises(ValueError):
        picks.threshold([], 0.5)


def test_catalog_filter_keeps_about_the_share():
    rows = [{"StoryId": i, "CompletionStatus": "COMPLETED" if i % 2 else "ONGOING",
             "RatingAvg": D(str(round(1 + (i % 40) / 10, 2)))} for i in range(1, 1001)]
    status, t, want = picks.catalog_filter(rows, 0.02)
    assert status == "COMPLETED"
    assert want == {r["StoryId"] for r in rows if r["CompletionStatus"] == "COMPLETED" and r["RatingAvg"] >= t}
    assert 10 <= len(want) <= 40                                     # ~2% of 1000, in steps of the tied values


def test_catalog_filter_falls_back_to_the_most_common_status():
    rows = [{"StoryId": i, "CompletionStatus": "HIATUS" if i < 8 else "ONGOING", "RatingAvg": D("4.00")}
            for i in range(10)]
    assert picks.catalog_filter(rows)[0] == "HIATUS"


def test_page_offsets():
    assert picks.page_offsets(1000) == [(0, 0), (10, 100), (50, 500), (90, 900)]
    assert picks.page_offsets(995) == [(0, 0), (10, 80), (50, 480), (90, 880)]
    assert picks.page_offsets(30) == [(0, 0)]                      # every depth is the first page
    assert picks.page_offsets(10) == [(0, 0)]


def test_write_target_is_a_public_story_with_a_description():
    rows = [{"StoryId": i, "PublishStatus": "PUBLISHED" if i % 3 else "DRAFT", "IsDeleted": i == 4,
             "Description": "" if i == 5 else "x"} for i in range(1, 11)]
    # public, not deleted, with a description: 1, 2, 7, 8, 10 -> the middle one
    assert picks.write_target(rows)["StoryId"] == 7
    with pytest.raises(ValueError):
        picks.write_target([{"StoryId": 1, "PublishStatus": "DRAFT", "IsDeleted": False, "Description": "x"}])


def test_pct():
    assert picks.pct(1234, 50000) == "2,5%"
