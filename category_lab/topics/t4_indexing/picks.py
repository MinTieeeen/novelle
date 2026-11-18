"""How the scenarios choose their parameters from the data (plain Python, tests/test_picks.py).

The values are taken from the generated rows (copies.copy_rows), which are the same stories as the SQL
table, so the expected results are known before a query runs.
"""
from __future__ import annotations

from collections import Counter
from decimal import Decimal
from typing import Any


def median_author(rows: list[dict[str, Any]]) -> tuple[int, int]:
    """(AuthorId, story count) of a typical author page: the author whose story count is the median.
    Ties are broken by the highest AuthorId, i.e. an author of the newest copy."""
    counts = Counter(r["AuthorId"] for r in rows)
    ordered = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]))
    middle = ordered[len(ordered) // 2][1]
    author = max(a for a, c in counts.items() if c == middle)
    return author, middle


def middle_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """A row from the middle of the table (not the first page, not the last)."""
    return sorted(rows, key=lambda r: r["StoryId"])[len(rows) // 2]


def threshold(values: list[Decimal], fraction: float) -> tuple[Decimal, int]:
    """Smallest value t taken from `values` such that about `fraction` of them are >= t.
    Returns (t, how many values are really >= t): values repeat, so the share moves in steps."""
    if not values:
        raise ValueError("no values")
    ordered = sorted(values, reverse=True)
    k = min(len(ordered), max(1, round(fraction * len(ordered))))
    t = ordered[k - 1]
    return t, sum(1 for v in ordered if v >= t)


def thresholds(values: list[Decimal], fractions: tuple[float, ...]) -> list[tuple[Decimal, int]]:
    """threshold() for several target shares, without repeating the same t (ascending share)."""
    out: list[tuple[Decimal, int]] = []
    for f in sorted(fractions):
        t, count = threshold(values, f)
        if not out or out[-1][0] != t:
            out.append((t, count))
    return out


CATALOG_SHARE = 0.02                                       # I2: the filter keeps ~2% of the table
TIP_FRACTIONS = (0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5)   # I2: shares swept for the tipping point


def catalog_filter(rows: list[dict[str, Any]], share: float = CATALOG_SHARE) -> tuple[str, Decimal, set[int]]:
    """I2 filter "CompletionStatus = @st AND RatingAvg >= @r": (status, minimum rating, expected StoryIds).
    Status COMPLETED (else the most common one); the rating is chosen so about `share` of the table matches."""
    counts = Counter(r["CompletionStatus"] for r in rows)
    status = "COMPLETED" if "COMPLETED" in counts else counts.most_common(1)[0][0]
    ratings = [r["RatingAvg"] for r in rows if r["CompletionStatus"] == status]
    t, _ = threshold(ratings, min(1.0, share * len(rows) / len(ratings)))
    want = {r["StoryId"] for r in rows if r["CompletionStatus"] == status and r["RatingAvg"] >= t}
    return status, t, want


def page_offsets(total: int, percents: tuple[int, ...] = (0, 10, 50, 90), size: int = 20) -> list[tuple[int, int]]:
    """(percent, OFFSET) pairs of pages at those depths of a list of `total` rows; offsets are whole pages and
    the page is full. Depths that collapse onto the same page are kept once."""
    last = max(0, (total - size) // size * size)
    out: list[tuple[int, int]] = []
    for p in percents:
        offset = min(last, (total * p // 100) // size * size)
        if not out or out[-1][1] != offset:
            out.append((p, offset))
    return out


def write_target(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """I7: the story the writes target: public (so the filtered index is involved), with a description,
    taken from the middle of the public ones."""
    candidates = sorted((r for r in rows if r["PublishStatus"] == "PUBLISHED" and not r["IsDeleted"]
                         and r["Description"]), key=lambda r: r["StoryId"])
    if not candidates:
        raise ValueError("no public story with a description")
    return candidates[len(candidates) // 2]


def pct(count: int, total: int) -> str:
    """Share as text, e.g. 1.234 of 50.000 -> "2,5%" (Vietnamese decimal comma)."""
    return f"{100 * count / total:.1f}%".replace(".", ",")
