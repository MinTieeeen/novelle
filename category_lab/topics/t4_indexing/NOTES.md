# Indexing: SQL Server so với Redis

Người thực hiện: Huỳnh Minh Tiến · Topic `indexing` (`topics/t4_indexing`)

> Trạng thái: **Đã rút gọn (19/11/2026): dữ liệu 100 / 1.000 truyện, I1–I5 và I7, mỗi scenario một check. Chưa chạy bản rút gọn.**

## 1. Mục tiêu

So sánh **cách hai DBMS dùng index để tìm dữ liệu** và **cái giá phải trả cho index**, trên chính các truy vấn
của Novelle:

- **SQL Server** có nhiều loại index (clustered, nonclustered, composite, covering `INCLUDE`, filtered, unique,
  full-text) và optimizer tự chọn có dùng index hay không.
- **Redis** chỉ tìm được một giá trị theo **key**. Muốn tra theo trường khác, ứng dụng phải tự dựng và giữ cấu
  trúc phụ (Set, Sorted set, String), hoặc dùng module **RediSearch** (`FT.CREATE`), module này tự index các
  Hash.

**Ranh giới với topic Query Processing (t3):** t3 giữ nguyên index của web và chỉ quan sát optimizer dùng chúng.
Topic này **thay đổi index**: so sánh có / không có index, các loại index với nhau, chi phí ghi và dung lượng.

## 2. Phạm vi

| Trong phạm vi | Ngoài phạm vi |
|---|---|
| I1 tra theo một cột, I2 index nhiều cột / covering, I3 sắp xếp + phân trang, I4 filtered index, I5 full-text, I7 chi phí ghi + dung lượng | I6 lọc nhiều–nhiều (thể loại / tag), I8 tạo index khi đang có tải |
| Bản sao `dbo.Story` trong schema `lab` | Mọi thay đổi trên `dbo.*` (chỉ đọc) |
| Thời gian **phía server**, số trang đọc, plan, dung lượng | So độ trễ phía client giữa RDS và Redis |

## 3. Môi trường

| | SQL Server | Redis |
|---|---|---|
| Phiên bản | SQL Server 2019 Express trên AWS RDS db.t3.micro, dùng chung cả nhóm | Redis Stack 7.4 (có RediSearch) trong Docker, `--target local` |
| Đo thời gian | `ctx.bench_sql`: `SYSDATETIME()` quanh vòng lặp trong một batch, chia trung bình | `ctx.bench_redis`: tổng `duration` trong `SLOWLOG` |
| Thông tin thêm | Actual plan, `STATISTICS IO` (logical reads), `sys.dm_db_partition_stats` (trang của từng index) | Số lệnh, `MEMORY USAGE`, `FT.INFO` |

Giới hạn của Express ảnh hưởng tới topic: không có `ONLINE = ON` khi tạo index, bộ nhớ cho sort / hash rất nhỏ
(t3 từng bị chặn ở `RESOURCE_SEMAPHORE`), dung lượng tối đa 10 GB một database.

## 4. Dữ liệu (P1, đã hiện thực)

### 4.1. SQL Server: `lab.indexing__Story_<n>`, n = 100 / 1.000

- Sinh từ khoảng 150 truyện của `dbo.Story` bằng `sql/dataset_story.sql` (mỗi vòng `INSERT` một bản sao, không
  sort, không xin bộ nhớ). Quy tắc của bản sao thứ k:

  | Cột | Giá trị |
  |---|---|
  | `StoryId` | 1..n liên tục, theo thứ tự `StoryId` gốc |
  | `SourceStoryId` | `StoryId` của truyện gốc |
  | `AuthorId` | gốc + (k − 1) × `MAX(Author.UserId)`: web lớn lên nhờ có thêm tác giả, mỗi tác giả vẫn giữ khoảng 4 truyện |
  | `Title` / `Slug` | gốc + `" #k"` / `"--copyk"` (k > 1); `Slug` vẫn unique |
  | `LastChapterAt` | gốc − (k − 1) ms, để các bản sao không trùng hệt thời điểm (tránh hoà khi sắp xếp ở I3) |
  | Các cột khác | Giữ nguyên, nên phân bố trạng thái, rating, số chương giống dữ liệu web |

- `SELECT TOP (0) … INTO` giữ nguyên kiểu và collation của `dbo.Story` (`Vietnamese_100_CI_AI`). Điều này quan
  trọng cho I5: `LIKE` trên collation `AI` tìm được cả khi gõ không dấu.
