from pathlib import Path

import pytest

from lab.config import ConfigError, load_config
from lab.connections import split_batches


def write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


@pytest.fixture
def env_files(tmp_path: Path) -> tuple[Path, Path]:
    backend = write(tmp_path / "backend.env",
                    "DB_HOST=rds.example\nMIGRATOR_PASSWORD=m1\nRO_PASSWORD=r1\n")
    lab = write(tmp_path / "lab.env", "LAB_TARGET=local\nLAB_AWS_REDIS_PASSWORD=from-lab-env\n")
    return backend, lab


def test_password_is_picked_by_sql_user(env_files):
    backend, lab = env_files
    cfg = load_config(environ={}, backend_env=backend, lab_env=lab)
    assert (cfg.sql.host, cfg.sql.user, cfg.sql.password) == ("rds.example", "novelle_migrator", "m1")

    ro = load_config(environ={"LAB_SQL_USER": "novelle_readonly"}, backend_env=backend, lab_env=lab)
    assert ro.sql.password == "r1"


def test_target_switches_only_redis(env_files):
    backend, lab = env_files
    local = load_config("local", environ={}, backend_env=backend, lab_env=lab)
    aws = load_config("aws", environ={}, backend_env=backend, lab_env=lab)
    assert (local.redis.port, local.redis.password) == (6379, None)
    assert (aws.redis.port, aws.redis.password) == (16379, "from-lab-env")
    assert local.sql == aws.sql


def test_environment_overrides_files(env_files):
    backend, lab = env_files
    cfg = load_config(environ={"LAB_LOCAL_REDIS_HOST": "redis", "DB_HOST": "other"},
                      backend_env=backend, lab_env=lab)
    assert (cfg.redis.host, cfg.sql.host) == ("redis", "other")


def test_missing_values_raise(tmp_path: Path):
    with pytest.raises(ConfigError, match="DB_HOST"):
        load_config(environ={"MIGRATOR_PASSWORD": "x"}, backend_env=tmp_path / "none", lab_env=tmp_path / "none")
    with pytest.raises(ConfigError, match="Unknown target"):
        load_config("prod", environ={}, backend_env=tmp_path / "none", lab_env=tmp_path / "none")


def test_split_batches_on_go_lines():
    script = "SELECT 1;\nGO\n\nSELECT 2;\n  go -- next\nSELECT 'GO inside text';\nGO\n"
    assert split_batches(script) == ["SELECT 1;", "SELECT 2;", "SELECT 'GO inside text';"]
