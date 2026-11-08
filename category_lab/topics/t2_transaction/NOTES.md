# Transaction và concurrency: SQL Server so với Redis

Người thực hiện: NghiaTran · Topic `transaction` (`topics/t2_transaction`) · Kết quả chạy ngày 08/11/2026
(SQL Server = AWS RDS SQL Server 2019 Express, Redis = Redis Stack 7.4.2 local, `--target local`).

## Mục tiêu

So sánh cơ chế transaction của SQL Server và Redis trên **chính các nghiệp vụ của Novelle**, không dùng ví dụ
"tồn kho" chung chung:

| Thí nghiệm | Nghiệp vụ Novelle | Ý tưởng của kịch bản trong báo cáo |
|---|---|---|
| **T1** `concurrent_approval` | F11 Duyệt yêu cầu làm tác giả (`sp_ApproveAuthorRequest`), quy tắc RB13 | 3.1 Hai yêu cầu tranh nhau một tài nguyên |
| **T2** `error_mid_transaction` | Duyệt tác giả ghi 3 bảng: `AuthorRequest` → `User.Role` → `Author` | 3.2 Lỗi xảy ra giữa transaction |
| **T3** `rating_under_load` | F6 Đánh giá truyện: `Rating` + `trg_Rating` cập nhật `Story.RatingAvg` | 3.3 Hiệu năng khi tải tăng (1/10/50/100 client) |

Câu hỏi nghiên cứu nằm trong `__init__.py`.

## Dữ liệu và an toàn

- **SQL Server:** dữ liệu được copy từ `dbo` (chỉ đọc) sang các bảng sandbox `lab.transaction__*`. Các
  ràng buộc quan trọng được tạo lại: `PK_Author`, `UQ_Author_PenName`, `UQ_Author_ApprovedRequest`, filtered
  unique cho yêu cầu PENDING, `IX_Rating_Story`, và một bản sao của `trg_Rating`. Không gọi `dbo.sp_*`; các
  batch trong `sql/t1_*.sql` là bản sao của `sp_ApproveAuthorRequest` trỏ vào sandbox và trả lỗi về dưới dạng
  dòng kết quả thay vì `THROW`. Runner xoá sandbox sau khi chạy.
- **Redis:** dùng Hash và Set trong `lab:transaction:*` để mô phỏng cùng dữ liệu. Danh sách user và các bút
  danh đã dùng được đọc từ `dbo`.
- **Isolation:** NovelleDB đang tắt `SNAPSHOT` và `READ_COMMITTED_SNAPSHOT`, nên các thí nghiệm dùng khoá
  (READ COMMITTED, REPEATABLE READ). Muốn bật SNAPSHOT phải `ALTER DATABASE` trên DB dùng chung, nên không làm.

## Cách làm

### T1: hai admin duyệt cùng lúc

Hai phiên admin chạy cùng lúc, có hai trường hợp:

- **(a) `same_request`:** cùng một yêu cầu.
- **(b) `same_pen_name`:** hai yêu cầu khác nhau nhưng đề xuất cùng một bút danh.

Mỗi phiên dừng 300 ms giữa lúc đọc và lúc ghi (SQL: `WAITFOR` trong batch; Redis: barrier giữa đọc và ghi),
để hai admin chắc chắn chạy chồng lên nhau. Kết quả đúng: **đúng 1 lần duyệt**, RB13 đúng, không có bút danh
bị dùng hai lần.

| Biến thể | SQL Server | Redis |
|---|---|---|
| `read_then_write` | Transaction READ COMMITTED, không lock hint | `HGET` / `SISMEMBER` rồi `HSET` / `SADD` từ client |
| `read_then_write_no_unique` (chỉ b) | Như trên, nhưng bỏ `UQ_Author_PenName` | — |
| `guarded` | `UPDLOCK, HOLDLOCK` như proc thật (khoá bi quan) | `WATCH` + `MULTI/EXEC`, retry khi EXEC bị huỷ (khoá lạc quan) |
| `atomic` | `UPDATE … WHERE Status='PENDING'` + `@@ROWCOUNT`; `INSERT … WHERE NOT EXISTS` | Script Lua `lua/t1_approve.lua` |
| `repeatable_read` (chỉ a) | REPEATABLE READ, không lock hint | — |

### T2: bước 3 bị lỗi

Duyệt tác giả có 3 bước ghi, và bước 3 được cố ý làm cho lỗi:

- **SQL Server:** bút danh đã có người dùng, nên `INSERT Author` vi phạm `UQ_Author_PenName` (lỗi **2627**).
- **Redis:** không có ràng buộc UNIQUE, nên lỗi được giả lập bằng cách cho key `author:<id>` đang chứa một
  String, làm `HSET` báo lỗi **WRONGTYPE** lúc chạy.

