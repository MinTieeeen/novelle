"""Looks inside Redis: how a key is stored and what the server is doing.

key_info(client, key)   type, internal encoding (listpack / hashtable / skiplist / embstr / ...), bytes used
                        (MEMORY USAGE, includes the key and Redis overhead), number of elements, TTL
memory(client)          INFO memory: used memory, dataset size, fragmentation, eviction policy
persistence(client)     INFO persistence: AOF/RDB state, last save, rewrite status
encoding_thresholds     the config values that decide when a small encoding is converted to a big one
"""
from __future__ import annotations

from typing import Any

from lab.connections import RedisClient

_LENGTH = {"string": "strlen", "hash": "hlen", "list": "llen", "set": "scard", "zset": "zcard",
           "stream": "xlen"}


def key_info(client: RedisClient, key: str) -> dict[str, Any]:
    raw = client.raw
    kind = raw.type(key)
    if kind == "none":
        raise KeyError(f"key '{key}' does not exist")
    length = getattr(raw, _LENGTH[kind])(key) if kind in _LENGTH else None
    if kind == "ReJSON-RL":                                  # RedisJSON documents
        kind, length = "json", None
    return {"key": key, "type": kind, "encoding": raw.object("encoding", key),
            "memory_bytes": raw.memory_usage(key, samples=0), "length": length, "ttl_s": raw.ttl(key)}


def namespace_memory(client: RedisClient, pattern: str = "*") -> dict[str, Any]:
    """Total MEMORY USAGE of the keys of the client's namespace (exact, key by key)."""
    total = count = 0
    for key in client.iter_keys(pattern):
        total += client.raw.memory_usage(key, samples=0) or 0
        count += 1
    return {"keys": count, "memory_bytes": total}


def memory(client: RedisClient) -> dict[str, Any]:
    info = client.raw.info("memory")
    keep = ("used_memory", "used_memory_human", "used_memory_dataset", "used_memory_overhead",
            "used_memory_peak_human", "mem_fragmentation_ratio", "maxmemory_human", "maxmemory_policy",
            "mem_allocator")
    return {k: info.get(k) for k in keep}


def persistence(client: RedisClient) -> dict[str, Any]:
    info = client.raw.info("persistence")
    keep = ("aof_enabled", "aof_rewrite_in_progress", "aof_last_rewrite_time_sec", "aof_current_size",
            "aof_last_bgrewrite_status", "rdb_changes_since_last_save", "rdb_last_save_time",
            "rdb_last_bgsave_status", "rdb_last_bgsave_time_sec", "loading")
    return {k: info.get(k) for k in keep}


def encoding_thresholds(client: RedisClient) -> dict[str, str]:
    names = ("hash-max-listpack-entries", "hash-max-listpack-value", "zset-max-listpack-entries",
             "zset-max-listpack-value", "set-max-intset-entries", "set-max-listpack-entries",
             "list-max-listpack-size")
    out: dict[str, str] = {}
    for name in names:
        out.update(client.raw.config_get(name))
    return out
