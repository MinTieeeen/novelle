# Novelle DBMS Lab (`category_lab`)

Chạy các thí nghiệm theo topic của bài tập lớn trên **SQL Server (AWS RDS)** và **Redis**, đo kết quả và so sánh hai DBMS.

Trạng thái: **phase F5, khung đã hoàn chỉnh**. Có `config`, `check`, `list`, `run`, `scaffold`, `clean`, `report` (HTML kèm nhận xét Gemini) và topic mẫu `topics/t0_example`.

## Report HTML

```bash
uv run lab report                          # report của lần chạy mới nhất -> reports/<runId>.html
uv run lab report 20261030-175654-example-local
uv run lab report --latest-per-topic --target aws --out reports/team.html   # report chung của nhóm
```

- Mỗi report là **một file HTML duy nhất**: CSS, JS và biểu đồ SVG đều được nhúng sẵn, nên mở được offline và đính kèm vào file ZIP nộp bài. In ra PDF được (khi in, các phần thu gọn tự mở ra).
- `--latest-per-topic` gộp **kết quả mới nhất của từng scenario** qua mọi lần chạy, nên mỗi thành viên chạy topic của mình riêng mà vẫn ra một report chung. Một lần chạy bị `skipped` không che kết quả thật trước đó, và topic đã bị xoá khỏi `topics/` sẽ bị bỏ qua. Nên luôn kèm `--target` để không trộn số đo Redis local với aws.
- Nội dung: tổng quan (số scenario đạt / lỗi), môi trường và cách đo, bảng tổng hợp mọi cặp; rồi với từng topic: câu hỏi nghiên cứu, chỗ dành cho nhận xét AI, từng cặp gồm biểu đồ `server_ms` (thanh là p50, vạch kéo tới p95, rê chuột hoặc Tab để xem chi tiết), bảng số liệu, metric so sánh, check, nhận xét, plan và các bằng chứng khác, cuối cùng là `NOTES.md`.
- **Nhận xét AI (Gemini)**: mỗi topic gọi Gemini **một lần**. Nhận xét riêng của từng scenario nằm trong tab SQL Server / Redis của cặp; nhận xét so sánh hai DBMS (trả lời câu hỏi nghiên cứu, khuyến nghị cho Novelle, lưu ý về phép đo) nằm cuối mỗi topic.
  - Cần `GEMINI_API_KEY` trong `category_lab/.env`; `lab check` gọi thử key. Model: `GEMINI_MODEL` (mặc định `gemini-3.8-flash`). Khi model quá tải (429/503), lab thử lại rồi chuyển sang `GEMINI_FALLBACK_MODELS`. Nếu tất cả đều lỗi, report dùng nhận xét lần trước (có ghi chú) hoặc ghi rõ lỗi, report vẫn được tạo.
  - Kết quả được cache trong `results/.llm-cache/`. Tạo lại report khi số liệu không đổi thì không tốn request. `--refresh-llm` hỏi lại, `--no-llm` bỏ hẳn phần AI.
  - Prompt nằm ở [`lab/llm/prompts/commentary.md`](lab/llm/prompts/commentary.md), sửa trực tiếp file đó (sửa xong, lần chạy sau tự hỏi lại vì cache key gồm cả prompt).
  - Chỉ số liệu, câu lệnh, nhận xét và tóm tắt plan được gửi đi; không gửi host, user, mật khẩu. Nhận xét AI cần đối chiếu với nhận xét của thành viên trước khi đưa vào báo cáo.
- Có sẵn dark mode (theo hệ điều hành, hoặc bấm nút "Giao diện").

## Bắt đầu topic của bạn

```bash
# trong container lab (docker compose --profile lab run --rm lab bash)
uv run lab scaffold t5_concurrency --owner "Nguyễn Văn A" --title "Concurrency control"
uv run lab run concurrency              # chạy được ngay với scenario mẫu, rồi sửa dần
uv run lab run concurrency --keep       # giữ bảng lab.concurrency__* và key lab:concurrency:* để xem lại
uv run lab clean concurrency            # dọn khi xong (lab clean all: dọn hết dữ liệu lab)
```