Kết quả đúng là "all or nothing": **0/3 bước** còn lại và RB13 đúng.

- **SQL Server:**
  - `no_transaction`: autocommit.
  - `app_transaction`: autocommit tắt, client gọi `rollback()` (như Spring `@Transactional`).
  - `in_transaction`: `XACT_ABORT ON` + TRY/CATCH (khuôn mẫu của mọi proc trong Novelle).
  - `commit_after_error`: `XACT_ABORT OFF`, bắt lỗi xong vẫn `COMMIT`.
- **Redis:**
  - `no_transaction`.
  - `in_transaction`: MULTI/EXEC gặp lỗi lúc chạy.
  - `queue_error`: lỗi cú pháp lúc xếp lệnh, dẫn tới EXECABORT.
  - `discard`.
  - `lua_runtime_error`.
  - `lua_check_first`: kiểm tra hết rồi mới ghi.
  - `compensation`: client tự ghi ngược lại sau khi lỗi.

Các lệnh Redis được gửi qua một kết nối thô (`common.RawRedisSession`), nên report ghi lại đúng từng phản hồi
của Redis (`QUEUED`, mảng EXEC, `EXECABORT`).

### T3: tải tăng

Có 200 lượt đánh giá cho cùng một truyện, mỗi lượt của một user khác nhau, điểm 1–5 lần lượt, nên trung bình
đúng là **3.00**. Tổng 200 lượt được chia đều cho 1, 10, 50 hoặc 100 client đồng thời. Mỗi mức tải có giới hạn
**60 s**; yêu cầu chưa kịp gửi được đếm vào `not_run_requests`.

| Biến thể | SQL Server | Redis |
|---|---|---|
| Thiết kế hiện tại | `trigger_recompute`: `INSERT Rating`, `trg_Rating` tính lại AVG/COUNT từ toàn bộ rating | — |
| Cộng dồn nguyên tử | `atomic_increment`: một transaction gồm INSERT và `UPDATE Story SET RatingSum += s, RatingCount += 1` | `atomic_increment`: Lua `HSETNX` + `HINCRBY` |
| Khoá lạc quan | — | `optimistic_retry`: `WATCH` story hash + MULTI/EXEC, retry |

Các chỉ số đo:

- thông lượng, tính trên số yêu cầu thành công;
- độ trễ p50/p95/p99 đo ở client;
- deadlock (SQL) hoặc số lần retry (Redis);
- số yêu cầu lỗi;
- thời gian phía server: SQL đo trong batch, gồm cả chờ khoá; Redis lấy tổng usec trong `INFO commandstats` chia cho số yêu cầu;
- tính đúng: `RatingCount` và `RatingAvg` có khớp với giá trị tính lại từ toàn bộ rating hay không.

## Kết quả

### T1: hai admin duyệt cùng lúc

| Trường hợp · biến thể | SQL Server | Redis |
|---|---|---|
| (a) `read_then_write` | 1 duyệt; admin 2 bị **PK_Author chặn (2627)** | **2 admin cùng "duyệt thành công"**, ReviewedBy bị ghi đè |
| (a) `guarded` | 1 duyệt; admin 2 **chờ khoá 307 ms** rồi nhận 50001 | 1 duyệt; EXEC của admin kia bị huỷ, **retry 1 lần**, rồi bị từ chối |
| (a) `atomic` | 1 duyệt; admin kia chờ 304 ms, UPDATE khớp 0 dòng nên nhận 50001 | 1 duyệt; Lua trả `ALREADY_PROCESSED` |
| (a) `repeatable_read` | 1 duyệt; **1 deadlock (1205)**, phiên bị chọn làm nạn nhân retry rồi nhận 50001 | — |
| (b) `read_then_write` | 1 duyệt; admin 2 bị **UQ_Author_PenName chặn (2627)** | **2 duyệt, 1 bút danh bị dùng hai lần** |
| (b) `read_then_write_no_unique` | **2 duyệt, 1 bút danh bị dùng hai lần** | — |
| (b) `guarded` | 1 duyệt; chờ khoá range 313 ms rồi nhận 50003 | 1 duyệt; retry 1 lần rồi nhận `PEN_NAME_TAKEN` |
| (b) `atomic` | 1 duyệt; admin kia nhận 50003 | 1 duyệt; admin kia nhận `PEN_NAME_TAKEN` |

Không biến thể nào làm vi phạm RB13 ở cả hai DBMS: mỗi lần duyệt đều ghi đủ 3 bước, hoặc không ghi bước nào.

### T2: bước 3 bị lỗi (số bước còn lại / vi phạm RB13)

