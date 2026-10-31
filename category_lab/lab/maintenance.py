"""`lab scaffold` (new topic folder from topics/_template) and `lab clean` (remove leftover lab data)."""
from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path

from lab.config import LabConfig
from lab.connections import RedisClient, SqlServer
from lab.framework import fixtures
from lab.framework.registry import TOPIC_FOLDER, TOPICS_DIR

TEMPLATE = "_template"
TOPIC_ID = re.compile(r"^[a-z][a-z0-9_]*$")


def scaffold(folder: str, owner: str, title: str | None = None, topic_id: str | None = None,
             topics_dir: Path = TOPICS_DIR) -> Path:
    """Copy topics/_template to topics/<folder>, filling in id, title and owner. Never overwrites."""
    if not TOPIC_FOLDER.match(folder):
        raise ValueError(f"folder must look like t<number>_<name>, e.g. t5_concurrency (got '{folder}')")
    target = topics_dir / folder
    if target.exists():
        raise FileExistsError(f"{target} already exists")
    topic_id = topic_id or folder.split("_", 1)[1]
    if not TOPIC_ID.match(topic_id):
        raise ValueError(f"topic id must be lowercase letters, digits and _ (got '{topic_id}')")
    title = title or topic_id.replace("_", " ").capitalize()
    for bad in ('"', "\\", "\n"):
        if bad in title or bad in owner:
            raise ValueError("title and owner must not contain quotes, backslashes or new lines")

    shutil.copytree(topics_dir / TEMPLATE, target, ignore=shutil.ignore_patterns("__pycache__"))
    for path in target.rglob("*"):
        if path.is_file() and path.suffix in (".py", ".md", ".sql"):
            text = path.read_text(encoding="utf-8")
            text = text.replace("__TOPIC_ID__", topic_id).replace("__TITLE__", title).replace("__OWNER__", owner)
            path.write_text(text, encoding="utf-8")
    return target


@dataclass
class CleanResult:
    tables: list[str]
    redis_keys: int
    errors: list[str]


def clean(cfg: LabConfig, topic: str | None, sql: bool = True, redis: bool = True) -> CleanResult:
    """Drop lab.<topic>__* tables and delete lab:<topic>:* keys (everything of the lab when topic is None)."""
    result = CleanResult(tables=[], redis_keys=0, errors=[])
    if sql:
        try:
            with SqlServer(cfg.sql) as db:
                result.tables = fixtures.drop_topic_tables(db, topic)
        except Exception as exc:
            result.errors.append(f"SQL Server: {type(exc).__name__}: {exc}")
    if redis:
        try:
            with RedisClient(cfg.redis) as client:
                if topic:
                    result.redis_keys = client.scoped(topic).cleanup()
                else:
                    keys = list(client.raw.scan_iter(match="lab:*", count=1000))
                    for i in range(0, len(keys), 500):
                        result.redis_keys += client.raw.unlink(*keys[i:i + 500])
        except Exception as exc:
            result.errors.append(f"Redis: {type(exc).__name__}: {exc}")
    return result