## Chạy bằng Docker (khuyên dùng)

Không cần cài Python hay ODBC driver trên máy. Chạy từ thư mục `novelle/`:

```bash
docker compose up -d                                   # Redis local
docker compose --profile lab build                     # build image lab (một lần)
docker compose --profile lab run --rm lab uv run lab check
docker compose --profile lab run --rm lab uv run lab check --target aws   # Redis trên EC2, cần mở tunnel SSM trước
docker compose --profile lab run --rm lab uv run lab config
docker compose --profile lab run --rm lab uv run lab list
docker compose --profile lab run --rm lab uv run lab run example                  # topic mẫu
docker compose --profile lab run --rm lab uv run lab run example --dbms redis -n 50
docker compose --profile lab run --rm lab uv run pytest
```

## Chạy trực tiếp trên máy

Cần Python 3.12, [uv](https://docs.astral.sh/uv/) và **ODBC Driver 18 for SQL Server**.

```bash
cd novelle/category_lab
uv sync
uv run lab check
```

## Cấu hình

**Mọi thiết lập nằm trong file `.env`, code không chứa giá trị mặc định nào.** Lab đọc theo tầng, tầng sau ghi đè tầng trước:

| Tầng | File | Chứa gì |
|---|---|---|
| 1 (thấp nhất) | `category_lab/.env.example` | **Được commit**. Mọi key kèm giá trị mặc định không bí mật. Thêm thiết lập mới thì thêm vào đây |
| 2 | `novelle_backend/.env` | `DB_HOST` và mật khẩu RDS (`MIGRATOR_PASSWORD`, `RO_PASSWORD`, `APP_PASSWORD`), dùng chung với backend |
| 3 | `category_lab/.env` | Secret của bạn (`GEMINI_API_KEY`) và những giá trị muốn đổi. Không commit |
| 4 (cao nhất) | Biến môi trường thật | Docker compose đặt `LAB_LOCAL_REDIS_HOST=redis`, … |

- Dòng để trống (`KEY=`) được coi là không đặt, nên không xoá mất giá trị mặc định ở tầng dưới.
- `lab config` cho biết đang dùng những file nào và giá trị gì (mật khẩu được che).
- `--target local|aws` **chỉ chọn Redis**. SQL Server luôn là RDS dùng chung.

Cấu trúc code cấu hình:

```
lab/env.py          EnvSource (đọc và gộp các tầng .env, có text/integer/decimal/items), EnvFiles, ConfigError
lab/config.py       EnvKey, RedisEnvKeys, SqlServerConfig, RedisConfig, LabConfig, load_config
lab/llm/
  base.py           LLMKey (LLM_*), LLMEnvKeys (<PREFIX>_*), LLMConfig: lớp cha trừu tượng, tự đọc .env
  gemini.py         GeminiConfig(LLMConfig): chỉ khai báo provider, tiền tố GEMINI_, nơi lấy key
  registry.py       LLM_PROVIDERS, llm_from_env (chọn theo LLM_PROVIDER)
  gemini_client.py  gọi Gemini: dựng payload, structured output, thử lại, model dự phòng, cache
  clients.py        client_for(llm): chọn client theo provider (CLI và lab check chỉ gọi hàm này)
  prompts/          commentary.md: system prompt cho nhận xét
```

- Tên biến môi trường là **đối tượng** (`EnvKey`, `RedisEnvKeys`, `LLMKey`, `LLMEnvKeys`), không phải chuỗi viết thẳng trong lời gọi hàm.
- Mỗi phần có lớp cấu hình tự đọc từ `.env` bằng `from_env(...)`. Các hàm khác nhận **đối tượng cấu hình**, không nhận từng tham số rời.
- Thêm một mô hình mới gồm 5 bước: tạo file `lab/llm/<tên>.py` với lớp con `LLMConfig`; đăng ký nó trong `lab/llm/registry.py`; thêm khối `<PREFIX>_*` vào `.env.example`; viết client giống `lab/llm/gemini_client.py`; thêm một nhánh vào `lab/llm/clients.py`.

## Viết scenario cho topic của bạn

Mỗi topic là một folder `topics/t<số>_<id>/` gồm:

```
__init__.py    TOPIC = TopicMeta(id="indexing", title=..., owner="Tên bạn", research_questions=[...])
sqlserver.py   các scenario chạy trên SQL Server
redis.py       các scenario chạy trên Redis
sql/           file .sql dùng trong scenario
```

Một scenario là một hàm có gắn `@scenario`. Hai scenario (một ở mỗi file) dùng chung `pair` thì được đặt cạnh nhau khi so sánh:

```python
from lab.framework import Ctx, scenario

@scenario(title="Lấy 1 truyện theo StoryId", pair="story_by_id")
def story_by_id(ctx: Ctx):
    stats = ctx.bench_sql("pk_seek", ctx.read("sql/story_by_id.sql"), 42)   # tham số dùng ?
    ctx.check(stats.p50 < 5, "dưới 5 ms phía server")
    ctx.observe("Clustered index seek trên PK_Story.")
```

| `ctx.` | Dùng để |
|---|---|
| `sql.query / scalar / exec / exec_file`, `run_sql_file("sql/x.sql")` | Chạy SQL trên RDS |
| `redis` + `redis.key("story", 1)` | Lệnh Redis bất kỳ. Key luôn có tiền tố `lab:<topic>:` và được xoá sau khi chạy xong topic |
| `bench_sql(label, sql, *params, inner=None)` | Đo **thời gian xử lý phía SQL Server** của 1 lần thực thi, ghi `server_ms`. Câu lệnh ghi dữ liệu phải truyền `inner=1` |
| `bench_redis(label, fn)` | Đo **thời gian xử lý phía Redis** của `fn(client)` qua SLOWLOG. `fn` phải dùng đúng `client` được truyền vào |
| `metric(name, value, unit)` | Số đo khác: số byte, số update bị mất, … |
| `check(cond, msg)` | Khẳng định được kiểm chứng. Chỉ cần một check sai là scenario thành `failed` |
| `observe(text)` | Nhận xét của bạn |
| `statement(label, text)` | Ghi câu lệnh để hiện trong tab **SQL Server / Redis** của cặp trong report. `bench_sql` và `inspect_sql` tự ghi câu SQL (tham số `?` được thay bằng giá trị thật), `bench_redis` tự ghi các lệnh Redis thật lấy từ SLOWLOG. Chỉ cần gọi tay cho đoạn code không đi qua bench, ví dụ phần `workers` chạy |
| `capture(label, content)` | Lưu bằng chứng thô vào `results/<run>/raw/` |
| `inspect_sql(label, sql, *params)` | Chạy 1 lần với `STATISTICS IO/TIME` và actual plan: ghi `logical_reads`, `cpu_ms`, lưu plan dạng text và `.sqlplan` (mở bằng SSMS). Trả về `.io`, `.plan.physical_ops()`, `.plan.missing_indexes`, … |
| `inspect_redis_key(label, key)` | Type, encoding (listpack, hashtable, skiplist, …), số phần tử, `MEMORY USAGE`; ghi `memory_bytes` |
| `sandbox_table(name, "dbo.Story", where=, top=, primary_key=)` | Bản sao bảng tại `lab.<topic>__<name>`. **Bắt buộc dùng khi tạo index hoặc sửa dữ liệu**, vì RDS là DB dùng chung. Bảng được xoá sau khi chạy topic |
| `workers(n, fn, iterations=, dbms=, autocommit=)` | n luồng chạy đồng thời, mỗi luồng có kết nối riêng (`w.sql`, `w.redis`), bắt đầu cùng lúc. Lỗi được gom lại (`r.errors`, `r.error_counts()`, ví dụ `sql:1205` là deadlock) chứ không làm dừng scenario |

Các module dùng trực tiếp: `lab.framework.fixtures` (`load_hashes`, `load_json`, `load_strings` để nạp dòng SQL vào Redis), `lab.framework.sqlserver_probe` (`locks`, `waiting_tasks`, `session_id`; hai hàm đầu cần quyền `VIEW SERVER STATE`), `lab.framework.redis_probe` (`memory`, `persistence`, `encoding_thresholds`, `namespace_memory`).

`workers` đo `wall_s` ở client, nên con số này có tính cả mạng. Chỉ dùng nó để so các lần chạy trên cùng một DBMS. Kết quả của các bài concurrency là **số đếm**: số update bị mất, số xung đột, số deadlock.

Tuỳ chọn của `@scenario`: `id`, `pair`, `targets={"local","aws"}`, `destructive=True` (cần `--allow-destructive` mới chạy), `repeat`, `warmup`. Có thể gắn thêm `@ten_ham.setup` và `@ten_ham.teardown` (teardown luôn chạy, kể cả khi scenario lỗi).

**Chỉ đo thời gian phía server.** Thời gian mạng giữa máy bạn và RDS không được tính:
- SQL Server: câu lệnh được chạy K lần trong **một batch**, giữa hai lần đọc `SYSDATETIME()`, rồi chia cho K. Trên RDS đồng hồ này chỉ nhảy theo bước khoảng 1 ms, nên K được tự chọn (1 đến 1000, mỗi batch khoảng 100 ms) để độ phân giải còn khoảng 1/K ms. Vì câu lệnh bị lặp, câu **INSERT/UPDATE/DELETE phải dùng `inner=1`**.
- Không dùng `sys.dm_exec_query_stats` hay Query Store: trên RDS t3.micro, SQL Server chỉ có khoảng 174 MB RAM nên plan cache bị đẩy ra ngay, còn Query Store ở chế độ AUTO không ghi các truy vấn nhẹ.
- Redis: `SLOWLOG` với ngưỡng 0 được bật tạm trong lúc đo rồi trả về cấu hình cũ. Đơn vị là µs nguyên.
- Mỗi metric thời gian có `resolution_ms`. Dấu `*` nghĩa là độ phân giải lớn hơn 10% giá trị. Hai DBMS chỉ được coi là khác nhau khi chênh lệch lớn hơn tổng độ phân giải của hai phép đo.

Mỗi lần `lab run` ghi kết quả vào `results/<runId>/run.json`.

## Cấu trúc hiện tại

```
lab/config.py        đọc và gộp .env, tạo SqlServerConfig / RedisConfig theo target
lab/connections.py   SqlServer (pyodbc) và RedisClient (redis-py + namespace lab:<topic>:)
lab/checks.py        các hạng mục của `lab check`
lab/cli.py           Typer CLI
lab/views.py         bảng Rich cho list/run
lab/maintenance.py   scaffold và clean
lab/report/          loader.py (đọc và gộp run.json), builder.py (dựng HTML), charts.py (SVG),
                     templates/ (Jinja2), static/ (CSS, JS được nhúng vào file report)
lab/llm/             cấu hình, client và prompt của từng LLM provider (xem mục Cấu hình)
lab/framework/       scenario.py (@scenario, Ctx), bench.py (đo phía server), registry.py (tự tìm topic),
                     runner.py (chạy, bắt lỗi, dọn dữ liệu, ghi run.json), result.py (model pydantic),
                     compare.py (ghép cặp và kết luận, dùng chung cho terminal và report),
                     sqlserver_probe.py, redis_probe.py, concurrency.py, fixtures.py
topics/_template/    mẫu cho `lab scaffold`
topics/t0_example/   topic mẫu: 3 cặp (đọc theo khoá, top rating, đếm lượt xem đồng thời)
tests/               test không cần DB
```
