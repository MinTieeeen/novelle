"""The comments typed in the report, stored in a managed block of the topic's NOTES.md.

Everything outside the block is the author's own text and is never touched. The block looks like:

    <!-- lab:comments:start ... -->
    ## Nhận xét chi tiết
    ### Nhận xét chung
    <!-- lab:comment id=_topic -->
    ...text...
    <!-- /lab:comment -->
    ### Lấy 1 truyện theo StoryId
    #### SQL Server · `example.sqlserver.story_by_id`
    <!-- lab:comment id=example.sqlserver.story_by_id -->
    ...text...
    <!-- /lab:comment -->
    <!-- lab:comments:end -->

The headings are for people reading NOTES.md; the comment markers are what is read back, so a comment
may contain any markdown, including headings. Editing the text between markers by hand also works.
"""
from __future__ import annotations

import re
from pathlib import Path

from lab.framework import compare
from lab.framework.result import ScenarioResult, TopicResult

TOPIC_COMMENT_ID = "_topic"
BLOCK_START = "<!-- lab:comments:start (do lab serve ghi; sửa trong report hoặc giữa các dấu lab:comment) -->"
BLOCK_END = "<!-- lab:comments:end -->"
_BLOCK = re.compile(r"\n*<!-- lab:comments:start.*?-->.*?<!-- lab:comments:end -->\n?", re.S)
_COMMENT = re.compile(r"<!-- lab:comment id=(\S+?) -->\n?(.*?)\n?<!-- /lab:comment -->", re.S)
_ID = re.compile(r"^[A-Za-z0-9_.\-]+$")
DBMS_NAME = {"sqlserver": "SQL Server", "redis": "Redis"}


def read_comments(notes: str) -> dict[str, str]:
    """{comment id: text} from the managed block (empty when there is none)."""
    block = _BLOCK.search(notes)
    if not block:
        return {}
    return {m.group(1): m.group(2).strip() for m in _COMMENT.finditer(block.group(0))}


def strip_block(notes: str) -> str:
    """NOTES.md without the managed block (the report shows those comments in their own places)."""
    return _BLOCK.sub("\n", notes).strip()


def _item(cid: str, text: str) -> list[str]:
    return [f"<!-- lab:comment id={cid} -->", text.strip(), "<!-- /lab:comment -->", ""]


def render_block(topic: TopicResult, comments: dict[str, str]) -> str:
    """The managed block for the non-empty comments, ordered like the report."""
    comments = {k: v for k, v in comments.items() if v and v.strip()}
    lines = [BLOCK_START, "## Nhận xét chi tiết", ""]
    if comments.get(TOPIC_COMMENT_ID):
        lines += ["### Nhận xét chung", *_item(TOPIC_COMMENT_ID, comments[TOPIC_COMMENT_ID])]

    def side(s: ScenarioResult | None) -> list[str]:
        if s is None or not comments.get(s.id):
            return []
        return [f"#### {DBMS_NAME[s.dbms]} · `{s.id}`", *_item(s.id, comments[s.id])]

    pairs, unpaired = compare.build_pairs(topic)
    for p in pairs:
        body = side(p.sql) + side(p.redis)
        if body:
            lines += [f"### {p.title}", "", *body]
    loose = [line for s in unpaired for line in side(s)]
    if loose:
        lines += ["### Scenario không ghép cặp", "", *loose]
    lines.append(BLOCK_END)
    return "\n".join(lines)


def validate(topic: TopicResult, comments: dict[str, str], max_chars: int) -> dict[str, str]:
    """Keep only ids of this topic; refuse oversized text."""
    known = {s.id for s in topic.scenarios} | {TOPIC_COMMENT_ID}
    clean = {}
    for cid, text in comments.items():
        if not isinstance(cid, str) or not _ID.match(cid) or cid not in known:
            raise ValueError(f"unknown comment id '{cid}'")
        if not isinstance(text, str):
            raise ValueError(f"comment '{cid}' must be text")
        if len(text) > max_chars:
            raise ValueError(f"comment '{cid}' is longer than {max_chars} characters")
        if "<!-- lab:comment" in text or "<!-- /lab:comment" in text or "lab:comments:" in text:
            raise ValueError("comments must not contain the lab:comment markers")
        clean[cid] = text.replace("\r\n", "\n").strip()
    return clean


def save_comments(notes_path: Path, topic: TopicResult, comments: dict[str, str]) -> str:
    """Replace (or append) the managed block in NOTES.md; the rest of the file is kept as is."""
    current = notes_path.read_text(encoding="utf-8") if notes_path.is_file() else f"# {topic.topic.title}\n"
    block = render_block(topic, comments)
    if _BLOCK.search(current):
        updated = _BLOCK.sub(lambda _: "\n\n" + block + "\n", current, count=1)
    else:
        updated = current.rstrip() + "\n\n" + block + "\n"
    notes_path.write_text(updated.lstrip("\n"), encoding="utf-8")
    return updated
