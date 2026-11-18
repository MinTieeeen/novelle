"""The data every indexing scenario works on: dbo.Story grown to 1k / 10k / 50k stories.

SQL Server  lab.indexing__Story_<n>   clustered primary key on StoryId and NOTHING else, so that each variant
                                      starts from "no index" and creates (then drops) only the indexes it
                                      studies. Built once per run (marker table lab.indexing__Ready_<n>).
            copy_of(ctx, n, "Ft" | "W")  private copies for scenarios that need a full-text index (I5, one
                                      per table) or that write rows (I7).
Redis       lab:indexing:s<n>:story:<id>   one Hash per story, generated on the client from the ~150 rows of
                                      dbo.Story with the copy rules of copies.py (no download of the n rows
                                      from RDS). Marker lab:indexing:s<n>:loaded.

Both sides hold the same stories: the dataset scenario compares copies.fingerprint() of the generated rows
with sql/dataset_fingerprint.sql. dbo.* is only read. The runner drops lab.indexing__* and lab:indexing:*
after the topic; RediSearch indexes are not keys, so drop_search_indexes() removes them.
"""
from __future__ import annotations

from typing import Any

from lab.framework import Ctx
from lab.framework.fixtures import ensure_schema, sandbox_name

from . import copies

SIZES = (1_000, 10_000)
VARIANTS = ("Ft", "W")               # I5 full-text, I7 writes
REDIS_BATCH = 1_000


# --- SQL Server ------------------------------------------------------------------------------------
def story_table(ctx: Ctx, n: int) -> str:
    """lab.indexing__Story_<n> (clustered PK only), built on first use in a run.

    The marker table is created last, so a copy left half-built by an interrupted run is rebuilt."""
    topic = ctx.scenario.topic
    story = sandbox_name(topic, f"Story_{n}")
    ready = sandbox_name(topic, f"Ready_{n}")
    if ctx.sql.scalar(f"SELECT OBJECT_ID(N'{ready}')") is not None:
        return story
    ensure_schema(ctx.sql)
    ctx.sql.exec(f"DROP TABLE IF EXISTS {ready};")
    script = ctx.read("sql/dataset_story.sql").format(story=story, pk=f"PK_{topic}__Story_{n}", n=n)
    ctx.sql.exec_script(script)
    count = ctx.sql.scalar(f"SELECT COUNT(*) FROM {story}")
    if count != n:
        raise RuntimeError(f"{story} has {count} rows, expected {n} (dbo.Story has fewer rows than expected?)")
    ctx.sql.exec(f"CREATE TABLE {ready} (Done BIT NOT NULL);")
    return story


def copy_of(ctx: Ctx, n: int, variant: str) -> str:
    """A private copy of lab.indexing__Story_<n> with its clustered PK. Rebuilt on every call, so a scenario
    always starts from clean data."""
    if variant not in VARIANTS:
        raise ValueError(f"variant must be one of {VARIANTS}, got '{variant}'")
    source = story_table(ctx, n)
    return ctx.sandbox_table(f"Story{variant}_{n}", source, primary_key=["StoryId"])


def sql_fingerprint(ctx: Ctx, table: str) -> dict[str, int]:
    row = ctx.sql.query(ctx.read("sql/dataset_fingerprint.sql").format(story=table))[0]
    return {k: int(v or 0) for k, v in row.items()}


def table_size(ctx: Ctx, table: str) -> list[dict[str, Any]] | None:
    """Rows and pages per index of `table`; None without VIEW DATABASE STATE."""
    try:
        return ctx.sql.query(ctx.read("sql/dataset_size.sql").format(story=table))
    except Exception:
        return None


def environment(ctx: Ctx) -> dict[str, Any]:
    return ctx.sql.query(ctx.read("sql/env_checks.sql"))[0]


# --- the same rows on the client -------------------------------------------------------------------
def source(ctx: Ctx) -> tuple[list[dict[str, Any]], int]:
    """(rows of dbo.Story, MAX(Author.UserId)): the input of the copy rules. Read-only."""
    rows = ctx.sql.query(f"SELECT {', '.join(copies.SOURCE_COLUMNS)} FROM dbo.Story ORDER BY StoryId")
    max_author = ctx.sql.scalar("SELECT MAX(UserId) FROM dbo.Author")
    return rows, int(max_author)


def rows(ctx: Ctx, n: int) -> list[dict[str, Any]]:
    """The n stories of lab.indexing__Story_<n>, generated on the client."""
    base, max_author = source(ctx)
    return copies.copy_rows(base, n, max_author)


# --- Redis -----------------------------------------------------------------------------------------
def story_prefix(ctx: Ctx, n: int) -> str:
    """Key prefix of the stories of size n, e.g. "lab:indexing:s1000:story:" (RediSearch PREFIX)."""
    return ctx.redis.key(f"s{n}", "story", "")


def story_key(ctx: Ctx, n: int, story_id: int) -> str:
    return ctx.redis.key(f"s{n}", "story", story_id)


def load_redis(ctx: Ctx, n: int) -> list[dict[str, Any]]:
    """Write the n Hashes once per run (not timed) and return the generated rows."""
    generated = rows(ctx, n)
    marker = ctx.redis.key(f"s{n}", "loaded")
    if ctx.redis.get(marker):
        return generated
    for i in range(0, len(generated), REDIS_BATCH):
        pipe = ctx.redis.pipeline(transaction=False)
        for row in generated[i:i + REDIS_BATCH]:
            pipe.hset(story_key(ctx, n, row["StoryId"]), mapping=copies.to_hash(row))
        pipe.execute()
    ctx.redis.set(marker, 1)
    return generated


def count_story_keys(ctx: Ctx, n: int) -> int:
    return sum(1 for _ in ctx.redis.iter_keys(f"s{n}:story:*"))


def drop_search_indexes(ctx: Ctx) -> list[str]:
    """Drop every RediSearch index of this topic (named lab:indexing:...). The Hashes are kept: the
    runner deletes the keys. Returns the dropped names ([] when RediSearch is not loaded)."""
    try:
        names = ctx.redis.execute_command("FT._LIST")
    except Exception:
        return []
    dropped = []
    for name in names:
        name = name.decode() if isinstance(name, bytes) else name
        if name.startswith(ctx.redis.prefix):
            ctx.redis.execute_command("FT.DROPINDEX", name)
            dropped.append(name)
    return dropped


def search_module(ctx: Ctx) -> str | None:
    """Version of the RediSearch module, or None when it is not loaded."""
    for module in ctx.redis.module_list():
        name = module.get("name") or module.get(b"name")
        if (name.decode() if isinstance(name, bytes) else name) == "search":
            ver = module.get("ver") or module.get(b"ver")
            return str(ver)
    return None
