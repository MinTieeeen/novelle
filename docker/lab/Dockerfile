# Python toolbox for category_lab: talks to SQL Server on AWS RDS (pyodbc + ODBC Driver 18, sqlcmd)
# and to Redis (redis-py, redis-cli). Python packages themselves are installed by uv from
# category_lab/pyproject.toml when the container starts (see entrypoint.sh).
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    ACCEPT_EULA=Y \
    PATH="/opt/mssql-tools18/bin:/opt/venv/bin:${PATH}" \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1

# Microsoft package repository for Debian 12 -> msodbcsql18 (ODBC driver) and mssql-tools18 (sqlcmd, bcp).
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl gnupg ca-certificates \
 && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
 && curl -fsSL https://packages.microsoft.com/config/debian/12/prod.list -o /etc/apt/sources.list.d/mssql-release.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends msodbcsql18 mssql-tools18 unixodbc redis-tools \
 && apt-get purge -y gnupg && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# uv: Python package and project manager (pinned version).
COPY --from=ghcr.io/astral-sh/uv:0.8.4 /uv /uvx /usr/local/bin/

COPY entrypoint.sh /usr/local/bin/lab-entrypoint
# Strip Windows line endings in case the file was checked out with CRLF.
RUN sed -i 's/\r$//' /usr/local/bin/lab-entrypoint && chmod +x /usr/local/bin/lab-entrypoint

WORKDIR /workspace/category_lab
ENTRYPOINT ["lab-entrypoint"]
CMD ["bash"]
