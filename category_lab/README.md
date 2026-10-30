# Novelle DBMS Lab (`category_lab`)

Chạy các thí nghiệm theo topic của bài tập lớn trên **SQL Server (AWS RDS)** và **Redis**, đo kết quả và so sánh hai DBMS.

Trạng thái: **phase F2**. Đã có `config`, `check`, `list`, `run` và topic mẫu `topics/t0_example`. Lệnh `scaffold`, `clean` (F3) và `report` (F4, F5) sẽ có ở các phase sau.

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

- Thông tin RDS (`DB_HOST`, `MIGRATOR_PASSWORD`, `RO_PASSWORD`, `APP_PASSWORD`) được đọc từ `novelle_backend/.env`, không chép sang chỗ khác.
- Các thiết lập riêng của lab nằm trong `category_lab/.env` (tạo từ `.env.example`): user SQL, Redis cho từng target, Gemini.
- Thứ tự ưu tiên: biến môi trường thật > `category_lab/.env` > `novelle_backend/.env`.
- `--target local|aws` **chỉ chọn Redis**. SQL Server luôn là RDS dùng chung.

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
| `capture(label, content)` | Lưu bằng chứng thô vào `results/<run>/raw/` |

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
lab/framework/       scenario.py (@scenario, Ctx), bench.py (đo phía server), registry.py (tự tìm topic),
                     runner.py (chạy, bắt lỗi, ghi run.json), result.py (model pydantic)
topics/t0_example/   topic mẫu
tests/               test không cần DB
```
