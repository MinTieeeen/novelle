# Docker cho Novelle

SQL Server **không chạy local**. Cả nhóm dùng chung AWS RDS (`NovelleDB`), thông tin kết nối nằm trong `novelle_backend/.env`. Schema và seed vẫn chạy bằng `novelle_backend/scripts/db-*.ps1|.sh`.

`docker-compose.yml` ở thư mục `novelle/` chỉ có:

| Service | Image | Port | Dùng để |
|---|---|---|---|
| `redis` | `redis/redis-stack:7.4.0-v3` | 6379, 8001 (RedisInsight) | Redis local có RediSearch + RedisJSON, AOF `everysec` giống Redis trên EC2 |
| `lab` (profile `lab`) | build từ `docker/lab/Dockerfile` | — | Python 3.12 + uv + ODBC Driver 18 + `sqlcmd` + `redis-cli` để chạy `category_lab` |

## Lần đầu

```bash
cd novelle
cp .env.example .env                      # đổi port nếu 6379/8001 đã bị chiếm
docker compose up -d                      # chạy redis
docker compose --profile lab build        # build image novelle-lab một lần
```

RedisInsight: <http://localhost:8001> (thêm database `redis:6379` hoặc `localhost:6379`).

## Chạy lệnh trong image lab

```bash
docker compose --profile lab run --rm lab bash                 # mở shell
docker compose --profile lab run --rm lab uv run lab check     # khi category_lab đã có CLI (phase F1)
```

Container mount cả thư mục `novelle/` vào `/workspace` và đứng ở `/workspace/category_lab`, nên code sửa trên Windows có hiệu lực ngay, không cần build lại. Mỗi lần khởi động, nếu đã có `category_lab/pyproject.toml` thì `uv sync` cài thư viện vào volume `/opt/venv`. Virtualenv Linux này tách khỏi `.venv` trên Windows.

Biến môi trường container nhận được:

| Biến | Giá trị | Nguồn |
|---|---|---|
| `DB_HOST`, `MIGRATOR_PASSWORD`, `RO_PASSWORD`, … | RDS | `novelle_backend/.env` |
| `GEMINI_API_KEY`, … | | `category_lab/.env` (không bắt buộc) |
| `LAB_LOCAL_REDIS_HOST/PORT` | `redis` / `6379` | compose |
| `LAB_AWS_REDIS_HOST/PORT` | `host.docker.internal` / `16379` | compose. Cần mở tunnel SSM trên máy host trước (`novelle_backend/scripts/aws-tunnel.*`) |

**Lưu ý với PowerShell 5.1:** khi truyền chuỗi cho `docker`, PowerShell xoá các dấu `"` nằm bên trong chuỗi `'...'`. Vì thế các lệnh dạng `sh -c '... "..." ...'` bên dưới chỉ chạy đúng trong Git Bash hoặc WSL. Trong PowerShell, hãy mở shell trong container (`docker compose --profile lab run --rm lab bash`) rồi gõ lệnh ở đó, hoặc viết mỗi dấu `"` bên trong thành `\"`.

Kiểm tra nhanh kết nối RDS từ container (Git Bash cần `MSYS_NO_PATHCONV=1`):

```bash
docker compose --profile lab run --rm lab sh -c \
  'sqlcmd -S "$DB_HOST,1433" -U novelle_readonly -P "$RO_PASSWORD" -d NovelleDB -C -Q "SELECT @@VERSION"'
```

## Dừng và dọn

```bash
docker compose down        # dừng, giữ dữ liệu Redis
docker compose down -v     # xoá luôn dữ liệu Redis, venv và cache uv
```
