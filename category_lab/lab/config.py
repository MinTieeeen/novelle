"""Lab configuration: where SQL Server (always AWS RDS) and Redis (local or aws) are.

Values come from three places, highest priority first:
  1. real environment variables (docker compose sets some of them for the lab container)
  2. category_lab/.env          lab settings, Gemini key
  3. novelle_backend/.env       DB_HOST and the RDS passwords, shared with the backend scripts

`--target` only switches Redis: SQL Server is the shared RDS instance in both cases.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Mapping

from dotenv import dotenv_values

LAB_DIR = Path(__file__).resolve().parent.parent          # novelle/category_lab
BACKEND_ENV = LAB_DIR.parent / "novelle_backend" / ".env"
LAB_ENV = LAB_DIR / ".env"

Target = Literal["local", "aws"]
TARGETS: tuple[Target, ...] = ("local", "aws")

# Which variable of novelle_backend/.env holds the password of each login (see 01_create_logins_users.sql).
PASSWORD_VAR_BY_USER = {
    "novelle_migrator": "MIGRATOR_PASSWORD",
    "novelle_app": "APP_PASSWORD",
    "novelle_readonly": "RO_PASSWORD",
}


class ConfigError(RuntimeError):
    """A required setting is missing or invalid."""


@dataclass(frozen=True)
class SqlServerConfig:
    host: str
    port: int
    database: str
    user: str
    password: str
    driver: str
    login_timeout: int = 15

    def connection_string(self) -> str:
        # RDS uses a certificate the client does not trust by default; same as `sqlcmd -C`.
        return (
            f"DRIVER={{{self.driver}}};SERVER={self.host},{self.port};DATABASE={self.database};"
            f"UID={self.user};PWD={{{self.password}}};Encrypt=yes;TrustServerCertificate=yes;"
            "APP=novelle-category-lab"
        )


@dataclass(frozen=True)
class RedisConfig:
    target: Target
    host: str
    port: int
    password: str | None
    db: int = 0


@dataclass(frozen=True)
class LabConfig:
    target: Target
    sql: SqlServerConfig
    redis: RedisConfig
    gemini_api_key: str | None
    gemini_model: str
    sources: tuple[str, ...]        # .env files that were found, for `lab config`


def load_env(environ: Mapping[str, str] | None = None,
             backend_env: Path = BACKEND_ENV, lab_env: Path = LAB_ENV) -> tuple[dict[str, str], list[str]]:
    """Merge the two .env files and the process environment (later sources win)."""
    merged: dict[str, str] = {}
    sources: list[str] = []
    for path in (backend_env, lab_env):
        if path.is_file():
            merged.update({k: v for k, v in dotenv_values(path).items() if v is not None})
            sources.append(str(path))
    merged.update(os.environ if environ is None else environ)
    return {k: v.strip() for k, v in merged.items()}, sources


def load_config(target: str | None = None, environ: Mapping[str, str] | None = None,
                backend_env: Path = BACKEND_ENV, lab_env: Path = LAB_ENV) -> LabConfig:
    env, sources = load_env(environ, backend_env, lab_env)

    def get(name: str, default: str | None = None) -> str | None:
        value = env.get(name)
        return value if value else default

    def require(name: str, hint: str) -> str:
        value = get(name)
        if not value:
            raise ConfigError(f"{name} is not set ({hint})")
        return value

    chosen = (target or get("LAB_TARGET", "local")).lower()
    if chosen not in TARGETS:
        raise ConfigError(f"Unknown target '{chosen}', expected one of: {', '.join(TARGETS)}")

    user = get("LAB_SQL_USER", "novelle_migrator")
    password = get("LAB_SQL_PASSWORD")
    if not password:
        var = PASSWORD_VAR_BY_USER.get(user)
        if var is None:
            raise ConfigError(f"LAB_SQL_PASSWORD is required for SQL user '{user}'")
        password = require(var, f"password of {user}, expected in {BACKEND_ENV}")

    sql = SqlServerConfig(
        host=require("DB_HOST", f"RDS endpoint, expected in {BACKEND_ENV}"),
        port=int(get("LAB_SQL_PORT", "1433")),
        database=get("LAB_SQL_DATABASE", "NovelleDB"),
        user=user,
        password=password,
        driver=get("LAB_ODBC_DRIVER", "ODBC Driver 18 for SQL Server"),
    )

    prefix = f"LAB_{chosen.upper()}_REDIS_"
    redis = RedisConfig(
        target=chosen,  # type: ignore[arg-type]
        host=get(prefix + "HOST", "localhost"),
        port=int(get(prefix + "PORT", "6379" if chosen == "local" else "16379")),
        password=get(prefix + "PASSWORD") or (get("REDIS_PASSWORD") if chosen == "aws" else None),
        db=int(get(prefix + "DB", "0")),
    )

    return LabConfig(
        target=chosen,  # type: ignore[arg-type]
        sql=sql,
        redis=redis,
        gemini_api_key=get("GEMINI_API_KEY"),
        gemini_model=get("GEMINI_MODEL", "gemini-2.5-flash"),
        sources=tuple(sources),
    )


def mask(secret: str | None) -> str:
    return "******" if secret else "(not set)"
