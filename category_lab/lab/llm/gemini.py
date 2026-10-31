"""Google Gemini settings. Variables: GEMINI_* in .env.example. The API client is gemini_client.py."""
from __future__ import annotations

from dataclasses import dataclass
from typing import ClassVar

from lab.llm.base import LLMConfig


@dataclass(frozen=True)
class GeminiConfig(LLMConfig):
    provider: ClassVar[str] = "gemini"
    env_prefix: ClassVar[str] = "GEMINI"
    display_name: ClassVar[str] = "Gemini"

    @property
    def key_url(self) -> str:
        return "https://aistudio.google.com/apikey"
