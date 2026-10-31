"""Which providers exist, and building the one LLM_PROVIDER names.

To add a provider: a module next to gemini.py with an LLMConfig subclass, one entry below, its
<PREFIX>_* keys in .env.example, and its client module (like gemini_client.py) in clients.py.
"""
from __future__ import annotations

from typing import Mapping

from lab.env import ConfigError, EnvSource
from lab.llm.base import LLMConfig, LLMKey
from lab.llm.gemini import GeminiConfig

LLM_PROVIDERS: Mapping[str, type[LLMConfig]] = {GeminiConfig.provider: GeminiConfig}


def llm_from_env(env: EnvSource) -> LLMConfig:
    name = env.text(LLMKey.PROVIDER).lower()
    provider = LLM_PROVIDERS.get(name)
    if provider is None:
        raise ConfigError(f"{LLMKey.PROVIDER}={name!r} is not supported; available: {', '.join(LLM_PROVIDERS)}")
    return provider.from_env(env)
