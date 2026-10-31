#!/bin/sh
# Installs/updates the category_lab Python dependencies into /opt/venv (a Docker volume), then runs
# the given command. Before category_lab has a pyproject.toml this step is skipped.
set -e
if [ -f pyproject.toml ]; then
    uv sync --quiet
fi
exec "$@"
