"""Reading settings from layered .env files. No lab-specific keys here: lab/config.py and lab/llm use it.

Layers, lowest priority first (see EnvFiles): the committed .env.example with every default, the
backend's .env with the RDS credentials, the lab's .env with secrets/overrides, then real environment
variables. An empty value ("KEY=") counts as not set, so it never wipes a default from a lower layer.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from dotenv import dotenv_values


class ConfigError(RuntimeError):
    """A required setting is missing or invalid."""


@dataclass(frozen=True)
class EnvFiles:
    """The .env layers, lowest priority first."""
    defaults: Path
    backend: Path
    lab: Path

    def layers(self) -> tuple[Path, ...]:
        return self.defaults, self.backend, self.lab


@dataclass(frozen=True)
class EnvSource:
    """Merged .env values with typed, validated accessors. Empty values count as not set."""
    values: Mapping[str, str]
    files: tuple[str, ...]

    @classmethod
    def load(cls, files: EnvFiles, environ: Mapping[str, str] | None = None) -> "EnvSource":
        def non_empty(values: Mapping[str, str | None]) -> dict[str, str]:
            # an empty line ("KEY=") in a higher layer must not wipe the default of a lower one
            return {k: v.strip() for k, v in values.items() if v is not None and v.strip()}

        merged: dict[str, str] = {}
        found: list[str] = []
        for path in files.layers():
            if path.is_file():
                merged.update(non_empty(dotenv_values(path)))
                found.append(str(path))
        merged.update(non_empty(os.environ if environ is None else environ))
        return cls(merged, tuple(found))

    def optional(self, key: str) -> str | None:
        return self.values.get(key) or None

    def text(self, key: str) -> str:
        value = self.optional(key)
        if value is None:
            raise ConfigError(f"{key} is not set: add it to category_lab/.env (all keys and defaults are in "
                              f"category_lab/.env.example; RDS settings go in novelle_backend/.env)")
        return value

    def integer(self, key: str) -> int:
        return int(self._number(key, int))

    def decimal(self, key: str) -> float:
        return float(self._number(key, float))

    def _number(self, key: str, kind: type) -> int | float:
        raw = self.text(key)
        try:
            return kind(raw)
        except ValueError as exc:
            raise ConfigError(f"{key}={raw!r} is not a valid {kind.__name__}") from exc

    def items(self, key: str) -> tuple[str, ...]:
        """Comma-separated list; an unset key is an empty list."""
        return tuple(p.strip() for p in (self.optional(key) or "").split(",") if p.strip())

    def decimals(self, key: str) -> tuple[float, ...]:
        try:
            return tuple(float(p) for p in self.items(key))
        except ValueError as exc:
            raise ConfigError(f"{key} must be comma-separated numbers") from exc