| SQL Server | Còn lại | RB13 | Redis | Còn lại | RB13 |
|---|---|---|---|---|---|
| `no_transaction` | **2/3** | 1 | `no_transaction` | **2/3** | 1 |
| `app_transaction` (rollback ở client) | 0/3 | 0 | `in_transaction` (MULTI/EXEC) | **2/3** | 1 |
| `in_transaction` (XACT_ABORT + TRY/CATCH), `XACT_STATE() = -1` | 0/3 | 0 | `queue_error` (EXECABORT) | 0/3 | 0 |
| `commit_after_error` (XACT_ABORT OFF), `XACT_STATE() = 1` | **2/3** | 1 | `discard` | 0/3 | 0 |
| | | | `lua_runtime_error` | **2/3** | 1 |
| | | | `lua_check_first` | 0/3 | 0 |
| | | | `compensation` | 0/3 | 0 |

### T3: 200 lượt đánh giá một truyện

SQL Server (RDS, mỗi yêu cầu mất khoảng một vòng mạng ~90 ms):

| Client | `trigger_recompute` | `atomic_increment` |
|---|---|---|
| 1 | 6,1 req/s · p50 164 ms · p99 263 ms · 0 deadlock · server p50 12 ms | 5,5 req/s · p50 178 ms · p99 369 ms · server p50 2 ms |
| 10 | **0,1 req/s** · p50 7,1 s · **474 deadlock** · 28 lỗi · 166 chưa chạy | 46 req/s · p50 185 ms · p99 406 ms · 0 deadlock |
| 50 | **0,1 req/s** · p50 61 s · 481 deadlock · 57 lỗi · 137 chưa chạy | 185 req/s · p50 250 ms · p99 338 ms · 0 deadlock |
| 100 | **0,07 req/s** · p50 65 s · 519 deadlock · 100 lỗi · 95 chưa chạy | **294 req/s** · p50 220 ms · p99 435 ms · 0 deadlock |

Redis (local):

| Client | `atomic_increment` (Lua) | `optimistic_retry` (WATCH) |
|---|---|---|
| 1 | 3 917 req/s · p50 0,13 ms · 0 retry | 4 223 req/s · p50 0,23 ms · 0 retry |
| 10 | 5 403 req/s · p50 1,0 ms · 0 retry | 881 req/s · p50 5,5 ms · **660 retry** |
| 50 | 4 154 req/s · p50 3,0 ms · 0 retry | 358 req/s · p50 79 ms · **2 023 retry** |
| 100 | 2 386 req/s · p50 16 ms · p99 67 ms · 0 retry | 284 req/s · p50 213 ms · p99 672 ms · **2 864 retry** |

Ở mọi mức tải, `RatingCount` và `RatingAvg` cuối cùng đều khớp với giá trị tính lại từ toàn bộ rating. Khi đủ
200 lượt, trung bình là 3.00. Ở các mức SQL bị dừng do hết giới hạn 60 s, dữ liệu vẫn khớp với số lượt đã
commit (chỉ 5–6 lượt). Thời gian Redis xử lý mỗi yêu cầu là 15–47 µs với Lua và 7–35 µs với WATCH (tính cả
các lần retry).

## Nhận xét

1. **Ràng buộc của SQL Server là lớp bảo vệ cuối cùng; Redis không có lớp này.** Khi không khoá (T1
   `read_then_write`), logic của hai DBMS đều sai như nhau: cả hai admin đều đọc thấy PENDING. SQL Server vẫn
   cho kết quả đúng nhờ `PK_Author` và `UQ_Author_PenName`. Bỏ UNIQUE đi thì SQL Server cũng ghi trùng bút danh
   y như Redis. Với Redis, mọi bất biến phải nằm trong code: WATCH, Lua, hoặc một Set đóng vai trò chỉ mục unique.
2. **Bi quan và lạc quan.** `UPDLOCK, HOLDLOCK` bắt admin sau **chờ** khoảng 300 ms (đúng bằng thời gian admin
   đầu giữ khoá) rồi mới bị từ chối. `WATCH` không chặn ai cả: EXEC của admin sau bị **huỷ** và client phải tự
   retry. Cả hai đều đúng, nhưng chi phí khi có xung đột khác nhau (xem T3).
3. **Isolation level cao hơn không có nghĩa là an toàn hơn.** REPEATABLE READ giữ khoá S tới cuối transaction,
   nên hai phiên cùng nâng S lên X thì thành deadlock. SQL Server tự phát hiện, huỷ một phiên (1205), và ứng
   dụng phải retry. Cách đúng là `UPDLOCK` khi đọc (như proc thật) hoặc kiểm tra ngay trong câu UPDATE.