- **Bảng gốc chỉ có clustered PK trên `StoryId`.** Mỗi biến thể tự tạo index mình nghiên cứu rồi xoá đi, nên
  biến thể nào cũng bắt đầu từ trạng thái "không có index phụ".
- Bản sao riêng (`dataset.copy_of`): `StoryFt_<n>` dành cho full-text index (mỗi bảng chỉ có một, I5),
  `StoryW_<n>` cho các lệnh ghi (I7).
- Mỗi kích thước chỉ dựng một lần trong một lần chạy (bảng đánh dấu `lab.indexing__Ready_<n>`, tạo sau cùng,
  để lần chạy bị ngắt giữa chừng sẽ dựng lại). Runner xoá mọi `lab.indexing__*` sau topic.

### 4.2. Redis: `lab:indexing:s<n>:story:<id>`

- Một Hash cho mỗi truyện, gồm đủ các cột trên. `NULL` thành `""`, thời gian thành **epoch ms** (dùng làm score
  ZSET / `NUMERIC` của RediSearch), `IsDeleted` thành `0` / `1`.
- Hash được **sinh trên máy chạy lab** từ khoảng 150 dòng `dbo.Story`, theo đúng quy tắc ở trên (`copies.py`),
  nên không phải tải n dòng (gồm cả `Description`) từ RDS về.
- **Hai phía giữ cùng một tập truyện:** scenario `dataset` so `copies.fingerprint()` của các dòng sinh ra với
  `sql/dataset_fingerprint.sql` chạy trên bảng SQL (số dòng, số truyện công khai, tổng id, tác giả, số chương,
  rating, độ dài tiêu đề / slug, tổng epoch `LastChapterAt`). Phía Redis kiểm tra số Hash bằng n và nội dung
  Hash của truyện đầu, giữa, cuối.
- Index RediSearch không phải key nên runner không xoá được. Topic tự xoá mọi index tên `lab:indexing:*`
  (`dataset.drop_search_indexes`) trong teardown và ở đầu scenario `dataset`.

### 4.3. Kiểm tra môi trường (scenario `dataset`)

`sql/env_checks.sql` ghi lại các điều kiện mà các phase sau cần:

- Full-Text Search đã cài chưa; có word breaker tiếng Việt (lcid 1066) không; có `ftc_Novelle` và login lab có
  quyền `REFERENCES` trên đó không (I5).
- Login lab có `VIEW DATABASE STATE` không (đo trang của từng index, I4 / I7).
- Phía Redis: module `search` đã được nạp chưa.

## 5. Cách đo chung

- Thời gian: p50 / p95 của 20 lần đo phía server (mặc định của lab). Lệnh ghi dùng `inner=1`.
- Truy vấn đọc của SQL được đo ở dạng **gán vào biến** (cùng plan, server không phải chờ gửi dữ liệu qua mạng),
  như t3. Phía Redis, các bước của một truy vấn chạy trong **một script Lua** và chỉ trả về số dòng.
- `ctx.inspect_sql` cho logical reads và actual plan; dung lượng index lấy từ `sys.dm_db_partition_stats`.
- **Tính đúng đi trước tốc độ:** mọi biến thể của một truy vấn, ở cả hai DBMS, phải trả về cùng tập `StoryId`
  (`ctx.check`). Riêng I5 cho phép khác nhau; phần khác nhau chính là kết quả cần báo cáo.
- Nhãn metric: `<biến thể> · <kích thước>`, ví dụ `covering · 50k`. Metric trùng tên và nhãn ở hai DBMS sẽ được
  report so sánh trực tiếp.

## 6. Kịch bản (bản rút gọn, 19/11/2026)

Dữ liệu: **100 và 1.000 truyện**. Mỗi scenario chỉ giữ các biến thể chính và có **đúng một `ctx.check`**
(kiểm chứng cơ bản); số đo (thời gian phía server, số trang, plan, bộ nhớ) vẫn được ghi đầy đủ dưới dạng metric.

