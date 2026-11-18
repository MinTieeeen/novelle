"""I5 full-text search: keywords, accent folding and the reference answer (plain Python, tests/test_textsearch.py).

What a reader expects from the search box: a story matches when one of the words of its Title or Description
STARTS WITH the typed term, ignoring case and Vietnamese tone marks / diacritics (typing "kiem" finds "kiếm").
reference() computes that set on the client; each variant's result is scored against it (recall, precision)
instead of being required to be equal, because the variants differ on purpose:
  LIKE '%w%'        substring, accent handling decided by the column collation (Vietnamese_100_CI_AI)
  CONTAINSTABLE     word prefix "w*", word breaker of the full-text language, catalog ACCENT_SENSITIVITY = OFF
  FT.SEARCH w*      word prefix, RediSearch tokenizer (lower-cases, keeps diacritics)
  scan + string.find  byte substring in Lua: only ASCII letters are lower-cased
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter
from typing import Any, Iterable

_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)       # runs of letters


def fold(text: str) -> str:
    """Lower case without diacritics: "Kiếm Hiệp Đô Thị" -> "kiem hiep do thi" (đ / Đ become d)."""
    text = text.replace("đ", "d").replace("Đ", "D")
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def words(text: str | None) -> list[str]:
    """Lower-cased words (letters only) of a text, diacritics kept."""
    return [w.lower() for w in _WORD.findall(unicodedata.normalize("NFC", text or ""))]


def doc_text(row: dict[str, Any]) -> str:
    return f"{row['Title']} {row.get('Description') or ''}"


def search_text(row: dict[str, Any]) -> str:
    """The folded copy of Title + Description that the search_unaccented variant indexes."""
    return fold(doc_text(row))


def is_accented(word: str) -> bool:
    return fold(word) != word


def choose_terms(rows: list[dict[str, Any]], low: float = 0.02, high: float = 0.10) -> dict[str, str]:
    """Keywords taken from the stories themselves:
      common      an accented word (no đ) of >= 3 letters found in low..high of the stories, the most frequent
                  such word; if none falls in the range, the accented word closest to the middle of it
      rare        a word of >= 4 letters found in exactly one story (accented preferred)
      unaccented  `common` typed without diacritics
    Words with đ are avoided: đ is a letter of its own, not an accent, so collations may not fold it."""
    df: Counter[str] = Counter()
    for r in rows:
        df.update(set(words(doc_text(r))))
    total = len(rows)
    accented = [w for w in df if len(w) >= 3 and is_accented(w) and "đ" not in w]
    if not accented:
        raise ValueError("no accented word in the stories")
    in_range = [w for w in accented if low <= df[w] / total <= high]
    if in_range:
        common = max(in_range, key=lambda w: (df[w], w))
    else:
        middle = (low + high) / 2
        common = min(accented, key=lambda w: (abs(df[w] / total - middle), w))
    singles = sorted((w for w in df if df[w] == 1 and len(w) >= 4 and "đ" not in w),
                     key=lambda w: (not is_accented(w), w))
    rare = singles[0] if singles else min(df, key=lambda w: (df[w], w))
    return {"common": common, "rare": rare, "unaccented": fold(common)}


def matches(row: dict[str, Any], term: str) -> bool:
    """A word of Title / Description starts with the term, both folded."""
    t = fold(term)
    return any(fold(w).startswith(t) for w in words(doc_text(row)))


def reference(rows: Iterable[dict[str, Any]], term: str) -> set[int]:
    return {r["StoryId"] for r in rows if matches(r, term)}


def recall_precision(found: set[int], expected: set[int]) -> tuple[float, float]:
    """(share of the expected stories found, share of the found stories that were expected), in 0..1.
    An empty expected set gives recall 1; an empty result gives precision 1."""
    hit = len(found & expected)
    recall = hit / len(expected) if expected else 1.0
    precision = hit / len(found) if found else 1.0
    return recall, precision
