"""Secondary indexes in Redis, kept by the application (the "manual" variants), and FT.INFO parsing.

Redis finds a Hash only by its key. To look stories up by another field the application must write extra
structures next to every Hash, and keep them in step on every write. entries(row) lists them for one story;
the same list is used to build them for the whole dataset (common.build_manual) and, in I7, to measure what
keeping them costs on every write.

Keys (relative to lab:indexing:s<n>:mx:)   type        member                score / value
  slug:<Slug>                              String      -                     StoryId          (I7, unique)
  author:<AuthorId>                        Set         id                    -                (I7)
  by_rating                                Sorted set  id                    RatingAvg        (I2, I7)
  status:<CompletionStatus>                Set         id                    -                (I2)
  by_rating:<CompletionStatus>             Sorted set  id                    RatingAvg        (I2: "composite")
  by_view                                  Sorted set  id                    ViewCount        (I7)
  by_last                                  Sorted set  id                    LastChapterAt ms (I3, I4)
  public:by_last                           Sorted set  id (public stories    LastChapterAt ms (I3, I4: "filtered")
                                                       that have a chapter)

Members are ids zero-padded to 8 digits: Sorted set members with the same score are ordered as strings, so
padding makes ties come out in StoryId order, like SQL's "ORDER BY LastChapterAt DESC, StoryId DESC".
A NULL LastChapterAt gets score -inf (SQL Server sorts NULL lowest, so last in a DESC order).

Plain Python, unit-tested (tests/test_redisidx.py).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from . import copies

PAD = 8
KINDS = ("slug", "author", "by_rating", "status", "by_rating_status", "by_view", "by_last", "public_by_last")
# Key pattern of each kind, relative to s<n>:mx: (for MEMORY USAGE totals).
PATTERNS = {"slug": "slug:*", "author": "author:*", "by_rating": "by_rating", "status": "status:*",
            "by_rating_status": "by_rating:*", "by_view": "by_view", "by_last": "by_last",
            "public_by_last": "public:by_last"}
NEG_INF = float("-inf")


def pad(story_id: int) -> str:
    return f"{int(story_id):0{PAD}d}"


@dataclass(frozen=True)
class Entry:
    kind: str
    command: str                       # SET, SADD or ZADD
    key: tuple[str, ...]               # key parts after s<n>:mx:
    member: str                        # SET: the value; SADD / ZADD: the member
    score: float | None = None         # ZADD only


def entries(row: dict[str, Any], kinds: tuple[str, ...] = KINDS) -> list[Entry]:
    """The secondary-index writes for one story (a row of copies.copy_rows), limited to `kinds`."""
    unknown = set(kinds) - set(KINDS)
    if unknown:
        raise ValueError(f"unknown index kind(s): {', '.join(sorted(unknown))}")
    sid = pad(row["StoryId"])
    last = copies.epoch_ms(row["LastChapterAt"])
    last_score = NEG_INF if last is None else float(last)
    rating = float(row["RatingAvg"])
    all_entries = {
        "slug": Entry("slug", "SET", ("slug", row["Slug"]), str(row["StoryId"])),
        "author": Entry("author", "SADD", ("author", str(row["AuthorId"])), sid),
        "by_rating": Entry("by_rating", "ZADD", ("by_rating",), sid, rating),
        "status": Entry("status", "SADD", ("status", row["CompletionStatus"]), sid),
        "by_rating_status": Entry("by_rating_status", "ZADD", ("by_rating", row["CompletionStatus"]), sid, rating),
        "by_view": Entry("by_view", "ZADD", ("by_view",), sid, float(row["ViewCount"])),
        "by_last": Entry("by_last", "ZADD", ("by_last",), sid, last_score),
    }
    if listed(row):
        all_entries["public_by_last"] = Entry("public_by_last", "ZADD", ("public", "by_last"), sid, last_score)
    return [all_entries[k] for k in kinds if k in all_entries]


def listed(row: dict[str, Any]) -> bool:
    """In the F1 "recently updated" list (I3, I4): public and has at least one chapter."""
    return copies.is_public(row) and row["LastChapterAt"] is not None


def newest_first(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The F1 list in SQL order: ORDER BY LastChapterAt DESC, StoryId DESC."""
    return sorted((r for r in rows if listed(r)), key=lambda r: (r["LastChapterAt"], r["StoryId"]), reverse=True)


