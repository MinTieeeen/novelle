# CLAUDE.md: category_lab

DBMS Lab: runs per-topic scenarios on SQL Server (AWS RDS) and Redis, compares the results and builds an HTML report with LLM commentary. Repository-wide rules are in [../CLAUDE.md](../CLAUDE.md); the topic-author guide is [README.md](README.md).

## Stack

Python 3.12, uv (`pyproject.toml`, `uv.lock`), Typer + Rich (CLI `lab`), pyodbc (ODBC Driver 18), redis-py, pydantic, python-dotenv, Jinja2 + markdown (report), google-genai (Gemini). Tests: pytest.

## Running

Run inside the lab image (it has ODBC Driver 18, sqlcmd, redis-cli, uv); from `novelle/`:

```bash
docker compose up -d                                        # Redis
docker compose --profile lab run --rm lab uv run lab check  # connections, permissions, Gemini key
docker compose --profile lab run --rm lab uv run lab run <topic|all> [--dbms sqlserver|redis] [--target aws]
docker compose --profile lab run --rm lab uv run lab report [--latest-per-topic] [--no-llm]
docker compose --profile lab run --rm lab uv run pytest
```

Other commands: `lab config`, `lab list`, `lab scaffold t<n>_<id> --owner "Name"`, `lab clean <topic|all>`. `--allow-destructive` and runs against the shared RDS that change data need the user's approval.

## Configuration

- Layers: `novelle/.env.example` (all non-secret defaults) → `novelle/.env` → real environment. No defaults in code.
- SQL login `LAB_SQL_USER` (default `novelle_migrator`, needed for DDL on `lab.*` sandbox tables); the password is picked by login name from `MIGRATOR_PASSWORD` / `APP_PASSWORD` / `RO_PASSWORD` unless `LAB_SQL_PASSWORD` is set.
- `--target local|aws` (default `LAB_TARGET`) switches **Redis only**: `LAB_LOCAL_REDIS_*` (compose; host `redis` inside the container) or `LAB_AWS_REDIS_*` (tunnel on the host, `host.docker.internal:16379`). SQL Server is always RDS.

## Code layout

```
lab/
├─ cli.py, config.py, env.py, connections.py, checks.py, maintenance.py, views.py
├─ framework/   scenario decorator + registry, runner, bench, concurrency, compare, fixtures,
│               sqlserver_probe / redis_probe (plans, stats), result models
├─ llm/         LLMConfig base, GeminiConfig, registry, gemini_client, clients.client_for,
│               prompts/commentary.md
└─ report/      loader, builder, charts, Jinja2 templates, static css/js
topics/
├─ t0_example/  reference topic
├─ _template/   copied by `lab scaffold` (do not edit)
└─ t<n>_<id>/   __init__.py (metadata), sqlserver.py, redis.py, sql/*.sql, NOTES.md
tests/          pytest for config, framework, probes, report, gemini
results/, reports/   generated output, not committed
```

## Rules

- Topic authors edit **only their own topic folder**. Changes to `lab/` (shared core) are for the team lead; keep them backwards compatible with existing topics.
- Scenarios come in pairs: one in `sqlserver.py`, one in `redis.py`, linked by the same `pair` key.
- SQL used by scenarios goes in the topic's `sql/*.sql` files.
- Sandbox objects are named `lab.<topic>__*` (tables) and `lab:<topic>:*` (keys) so `lab clean` can remove them.
- **No local-only SQL scenarios**: no `DBCC DROPCLEANBUFFERS`, no `BACKUP TO DISK`, nothing needing `sysadmin`. Backup topics use `rds_backup_database` / point-in-time restore. Never add a local SQL Server container.
- Gemini: on 429 (quota) or 404 (model unavailable) switch immediately to the next model in `GEMINI_FALLBACK_MODELS`; retry overloaded models (5xx) after `GEMINI_RETRY_DELAYS_S`. The prompt lives in `lab/llm/prompts/commentary.md`.
- New settings: add the key with its default to `novelle/.env.example`, read it in `lab/config.py`.
- Add or update pytest tests when changing `lab/`.