| Kịch bản | SQL Server | Redis | Check duy nhất |
|---|---|---|---|
| `dataset` | Dựng `Story_100`, `Story_1000`, so fingerprint | Nạp Hash, đếm key, so 3 Hash mẫu | Dữ liệu khớp quy tắc nhân bản |
| I1 tra theo một cột | `Slug = ?`, `AuthorId = ?`: `no_index` · `nonclustered` | `scan` · `manual_index` (String / Set) · `search_tag` | Mọi biến thể trả đúng truyện cần tìm |
| I2 index nhiều cột | `Status = ? AND RatingAvg >= ?` (≈5% bảng): `no_index` · `composite` · `covering` | `scan` · `zset_per_status` · `search` (TAG + NUMERIC) | Mọi biến thể trả đúng tập truyện |
| I3 sắp xếp + phân trang | Trang 0% và 50%: `no_index` (Sort) · `index_offset` · `index_keyset` | `zset_rank` · `zset_keyset` · `search_sortby` | Mọi trang đúng 20 truyện, đúng thứ tự (FT.SEARCH: đúng tập) |
| I4 filtered index | Trang 1: `full_index` · `filtered` (+ dung lượng index) | `zset_all_filter` · `zset_public` · `search_filter` (`FT.CREATE … FILTER`) | Các biến thể cho cùng trang 1 |
| I5 full-text | Từ phổ biến + gõ không dấu: `LIKE '%w%'` · `CONTAINSTABLE` (nếu RDS cho phép) | `scan` · `search` · `search_unaccented` (field bỏ dấu) | SQL: LIKE tìm thấy mọi truyện chứa đúng từ khoá; Redis: `search_unaccented` recall 100% |
| I7 chi phí index | 1.000 truyện: `INSERT`, `UPDATE RatingAvg` với 0 và 3 index (`RatingAvg`, `AuthorId`, unique `Slug`) | `manual_0` · `manual_3` (MULTI) · `search_3` | SQL: INSERT đọc nhiều trang hơn khi có 3 index; Redis: ZSET `by_rating` vẫn khớp Hash sau các lệnh ghi |

Đã bỏ so với spec ban đầu: kích thước 10k / 50k, tipping point, `composite_range_eq`, heap / RID Lookup,
filtered index với tham số, độ tươi của full-text, bộ 1 / 6 index và các lệnh `update_views` /
`update_description` của I7.

## 7. Kế hoạch hiện thực

| Phase | Nội dung | Trạng thái |
|---|---|---|
| P0 | Spec này, `__init__.py` (câu hỏi nghiên cứu) | Xong, chờ review |
| P1 | `copies.py` (quy tắc nhân bản, không phụ thuộc DB), `dataset.py`, `sql/dataset_*.sql`, `sql/env_checks.sql`, cặp scenario `dataset`, `tests/test_copies.py` | Xong, chờ review, **chưa chạy trên RDS** |
| P2 | Module thuần: `ddl.py` (DDL index, dạng đo gán vào biến), `plans.py` (index nào được đọc, cột seek / residual, lookup), `redisidx.py` (bố cục index phụ tự quản lý của Redis, đọc `FT.INFO`). `common.py`: tạo / xoá index an toàn (context manager), `measure`, so tập kết quả, đo dung lượng index, `run_lua`, dựng index phụ Redis, tạo / xoá index RediSearch. `lua/scan_filter.lua`, `lua/fetch_members.lua`, `sql/indexes_list.sql`. Test: `test_ddl`, `test_plans`, `test_redisidx` | Xong, chờ review |
| P3 | `picks.py` (chọn tham số từ dữ liệu, có test), `sql/i2_*.sql`, `sql/i3_*.sql`, `lua/zset_intersect.lua`, `lua/zrange_fetch.lua`, `lua/page_fetch.lua`; cặp scenario `i2_composite`, `i3_sort_paging` (I1 viết xong rồi bỏ) | Xong |
| P4 | `textsearch.py` (bỏ dấu, chọn từ khoá, tập tham chiếu, có test), `sql/i4_page_param.sql`, `sql/i5_*.sql`, `lua/zset_filter_page.lua`, `lua/scan_text.lua`; `common.create_fulltext`; cặp scenario `i4_filtered`, `i5_fulltext` | Xong, chờ review |
| P5 | `sql/i7_*.sql`, `redisidx.SET_KINDS` / `SET_SCHEMA` / `next_rating`, `picks.write_target`, `common.exec_ddl` (timeout cho DDL); cặp scenario `i7_write_cost` | Xong, chờ review |
| P6 | Chạy đủ 3 kích thước, điền mục Kết quả, viết mục Indexing trong báo cáo LaTeX | |

Mỗi phase dừng lại để review code trước khi chạy trên RDS dùng chung.

## 8. Kế hoạch test