# --- I7: index sets ----------------------------------------------------------------------------------
# The same "0 / 1 / 3 / 6 indexes" as the SQL side (sqlserver.I7_SETS), as application-kept structures and as
# RediSearch fields. SQL: 1 = RatingAvg; 3 = + AuthorId, unique Slug; 6 = + ViewCount, (CompletionStatus,
# RatingAvg) covering, filtered LastChapterAt of the public stories.
SET_KINDS: dict[int, tuple[str, ...]] = {
    0: (),
    1: ("by_rating",),
    3: ("by_rating", "author", "slug"),
    6: ("by_rating", "author", "slug", "by_view", "by_rating_status", "public_by_last"),
}
SET_SCHEMA: dict[int, list[str]] = {
    1: ["RatingAvg", "NUMERIC"],
    3: ["RatingAvg", "NUMERIC", "AuthorId", "TAG", "Slug", "TAG"],
    6: ["RatingAvg", "NUMERIC", "AuthorId", "TAG", "Slug", "TAG", "ViewCount", "NUMERIC",
        "CompletionStatus", "TAG", "LastChapterAt", "NUMERIC", "SORTABLE"],
}
RATING_KINDS = ("by_rating", "by_rating_status")      # structures whose score is RatingAvg
VIEW_KINDS = ("by_view",)


def next_rating(value: Any) -> Any:
    """The rating after one I7 "update_rating", the same rule as sql/i7_update_rating.sql."""
    from decimal import Decimal
    v = Decimal(str(value))
    return Decimal("1.00") if v >= Decimal("4.99") else v + Decimal("0.01")


# --- RediSearch query helpers ---------------------------------------------------------------------
def escape_tag(value: str) -> str:
    """A value for a TAG query {…}: every character that is not a letter, digit or _ gets a backslash
    (RediSearch treats punctuation and spaces in TAG queries as syntax)."""
    return "".join(c if c.isalnum() or c == "_" else "\\" + c for c in str(value))


def key_id(key: str) -> int:
    """lab:indexing:s1000:story:42 -> 42."""
    return int(str(key).rsplit(":", 1)[1])


def parse_search(reply: list[Any]) -> tuple[int, list[tuple[str, dict[str, str]]]]:
    """FT.SEARCH reply (RESP2: total, key, [field, value, ...], key, ...) -> (total, [(key, fields)]).
    With NOCONTENT the reply has no field lists."""
    total = int(reply[0])
    docs: list[tuple[str, dict[str, str]]] = []
    i = 1
    while i < len(reply):
        key = reply[i]
        fields: dict[str, str] = {}
        if i + 1 < len(reply) and isinstance(reply[i + 1], list):
            flat = reply[i + 1]
            fields = {str(flat[j]): flat[j + 1] for j in range(0, len(flat) - 1, 2)}
            i += 2
        else:
            i += 1
        docs.append((str(key), fields))
    return total, docs


def command_args(entry: Entry, key: str) -> list[Any]:
    """Arguments for execute_command / a pipeline, given the full key name."""
    if entry.command == "SET":
        return ["SET", key, entry.member]
    if entry.command == "SADD":
        return ["SADD", key, entry.member]
    score = "-inf" if entry.score == NEG_INF else repr(entry.score)
    return ["ZADD", key, score, entry.member]


# --- FT.INFO --------------------------------------------------------------------------------------
def parse_ft_info(reply: list[Any]) -> dict[str, Any]:
    """FT.INFO (RESP2 flat list key, value, key, value ...) -> dict; numeric strings become floats."""
    out: dict[str, Any] = {}
    for i in range(0, len(reply) - 1, 2):
        key = reply[i].decode() if isinstance(reply[i], bytes) else str(reply[i])
        value = reply[i + 1]
        if isinstance(value, bytes):
            value = value.decode()
        if isinstance(value, str):
            try:
                value = float(value)
            except ValueError:
                pass
        out[key] = value
    return out


# Fields of FT.INFO that measure the index's memory (MB); total_index_memory_sz_mb exists from RediSearch 2.8.
MEMORY_FIELDS = ("inverted_sz_mb", "offset_vectors_sz_mb", "doc_table_size_mb", "sortable_values_size_mb",
                 "key_table_size_mb", "tag_overhead_sz_mb", "text_overhead_sz_mb", "geoshapes_sz_mb",
                 "vector_index_sz_mb", "total_index_memory_sz_mb")


def index_memory_mb(info: dict[str, Any]) -> float:
    """Memory of a RediSearch index in MB: total_index_memory_sz_mb when present, else the sum of the parts."""
    total = info.get("total_index_memory_sz_mb")
    if isinstance(total, float):
        return total
    return sum(v for k, v in info.items() if k in MEMORY_FIELDS and isinstance(v, float))


def indexing_done(info: dict[str, Any]) -> bool:
    """True once the background scan of existing Hashes is over."""
    return info.get("indexing") in (0.0, "0", 0) and info.get("percent_indexed", 1.0) in (1.0, "1")
