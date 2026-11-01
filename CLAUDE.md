# CLAUDE.md

Guidance for Claude Code in the **Novelle** repository (HK261 DBMS assignment, group of 5). This file holds the rules shared by the whole repository. Each part has its own file with the details:

| Part | Guide | Human README |
|---|---|---|
| Backend (Spring Boot) | [novelle_backend/CLAUDE.md](novelle_backend/CLAUDE.md) | [novelle_backend/README.md](novelle_backend/README.md) |
| Frontend (React) | [novelle_frontend/CLAUDE.md](novelle_frontend/CLAUDE.md) | [novelle_frontend/README.md](novelle_frontend/README.md) |
| DBMS Lab (Python) | [category_lab/CLAUDE.md](category_lab/CLAUDE.md) | [category_lab/README.md](category_lab/README.md) |
| Docker | — | [docker/README.md](docker/README.md) |

## Communication

- Answer the user in **Vietnamese**. Code, comments, commit messages and repository docs stay in **English** (except `docker/README.md`, which is Vietnamese).
- Build large pieces **phase by phase**: stop after each phase and explain what was built and which techniques were used.
- Never print secrets (passwords, API keys, hashes) from `.env` in tool output or replies; check only whether a key is set.

## Project

Novelle is a web platform for reading and writing user-authored serialized stories. **SQL Server is the system of record; Redis** handles caching, view counters, draft autosave, sessions, rate limiting and locks. Two deliverables:

1. **Web app**: `novelle_backend` (Spring Boot) + `novelle_frontend` (React).
2. **DBMS Lab**: `category_lab` (Python), which compares SQL Server and Redis behaviour topic by topic.

Specification (outside this repo, in `../docs/`): `data-dictionary.md` (tables, business rules RB1–RB16, Redis keys; the source of truth), `deploy-aws.md`, `Assignment_HK261_L01.md`, `erd/`.

### Scope (decided)

- 13 features F1–F13, 18 tables. Roles: `READER` (default; can request authorship), `AUTHOR` (approved by an admin, permanent, writes stories and keeps all reader features), `ADMIN` (manages users and content, does not write). No MOD role.
- **Out of scope:** coin wallet, top-up, VIP, donations, nomination votes, rankings, notifications, comments, violation reports.
- **Mock data only.** Never import the AS-IS book data (`../book-data-20260928`). `../StoryWeb_AS_IS` is a reference for field naming only.
- Transaction and concurrency demos use: `sp_PublishChapter`, `sp_ApproveAuthorRequest` (two admins racing), rating hot-row updates, view counters, chapter `ROWVERSION` edits.

## Infrastructure

- **SQL Server = AWS RDS only** (SQL Server 2019 Express, free tier, t3.micro, public access). **Never add a local SQL Server container.** Database `NovelleDB`; logins `novelle_migrator` (DDL), `novelle_app` (application), `novelle_readonly`.
- **Redis:** locally the `redis` service in `docker-compose.yml` (Redis Stack 7.4, AOF everysec); on AWS, Redis Stack on the EC2 SSM bastion, reached through a tunnel on `localhost:16379`. No ElastiCache.
- Backend and frontend are **not deployed**; they run locally against RDS.
- The RDS instance is shared by the team: do not run schema scripts, `--reset`, seed reset, `--allow-destructive` lab runs or destructive demo scripts without asking the user first.

## Configuration: one settings file

- The backend scripts, the backend app, docker compose and the lab all read **`novelle/.env`** (gitignored). The template `novelle/.env.example` is committed and holds every non-secret default. A new setting is added to the template with its default; never put defaults or secrets in code or config files.
- Never modify or delete `novelle/.env`; ask the user to edit it.

## Repository layout

```
novelle/
├─ CLAUDE.md            this file
├─ .env.example         settings template (copy to .env)
├─ docker-compose.yml   redis (+ lab image, profile "lab")
├─ docker/              lab Dockerfile, docker README
├─ novelle_backend/     Spring Boot API, database/ SQL scripts, scripts/ runners
├─ novelle_frontend/    React SPA (README only so far)
└─ category_lab/        DBMS Lab (Python)
```

## Git

- Remote `MinTieeeen/novelle`. Work on `dev` or a feature branch (e.g. `category_lab`), merge by PR into `master`.
- Commit or push only when the user asks.
- Do not add `.gitkeep` files to make empty folders appear; folders reach git with their first real file (the lab's `topics/_template/sql/.gitkeep` is the one intended exception).

## When docs disagree

Trust, in order: the actual code and SQL scripts, the `CLAUDE.md` files, then the READMEs. Some README sections describe older decisions (see the part guides).
