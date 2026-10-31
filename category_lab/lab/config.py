"""Lab configuration: SQL Server (always AWS RDS), Redis (local or aws) and the LLM used by `lab report`.

Every setting lives in ONE file shared by the whole project, novelle/.env (backend scripts, docker
compose and the lab all read it); no value is hard-coded here. Layers, highest priority first:
  1. real environment variables   docker compose sets some of them for the lab container
  2. novelle/.env                  secrets (RDS passwords, GEMINI_API_KEY) and local values
  3. novelle/.env.example          committed template: every key with its default (non-secret) value
So a key added to .env.example works for everyone at once.

Where things are:
  lab/env.py    reading the .env layers (EnvSource), ConfigError
  lab/config.py SQL Server and Redis settings, LabConfig, load_config        (this file)
  lab/llm/      LLM settings: base class, one module per provider (gemini.py), registry
`--target` only switches Redis: SQL Server is the shared RDS instance in both cases.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Literal, Mapping

from lab.env import ConfigError, EnvFiles, EnvSource
from lab.llm import LLMConfig, llm_from_env

__all__ = ["ConfigError", "EnvFiles", "EnvSource", "ENV_FILES", "EnvKey", "LAB_DIR", "LabConfig",
           "RedisConfig", "RedisEnvKeys", "SqlServerConfig", "TARGETS", "Target", "load_config", "mask"]

LAB_DIR = Path(__file__).resolve().parent.parent          # novelle/category_lab

Target = Literal["local", "aws"]
TARGETS: tuple[Target, ...] = ("local", "aws")

PROJECT_DIR = LAB_DIR.parent                              # novelle
ENV_FILES = EnvFiles(defaults=PROJECT_DIR / ".env.example", local=PROJECT_DIR / ".env")


class EnvKey(StrEnum):
    """Names of the lab variables that are not per Redis target (LLM keys live in lab/llm)."""
    TARGET = "LAB_TARGET"
    DB_HOST = "DB_HOST"
    SQL_USER = "LAB_SQL_USER"
    SQL_PASSWORD = "LAB_SQL_PASSWORD"                # optional override of the per-login password below
    SQL_PORT = "LAB_SQL_PORT"
    SQL_DATABASE = "LAB_SQL_DATABASE"
    ODBC_DRIVER = "LAB_ODBC_DRIVER"
    SQL_LOGIN_TIMEOUT_S = "LAB_SQL_LOGIN_TIMEOUT_S"
    SQL_APP_NAME = "LAB_SQL_APP_NAME"


# Which variable of novelle/.env holds the password of each login (see 01_create_logins_users.sql).
SQL_PASSWORD_KEY_BY_LOGIN: Mapping[str, str] = {
    "novelle_migrator": "MIGRATOR_PASSWORD",
    "novelle_app": "APP_PASSWORD",
    "novelle_readonly": "RO_PASSWORD",
}


@dataclass(frozen=True)
class RedisEnvKeys:
    """LAB_<TARGET>_REDIS_<FIELD> for one Redis target."""
    target: str

    def _key(self, field: str) -> str:
        return f"LAB_{self.target.upper()}_REDIS_{field}"

    @property
    def host(self) -> str: return self._key("HOST")
    @property
    def port(self) -> str: return self._key("PORT")
    @property
    def password(self) -> str: return self._key("PASSWORD")
    @property
    def db(self) -> str: return self._key("DB")


@dataclass(frozen=True)
class SqlServerConfig:
    host: str
    port: int
    database: str
    user: str
    password: str
    driver: str
    login_timeout: int
    app_name: str

    @classmethod
    def from_env(cls, env: EnvSource) -> "SqlServerConfig":
        user = env.text(EnvKey.SQL_USER)
        password = env.optional(EnvKey.SQL_PASSWORD)
        if password is None:
            key = SQL_PASSWORD_KEY_BY_LOGIN.get(user)
            if key is None:
                raise ConfigError(f"{EnvKey.SQL_PASSWORD} is required for SQL login '{user}'")
            password = env.text(key)
        return cls(host=env.text(EnvKey.DB_HOST), port=env.integer(EnvKey.SQL_PORT),
                   database=env.text(EnvKey.SQL_DATABASE), user=user, password=password,
                   driver=env.text(EnvKey.ODBC_DRIVER), login_timeout=env.integer(EnvKey.SQL_LOGIN_TIMEOUT_S),
                   app_name=env.text(EnvKey.SQL_APP_NAME))

    def connection_string(self) -> str:
        # RDS uses a certificate the client does not trust by default; same as `sqlcmd -C`.
        return (
            f"DRIVER={{{self.driver}}};SERVER={self.host},{self.port};DATABASE={self.database};"
            f"UID={self.user};PWD={{{self.password}}};Encrypt=yes;TrustServerCertificate=yes;"
            f"APP={self.app_name}"
        )


@dataclass(frozen=True)
class RedisConfig:
    target: Target
    host: str
    port: int
    password: str | None
    db: int

    @classmethod
    def from_env(cls, env: EnvSource, target: Target) -> "RedisConfig":
        keys = RedisEnvKeys(target)
        return cls(target=target, host=env.text(keys.host), port=env.integer(keys.port),
                   password=env.optional(keys.password), db=env.integer(keys.db))


@dataclass(frozen=True)
class LabConfig:
    target: Target
    sql: SqlServerConfig
    redis: RedisConfig
    llm: LLMConfig
    sources: tuple[str, ...]        # .env files that were found, for `lab config`


def load_config(target: str | None = None, environ: Mapping[str, str] | None = None,
                files: EnvFiles = ENV_FILES) -> LabConfig:
    env = EnvSource.load(files, environ)
    chosen = (target or env.text(EnvKey.TARGET)).lower()
    if chosen not in TARGETS:
        raise ConfigError(f"Unknown target '{chosen}', expected one of: {', '.join(TARGETS)}")
    return LabConfig(target=chosen, sql=SqlServerConfig.from_env(env),  # type: ignore[arg-type]
                     redis=RedisConfig.from_env(env, chosen),             # type: ignore[arg-type]
                     llm=llm_from_env(env), sources=env.files)


def mask(secret: str | None) -> str:
    return "******" if secret else "(not set)"
