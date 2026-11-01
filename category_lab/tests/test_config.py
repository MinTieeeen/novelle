from dataclasses import replace
from pathlib import Path

import pytest

from lab.config import ENV_FILES, EnvKey, RedisEnvKeys, load_config
from lab.env import ConfigError, EnvFiles, EnvSource
from lab.llm import LLM_PROVIDERS, GeminiConfig, LLMConfig, LLMKey
from lab.connections import split_batches


def write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


@pytest.fixture
def files(tmp_path: Path) -> EnvFiles:
    """The real committed defaults (novelle/.env.example) + a test novelle/.env."""
    local = write(tmp_path / ".env", "DB_HOST=rds.example\nMIGRATOR_PASSWORD=m1\nRO_PASSWORD=r1\n"
                                     "LAB_AWS_REDIS_PASSWORD=from-lab-env\nGEMINI_API_KEY=k\n"
                                     "LAB_SQL_PORT=\n")                       # empty line must not wipe the default
    return replace(ENV_FILES, local=local)


def test_defaults_come_from_env_example(files):
    cfg = load_config(environ={}, files=files)
    assert (cfg.sql.host, cfg.sql.port, cfg.sql.user, cfg.sql.password) == ("rds.example", 1433, "novelle_migrator", "m1")
    assert cfg.sql.driver == "ODBC Driver 18 for SQL Server" and cfg.sql.login_timeout == 15
    assert str(files.defaults) in cfg.sources and cfg.target == "local"


def test_password_is_picked_by_sql_login(files):
    ro = load_config(environ={EnvKey.SQL_USER: "novelle_readonly"}, files=files)
    assert ro.sql.password == "r1"
    with pytest.raises(ConfigError, match=EnvKey.SQL_PASSWORD):
        load_config(environ={EnvKey.SQL_USER: "someone_else"}, files=files)


def test_target_switches_only_redis(files):
    local = load_config("local", environ={}, files=files)
    aws = load_config("aws", environ={}, files=files)
    assert (local.redis.port, local.redis.password) == (6379, None)
    assert (aws.redis.port, aws.redis.password) == (16379, "from-lab-env")
    assert local.sql == aws.sql
    assert RedisEnvKeys("aws").port == "LAB_AWS_REDIS_PORT"


def test_environment_overrides_files(files):
    cfg = load_config(environ={RedisEnvKeys("local").host: "redis", EnvKey.DB_HOST: "other"}, files=files)
    assert (cfg.redis.host, cfg.sql.host) == ("redis", "other")


def test_llm_is_a_provider_subclass_built_from_its_prefix(files):
    llm = load_config(environ={}, files=files).llm
    assert isinstance(llm, GeminiConfig) and isinstance(llm, LLMConfig) and LLM_PROVIDERS["gemini"] is GeminiConfig
    assert llm.enabled and llm.api_key == "k" and llm.retry_delays_s == (5.0, 15.0, 40.0)
    assert llm.models[0] == llm.model and len(llm.models) == len(set(llm.models))
    assert GeminiConfig.env_keys().fallback_models == "GEMINI_FALLBACK_MODELS"

    custom = load_config(environ={"GEMINI_MODEL": "m", "GEMINI_FALLBACK_MODELS": "a, m ,b",
                                  "GEMINI_TEMPERATURE": "0.7"}, files=files).llm
    assert custom.models == ("m", "a", "b") and custom.temperature == 0.7

    with pytest.raises(ConfigError, match="not supported"):
        load_config(environ={LLMKey.PROVIDER: "other"}, files=files)
    with pytest.raises(ConfigError, match="GEMINI_TIMEOUT_S"):
        load_config(environ={"GEMINI_TIMEOUT_S": "soon"}, files=files)


def test_missing_values_raise(tmp_path: Path):
    nothing = EnvFiles(defaults=tmp_path / "none", local=tmp_path / "none")
    with pytest.raises(ConfigError, match="LAB_TARGET"):
        load_config(environ={}, files=nothing)
    with pytest.raises(ConfigError, match="DB_HOST"):
        load_config(environ={"MIGRATOR_PASSWORD": "x"}, files=replace(ENV_FILES, local=tmp_path / "none"))
    with pytest.raises(ConfigError, match="Unknown target"):
        load_config("prod", environ={}, files=nothing)
    assert EnvSource({"K": ""}, ()).optional("K") is None


def test_split_batches_on_go_lines():
    script = "SELECT 1;\nGO\n\nSELECT 2;\n  go -- next\nSELECT 'GO inside text';\nGO\n"
    assert split_batches(script) == ["SELECT 1;", "SELECT 2;", "SELECT 'GO inside text';"]
