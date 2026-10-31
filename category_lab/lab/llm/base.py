"""What every LLM provider's configuration has. A provider is a subclass in its own module (gemini.py).

A provider's variables are <env_prefix>_API_KEY, _MODEL, _FALLBACK_MODELS, _TEMPERATURE, _TIMEOUT_S and
_RETRY_DELAYS_S; the LLM_* keys (LLMKey) are shared by all providers. Defaults are in .env.example.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum
from typing import ClassVar

from lab.env import EnvSource


class LLMKey(StrEnum):
    """Variables shared by all providers."""
    PROVIDER = "LLM_PROVIDER"
    MAX_STATEMENT_CHARS = "LLM_MAX_STATEMENT_CHARS"
    MAX_PLAN_CHARS = "LLM_MAX_PLAN_CHARS"


@dataclass(frozen=True)
class LLMEnvKeys:
    """<PREFIX>_<FIELD> for one provider, e.g. GEMINI_API_KEY."""
    prefix: str

    def _key(self, field: str) -> str:
        return f"{self.prefix}_{field}"

    @property
    def api_key(self) -> str: return self._key("API_KEY")
    @property
    def model(self) -> str: return self._key("MODEL")
    @property
    def fallback_models(self) -> str: return self._key("FALLBACK_MODELS")
    @property
    def temperature(self) -> str: return self._key("TEMPERATURE")
    @property
    def timeout_s(self) -> str: return self._key("TIMEOUT_S")
    @property
    def retry_delays_s(self) -> str: return self._key("RETRY_DELAYS_S")


@dataclass(frozen=True)
class LLMConfig(ABC):
    """Settings every provider has. A subclass sets `provider`, `env_prefix`, `display_name` and
    implements `key_url`; reading the .env is done here once for all providers."""
    provider: ClassVar[str]
    env_prefix: ClassVar[str]
    display_name: ClassVar[str]

    api_key: str | None
    model: str
    fallback_models: tuple[str, ...]
    temperature: float
    timeout_s: float
    retry_delays_s: tuple[float, ...]       # waits between retries of an overloaded model (429/5xx)
    max_statement_chars: int
    max_plan_chars: int

    @property
    @abstractmethod
    def key_url(self) -> str:
        """Where to get an API key, shown when it is missing."""

    @classmethod
    def env_keys(cls) -> LLMEnvKeys:
        return LLMEnvKeys(cls.env_prefix)

    @classmethod
    def from_env(cls, env: EnvSource) -> "LLMConfig":
        keys = cls.env_keys()
        return cls(api_key=env.optional(keys.api_key), model=env.text(keys.model),
                   fallback_models=env.items(keys.fallback_models), temperature=env.decimal(keys.temperature),
                   timeout_s=env.decimal(keys.timeout_s), retry_delays_s=env.decimals(keys.retry_delays_s),
                   max_statement_chars=env.integer(LLMKey.MAX_STATEMENT_CHARS),
                   max_plan_chars=env.integer(LLMKey.MAX_PLAN_CHARS))

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    @property
    def models(self) -> tuple[str, ...]:
        """Main model first, then the fallbacks, without duplicates."""
        return tuple(dict.fromkeys((self.model, *self.fallback_models)))