4. **"Atomic" của Redis không có nghĩa là rollback.** MULTI/EXEC và Lua bảo đảm không lệnh nào của client khác
   chen vào giữa, nhưng lỗi lúc chạy (WRONGTYPE) để lại 2/3 bước, giống hệt khi không dùng transaction. Redis
   chỉ cho kết quả "all or nothing" khi lỗi bị phát hiện **trước khi lệnh đầu tiên chạy**: EXECABORT, DISCARD,
   hoặc Lua kiểm tra hết rồi mới ghi. Bù trừ ở client cũng đưa dữ liệu về như cũ, nhưng không nguyên tử: trong
   khoảng giữa, client khác vẫn thấy `Role=AUTHOR`.
5. **Chỉ có BEGIN TRANSACTION thì chưa đủ.** Khi `XACT_ABORT OFF`, lỗi 2627 chỉ huỷ câu lệnh bị lỗi;
   transaction vẫn commit được (`XACT_STATE() = 1`). Code nào vẫn chạy COMMIT thì kết quả giống hệt khi không có
   transaction. Bật `XACT_ABORT ON` thì `XACT_STATE() = -1`, transaction buộc phải rollback. Mọi procedure của
   Novelle đều dùng khuôn mẫu này.
6. **`trg_Rating` là điểm nghẽn thật của Novelle.** Chỉ cần 10 người đánh giá cùng một truyện cùng lúc, thông
   lượng đã giảm từ 6 xuống **0,1 req/s**, với gần 500 deadlock mỗi phút. Nguyên nhân: trigger vừa giữ dòng
   `Story`, vừa phải đọc toàn bộ rating của truyện, trong đó có rating chưa commit của phiên khác, nên các phiên
   chờ nhau theo vòng. Cách cộng dồn (`RatingSum + s, RatingCount + 1`) luôn khoá theo cùng một thứ tự, không có
   deadlock, và tăng tới **294 req/s** ở 100 client. **Đề xuất cho backend:** thay việc tính lại trong trigger
   bằng cộng dồn trong cùng transaction, hoặc gom rating qua Redis rồi đẩy định kỳ (như lượt xem với
   `sp_FlushViews`).
7. **Khoá lạc quan tệ đi rất nhanh khi tranh chấp cao.** Cùng là Redis, Lua giữ được hơn 2 000 req/s ở 100
   client, còn WATCH tụt xuống 284 req/s với 2 864 lần retry, vì mỗi lần EXEC thành công lại làm hỏng mọi WATCH
   khác. Cái giá của WATCH nằm ở client và mạng; thời gian Redis xử lý vẫn chỉ ở mức vài chục µs.
8. **Về so sánh tốc độ giữa hai DBMS.** Độ trễ ở client không so trực tiếp được: RDS ở xa (~90 ms mỗi vòng),
   Redis chạy local (~0,1 ms). Phép so có ý nghĩa là thời gian phía server: SQL Server mất 2–34 ms cho mỗi lượt
   đánh giá dạng cộng dồn (tăng theo độ tranh chấp), Redis mất 15–47 µs. Với 50–100 client, độ trễ phía Redis
   phần lớn là do 100 luồng Python tranh nhau ở phía client.

## Giới hạn

- Mỗi cấu hình chỉ chạy một lần. Số liệu T1/T2 cho kết quả xác định (có pause hoặc barrier); số liệu T3 dao
  động theo tải của RDS dùng chung.
- T3 phía SQL ở 10–100 client dừng vì hết giới hạn 60 s (`not_run_requests`), nên thông lượng là con số đo được
  trong 60 s đó.
- Không thí nghiệm durability (WAL so với AOF) và SNAPSHOT isolation (xem phần Dữ liệu và an toàn).
- Bug của framework phát hiện trong lúc làm: `SqlServer.exec/query` dùng `with conn.cursor()`, và khi
  `autocommit=False`, cursor của pyodbc **tự commit** lúc thoát khối `with`, nên `rollback()` không còn gì để huỷ.
  Topic này tránh bug bằng `_run_no_commit()` trong `sqlserver.py`; cần sửa trong `lab/connections.py`.

## Chạy lại

```bash
docker compose up -d
docker compose --profile lab run --rm lab uv run lab run transaction            # khoảng 6 phút (T3 phía SQL mất nhiều nhất)
docker compose --profile lab run --rm lab uv run lab run transaction -s 'transaction.sqlserver.error_mid_transaction'
docker compose --profile lab run --rm lab uv run lab report transaction
```

## Tài liệu tham khảo

- Microsoft Learn: *Transaction locking and row versioning guide*; *SET XACT_ABORT*; *XACT_STATE*; *Deadlocks guide*.
- Redis docs: *Transactions* (MULTI, EXEC, DISCARD, WATCH); *Scripting with Lua*; *Persistence*.
- Novelle: `novelle_backend/database/schema/05_procedures.sql` (`sp_ApproveAuthorRequest`), `06_triggers.sql`
  (`trg_Rating`), `queries/99_check_invariants.sql` (RB13).
