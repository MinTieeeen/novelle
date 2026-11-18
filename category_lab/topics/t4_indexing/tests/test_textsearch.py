"""Unit tests of textsearch.py (I5 keywords and reference answers)."""
import pytest

from topics.t4_indexing import textsearch as ts


def test_fold_removes_tone_marks_and_diacritics():
    assert ts.fold("Kiếm Hiệp Đô Thị") == "kiem hiep do thi"
    assert ts.fold("Ngôn tình, ƯỚC MƠ") == "ngon tinh, uoc mo"


def test_words_keep_diacritics_and_drop_numbers_and_punctuation():
    assert ts.words("Kiếm hiệp #2 (tiên-hiệp)") == ["kiếm", "hiệp", "tiên", "hiệp"]
    assert ts.words(None) == []


def story(i, title, desc=""):
    return {"StoryId": i, "Title": title, "Description": desc}


ROWS = [story(1, "Kiếm khách", "giang hồ"), story(2, "Kiếm hiệp", "kiếm sĩ"), story(3, "Tình yêu", "ngọt"),
        story(4, "Hệ thống", "kiếm tiền"), story(5, "Đô thị", "đại gia")] + \
       [story(i, "Truyện", "bình thường") for i in range(6, 41)]


def test_choose_terms():
    terms = ts.choose_terms(ROWS)
    # "kiếm" is in 3 of 40 stories (7.5%), the most frequent accented word inside 2..10%
    assert terms["common"] == "kiếm"
    assert terms["unaccented"] == "kiem"
    assert terms["rare"] in {"khách", "giang", "tình", "ngọt", "thống", "tiền", "hiệp"}
    assert "đ" not in terms["rare"]


def test_choose_terms_without_accented_words():
    with pytest.raises(ValueError):
        ts.choose_terms([story(1, "abc def")])


def test_reference_is_word_prefix_and_accent_insensitive():
    assert ts.reference(ROWS, "kiếm") == {1, 2, 4}
    assert ts.reference(ROWS, "kiem") == {1, 2, 4}
    assert ts.reference(ROWS, "kie") == {1, 2, 4}
    assert ts.reference(ROWS, "iem") == set()                 # inside a word: not a prefix
    assert ts.reference(ROWS, "do") == {5}                    # đ folds to d


def test_search_text():
    assert ts.search_text(story(1, "Kiếm Hiệp", "Đô thị")) == "kiem hiep do thi"


def test_recall_precision():
    assert ts.recall_precision({1, 2, 9}, {1, 2, 4}) == (2 / 3, 2 / 3)
    assert ts.recall_precision(set(), {1}) == (0.0, 1.0)
    assert ts.recall_precision({1}, set()) == (1.0, 0.0)
