"""The copy rules of the indexing dataset, in plain Python (no database, no lab imports: unit-testable).

sql/dataset_story.sql grows dbo.Story to n stories on the server; copy_rows() applies the SAME rules to the
150 original rows on the client, so Redis receives the same n stories without downloading them from RDS.
fingerprint() summarises a set of rows; sql/dataset_fingerprint.sql computes the same numbers on the server,
and the dataset scenario checks that the two agree.

Rules for copy k (k = 1 is the original row, ids are dense 1..n in StoryId order of the originals):
  StoryId        (k - 1) * base + row number of the original (1..base)
  SourceStoryId  StoryId of the original
  AuthorId       original AuthorId + (k - 1) * max_author_id   (the site grows by new authors)
  Title          original + " #k" for k > 1, cut to 300 characters
  Slug           original + "--copyk" for k > 1, cut to 350 characters
  LastChapterAt  original - (k - 1) ms, so copies do not share the exact same timestamp (sort ties)
  other columns  unchanged
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable

# Columns of lab.indexing__Story_<n>, in table order (sql/dataset_story.sql).
COLUMNS = ("StoryId", "SourceStoryId", "AuthorId", "Title", "Slug", "Description", "CoverUrl", "AgeRating",
           "CompletionStatus", "PublishStatus", "ChapterCount", "WordCount", "ViewCount", "FollowCount",
           "RatingAvg", "RatingCount", "LastChapterAt", "PublishedAt", "IsDeleted", "CreatedAt", "UpdatedAt")
# Columns read from dbo.Story (the ones that are not computed by the copy).
SOURCE_COLUMNS = tuple(c for c in COLUMNS if c != "SourceStoryId")
DATETIME_COLUMNS = ("LastChapterAt", "PublishedAt", "CreatedAt", "UpdatedAt")

TITLE_MAX = 300
SLUG_MAX = 350
_EPOCH = datetime(1970, 1, 1)


def copy_rows(base: list[dict[str, Any]], n: int, max_author_id: int) -> list[dict[str, Any]]:
    """The first n rows of the grown table, in StoryId order. `base` = rows of dbo.Story (any order)."""
    if not base:
        raise ValueError("dbo.Story is empty: nothing to copy")
    originals = sorted(base, key=lambda r: r["StoryId"])
    size = len(originals)
    rows: list[dict[str, Any]] = []
    copy = 1
    while (copy - 1) * size < n:
        for i, src in enumerate(originals, start=1):
            new_id = (copy - 1) * size + i
            if new_id > n:
                break
            row = {c: src[c] for c in SOURCE_COLUMNS}
            row["StoryId"] = new_id
            row["SourceStoryId"] = src["StoryId"]
            row["AuthorId"] = src["AuthorId"] + (copy - 1) * max_author_id
            if copy > 1:
                row["Title"] = (src["Title"] + f" #{copy}")[:TITLE_MAX]
                row["Slug"] = (src["Slug"] + f"--copy{copy}")[:SLUG_MAX]
            if src["LastChapterAt"] is not None:
                row["LastChapterAt"] = src["LastChapterAt"] - timedelta(milliseconds=copy - 1)
            rows.append({c: row[c] for c in COLUMNS})
        copy += 1
    return rows


def epoch_ms(value: datetime | None) -> int | None:
    """DATETIME2 (naive, UTC in Novelle) -> integer milliseconds since 1970-01-01, exact."""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return (value - _EPOCH) // timedelta(milliseconds=1)


def is_public(row: dict[str, Any]) -> bool:
    """RB3: what readers can see (vw_PublicStory)."""
    return row["PublishStatus"] == "PUBLISHED" and not row["IsDeleted"]


def to_hash(row: dict[str, Any]) -> dict[str, str]:
    """Field map of the Redis Hash of one story. NULL -> "", datetimes -> epoch ms (usable as ZSET scores
    and RediSearch NUMERIC), booleans -> "0" / "1", decimals as written by SQL Server (e.g. "4.25")."""
    out: dict[str, str] = {}
    for c in COLUMNS:
        v = row[c]
        if v is None:
            out[c] = ""
        elif c in DATETIME_COLUMNS:
            out[c] = str(epoch_ms(v))
        elif isinstance(v, bool):
            out[c] = "1" if v else "0"
        else:
            out[c] = str(v)
    return out


def _utf16_len(text: str) -> int:
    """Length the way SQL Server counts NVARCHAR characters (DATALENGTH / 2)."""
    return len(text.encode("utf-16-le")) // 2


def _cents(value: Any) -> int:
    return int(Decimal(str(value)) * 100)


def fingerprint(rows: Iterable[dict[str, Any]]) -> dict[str, int]:
    """Order-independent summary; the keys match the columns of sql/dataset_fingerprint.sql."""
    fp = {"rows": 0, "public_rows": 0, "id_sum": 0, "author_sum": 0, "chapter_sum": 0, "rating_cents_sum": 0,
          "title_len_sum": 0, "slug_len_sum": 0, "last_ms_sum": 0}
    for r in rows:
        fp["rows"] += 1
        fp["public_rows"] += 1 if is_public(r) else 0
        fp["id_sum"] += r["StoryId"]
        fp["author_sum"] += r["AuthorId"]
        fp["chapter_sum"] += r["ChapterCount"]
        fp["rating_cents_sum"] += _cents(r["RatingAvg"])
        fp["title_len_sum"] += _utf16_len(r["Title"])
        fp["slug_len_sum"] += len(r["Slug"])
        fp["last_ms_sum"] += epoch_ms(r["LastChapterAt"]) or 0
    return fp


def label(name: str, n: int) -> str:
    """Metric label with the table size, e.g. "no_index · 10k"."""
    return f"{name} · {n // 1000}k" if n >= 1000 else f"{name} · {n}"


def num(n: int) -> str:
    """50000 -> "50.000" (Vietnamese thousands separator)."""
    return f"{n:,}".replace(",", ".")
