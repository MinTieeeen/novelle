"""Unit tests of the copy rules (copies.py); no database needed.

Run inside the lab container:  uv run pytest topics/t4_indexing/tests
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from topics.t4_indexing import copies


def story(story_id, author, title, slug, *, status="PUBLISHED", deleted=False, last=None, rating="4.25",
          chapters=10):
    return {"StoryId": story_id, "AuthorId": author, "Title": title, "Slug": slug, "Description": "mô tả",
            "CoverUrl": None, "AgeRating": "ALL", "CompletionStatus": "ONGOING", "PublishStatus": status,
            "ChapterCount": chapters, "WordCount": 1000, "ViewCount": 5, "FollowCount": 1,
            "RatingAvg": Decimal(rating), "RatingCount": 3, "LastChapterAt": last,
            "PublishedAt": datetime(2026, 1, 1), "IsDeleted": deleted,
            "CreatedAt": datetime(2025, 12, 1), "UpdatedAt": datetime(2026, 1, 2)}


T0 = datetime(2026, 10, 1, 8, 30, 0, 123000)
BASE = [story(7, 3, "Kiếm hiệp", "kiem-hiep", last=T0),            # given out of order on purpose
        story(2, 5, "Tiên nghịch", "tien-nghich", status="DRAFT", last=None, rating="3.50"),
        story(4, 3, "Đô thị", "do-thi", deleted=True, last=T0 + timedelta(days=1))]


def test_ids_are_dense_and_follow_the_original_order():
    rows = copies.copy_rows(BASE, 7, max_author_id=10)
    assert [r["StoryId"] for r in rows] == [1, 2, 3, 4, 5, 6, 7]
    assert [r["SourceStoryId"] for r in rows] == [2, 4, 7, 2, 4, 7, 2]
    assert list(rows[0]) == list(copies.COLUMNS)


def test_first_copy_is_unchanged():
    rows = copies.copy_rows(BASE, 3, max_author_id=10)
    first = rows[2]
    assert (first["Title"], first["Slug"], first["AuthorId"], first["LastChapterAt"]) == \
           ("Kiếm hiệp", "kiem-hiep", 3, T0)


def test_later_copies_get_new_authors_titles_slugs_and_shifted_times():
    rows = copies.copy_rows(BASE, 9, max_author_id=10)
    third = rows[8]                                           # copy 3 of story 7
    assert third["AuthorId"] == 3 + 2 * 10
    assert third["Title"] == "Kiếm hiệp #3"
    assert third["Slug"] == "kiem-hiep--copy3"
    assert third["LastChapterAt"] == T0 - timedelta(milliseconds=2)
    assert rows[3]["LastChapterAt"] is None                   # NULL stays NULL
    assert len({r["Slug"] for r in rows}) == 9                # slugs stay unique


def test_long_titles_are_cut_like_the_sql_cast():
    rows = copies.copy_rows([story(1, 1, "x" * 299, "s" * 349, last=T0)], 2, max_author_id=1)
    assert len(rows[1]["Title"]) == copies.TITLE_MAX
    assert len(rows[1]["Slug"]) == copies.SLUG_MAX


def test_empty_source_is_an_error():
    try:
        copies.copy_rows([], 10, max_author_id=1)
    except ValueError:
        return
    raise AssertionError("expected ValueError")


def test_epoch_ms_is_exact_and_accepts_aware_values():
    assert copies.epoch_ms(datetime(1970, 1, 1, 0, 0, 1, 5000)) == 1005
    assert copies.epoch_ms(T0) == copies.epoch_ms(T0.replace(tzinfo=timezone.utc))
    assert copies.epoch_ms(None) is None


def test_to_hash_encodes_every_column_as_text():
    h = copies.to_hash(copies.copy_rows(BASE, 3, max_author_id=10)[2])
    assert set(h) == set(copies.COLUMNS)
    assert h["RatingAvg"] == "4.25" and h["IsDeleted"] == "0" and h["CoverUrl"] == ""
    assert h["LastChapterAt"] == str(copies.epoch_ms(T0))


def test_fingerprint():
    rows = copies.copy_rows(BASE, 6, max_author_id=10)
    fp = copies.fingerprint(rows)
    assert fp["rows"] == 6
    assert fp["public_rows"] == 2                             # only story 7 and its copy: 2 is DRAFT, 4 deleted
    assert fp["id_sum"] == 21
    assert fp["author_sum"] == (5 + 3 + 3) * 2 + 10 * 3
    assert fp["rating_cents_sum"] == (350 + 425 + 425) * 2
    assert fp["title_len_sum"] == sum(len(r["Title"]) for r in rows)
    assert fp["chapter_sum"] == 60
    assert copies.fingerprint(reversed(rows)) == fp           # order does not matter


def test_labels():
    assert copies.label("no_index", 50_000) == "no_index · 50k"
    assert copies.label("x", 150) == "x · 150"
    assert copies.num(50_000) == "50.000"
