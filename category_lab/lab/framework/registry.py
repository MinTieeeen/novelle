"""Finds topics and scenarios on disk, so nobody has to register anything by hand.

topics/
  t2_indexing/            folder name: t<number>_<id>
    __init__.py           TOPIC = TopicMeta(id="indexing", ...)
    sqlserver.py          every ScenarioDef at module level -> dbms "sqlserver"
    redis.py              every ScenarioDef at module level -> dbms "redis"

Folders starting with "_" (e.g. _template) are ignored.
"""
from __future__ import annotations

import importlib
import re
import sys
from dataclasses import dataclass, field
from fnmatch import fnmatch
from pathlib import Path

from lab.config import LAB_DIR
from lab.framework.result import Dbms
from lab.framework.scenario import ScenarioDef, TopicMeta

TOPICS_DIR = LAB_DIR / "topics"
TOPIC_FOLDER = re.compile(r"^t\d+_[a-z0-9_]+$")
DBMS_MODULES: tuple[Dbms, ...] = ("sqlserver", "redis")


class RegistryError(RuntimeError):
    """A topic or scenario is declared incorrectly."""


@dataclass
class Topic:
    meta: TopicMeta
    folder: Path
    order: int
    scenarios: list[ScenarioDef] = field(default_factory=list)
    load_errors: list[str] = field(default_factory=list)


def _import(module_name: str, topics_dir: Path):
    parent = str(topics_dir.parent)
    if parent not in sys.path:
        sys.path.insert(0, parent)
    return importlib.import_module(module_name)


def discover(topics_dir: Path = TOPICS_DIR) -> list[Topic]:
    """Import every topic package and collect its scenarios, ordered by topic number then file order."""
    package = topics_dir.name
    topics: list[Topic] = []
    seen_ids: dict[str, str] = {}
    for folder in sorted(p for p in topics_dir.iterdir() if p.is_dir() and TOPIC_FOLDER.match(p.name)):
        pkg = _import(f"{package}.{folder.name}", topics_dir)
        meta = getattr(pkg, "TOPIC", None)
        if not isinstance(meta, TopicMeta):
            raise RegistryError(f"{folder.name}/__init__.py must define TOPIC = TopicMeta(...)")
        topic = Topic(meta=meta, folder=folder, order=int(folder.name[1:].split("_", 1)[0]))

        for dbms in DBMS_MODULES:
            if not (folder / f"{dbms}.py").is_file():
                continue
            try:
                module = _import(f"{package}.{folder.name}.{dbms}", topics_dir)
            except Exception as exc:     # a broken file of one member must not hide the other topics
                topic.load_errors.append(f"{dbms}.py: {type(exc).__name__}: {exc}")
                continue
            for value in vars(module).values():
                if not isinstance(value, ScenarioDef):
                    continue
                # Modules are imported once per process, so a ScenarioDef may already be filled in.
                value.topic, value.dbms, value.module_dir = meta.id, dbms, folder
                value.id = value.id or f"{meta.id}.{dbms}.{value.name}"
                if value.id in seen_ids:
                    raise RegistryError(f"duplicate scenario id '{value.id}' ({seen_ids[value.id]} and {folder.name})")
                seen_ids[value.id] = folder.name
                topic.scenarios.append(value)
        topics.append(topic)

    ids = [t.meta.id for t in topics]
    duplicates = {i for i in ids if ids.count(i) > 1}
    if duplicates:
        raise RegistryError(f"duplicate topic id: {', '.join(sorted(duplicates))}")
    return sorted(topics, key=lambda t: t.order)


def select(topics: list[Topic], topic: str = "all", dbms: str = "all", pattern: str | None = None) -> list[Topic]:
    """Filter by topic id (or folder name), DBMS and a glob on the scenario id. Empty topics are dropped."""
    chosen = []
    for t in topics:
        if topic != "all" and topic not in (t.meta.id, t.folder.name):
            continue
        scenarios = [s for s in t.scenarios
                     if (dbms == "all" or s.dbms == dbms) and (pattern is None or fnmatch(s.id, pattern))]
        chosen.append(Topic(meta=t.meta, folder=t.folder, order=t.order, scenarios=scenarios,
                            load_errors=t.load_errors))
    return [t for t in chosen if t.scenarios or t.load_errors]
