"""Chooses the client module of the configured LLM provider, so the CLI and `lab check` never name one.

Every client module offers the same two functions:
    generate(topics, env, results_dir, llm, *, refresh, progress) -> GenerateResult
    check_key(llm) -> str           (model display name; raises when the key or model cannot generate)
To add a provider: its config (like gemini.py) and registry entry, its client (like gemini_client.py),
and one branch below. Clients are imported lazily: their SDKs are only needed by `lab report`/`lab check`.
"""
from __future__ import annotations

from types import ModuleType

from lab.env import ConfigError
from lab.llm.base import LLMConfig
from lab.llm.gemini import GeminiConfig


def client_for(llm: LLMConfig) -> ModuleType:
    if isinstance(llm, GeminiConfig):
        from lab.llm import gemini_client
        return gemini_client
    raise ConfigError(f"no client module for LLM provider '{llm.provider}'")