1. **Unit test, không cần DB:** `uv run pytest topics/t4_indexing/tests` (quy tắc nhân bản, fingerprint, mã hoá
   Hash; P2 thêm test cho helper).
2. **Thử nhỏ trước:** lần chạy đầu chỉ dùng mức 1.000 (`-s "indexing.*.dataset_story"`), xem thời gian dựng
   và các điều kiện môi trường, rồi mới bật 10k / 50k.
3. **Tiền điều kiện:** `lab check`; scenario `dataset` phải PASS (fingerprint khớp, có RediSearch). Thiếu quyền
   full-text hoặc `VIEW DATABASE STATE` thì báo nhóm trước P4 / P5.
4. **Tính đúng:** mỗi scenario kiểm tra cùng tập kết quả giữa các biến thể và giữa hai DBMS (trừ I5).
5. **Ổn định:** plan và logical reads phải giống nhau giữa hai lần chạy; thời gian lấy p50, chạy hai lượt vào
   hai thời điểm khác nhau vì RDS dùng chung.
6. **Dọn dẹp:** sau mỗi lần chạy kiểm tra không còn `lab.indexing__*`, key `lab:indexing:*`, hay index
   RediSearch `lab:indexing:*` (`FT._LIST`).

## 9. An toàn trên RDS dùng chung

- Chỉ đọc `dbo.Story`, `dbo.Author`; mọi DDL và mọi lệnh ghi chạy trên `lab.indexing__*`.
- Dung lượng ước tính: mỗi bảng 50k khoảng vài chục đến hơn 100 MB tuỳ độ dài `Description`, cộng các bản sao
  `Heap` / `Ft` / `W`. Phase P3–P5 chỉ tạo bản sao ở kích thước cần dùng.
- Dựng dữ liệu chỉ dùng `INSERT … SELECT` theo từng bản sao, không sort lớn, để không chiếm bộ nhớ của instance.

## 10. Kết quả và nhận xét

Điền ở P6.

## 11. Giới hạn đã biết

- **I1 đã bỏ (18/11/2026).** Lần chạy `20261118-134815` đo xong mức 1k và 10k (không index: 74 → 731 trang,
  quét cả bảng; có nonclustered index: 4–5 trang), nhưng ở mức 50k câu `CREATE INDEX IX_Slug` trên bản sao
  **heap** treo hơn 10 phút. Nhiều khả năng là chờ cấp bộ nhớ (`RESOURCE_SEMAPHORE`), như t3 từng gặp; cùng
  index đó trên bảng có clustered PK tạo xong ngay. Run bị dừng bằng Ctrl+C làm hỏng kết nối SQL, nên mọi
  scenario sau đều lỗi `IMC06`. Từ đó, mọi DDL của topic chạy qua `common.exec_ddl` với timeout 180 s: lệnh
  treo sẽ bị huỷ, scenario đó báo lỗi rõ ràng, kết nối vẫn dùng được.

- Dữ liệu nhân bản từ khoảng 150 truyện, nên giá trị các cột lặp lại theo chu kỳ. Phân bố giữ đúng như web,
  nhưng số giá trị khác nhau của `RatingAvg` ít, nên tỉ lệ khớp ở I2 chỉ chọn được theo từng nấc.
- `Title` có thêm `" #k"`; word breaker có thể tách `#k` thành một từ, nhưng từ khoá của I5 không dùng số.
- Biến thể `scan` của Redis duyệt **toàn bộ keyspace** (`SCAN … MATCH` lọc sau khi duyệt), nên chi phí phụ
  thuộc tổng số key trong database, kể cả key của kích thước khác và của ứng dụng. `lua/scan_filter.lua` trả về
  `DBSIZE` để report ghi kèm; đây là đặc điểm thật của Redis, không phải lỗi đo.
- Framework chưa tự xoá index RediSearch khi `lab clean` (topic tự xoá; nên báo trưởng nhóm bổ sung).

## 12. Tài liệu tham khảo

- Microsoft Learn: *SQL Server index architecture and design guide*; *Create filtered indexes*; *Full-Text Search*;
  *sys.dm_db_partition_stats*.
- Redis docs: *Secondary indexing*; *Sorted sets*; *RediSearch: FT.CREATE, FT.SEARCH, FT.INFO*.
- Novelle: `novelle_backend/database/schema/02_indexes.sql`, `03_fulltext.sql`,
  `novelle_backend/src/main/resources/mapper/StorySearchMapper.xml`.
