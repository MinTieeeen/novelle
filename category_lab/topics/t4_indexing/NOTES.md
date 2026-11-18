# Indexing: SQL Server so với Redis

Người thực hiện: Huỳnh Minh Tiến · Topic `indexing` (`topics/t4_indexing`)

> Trạng thái: **P0–P5 xong (dữ liệu, helper, I2–I5, I7). P1 + P2 đã chạy thử thành công; I1 đã bỏ.** Mục "Kết quả" sẽ điền ở P6.

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
| I2 index nhiều cột / covering / tipping point, I3 sắp xếp + phân trang, I4 filtered index, I5 full-text, I7 chi phí ghi + dung lượng | I1 tra theo một cột (bỏ ngày 18/11/2026: chạy quá lâu, xem mục 11), I6 lọc nhiều–nhiều (thể loại / tag), I8 tạo index khi đang có tải |
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

### 4.1. SQL Server: `lab.indexing__Story_<n>`, n = 1.000 / 10.000 / 50.000

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

## 6. Kịch bản

### I2. Index nhiều cột, covering, tipping point (F2 bộ lọc catalog)

| | |
|---|---|
| Truy vấn | `SELECT StoryId, Title, RatingAvg, ChapterCount FROM S WHERE CompletionStatus = @st AND RatingAvg >= @r` |
| SQL Server | `no_index` · `single` (`RatingAvg`) · `composite_eq_range` (`CompletionStatus, RatingAvg`) · `composite_range_eq` (`RatingAvg, CompletionStatus`: cột khoảng đứng trước) · `covering` (`CompletionStatus, RatingAvg` `INCLUDE (Title, ChapterCount)`) |
| Tham số | `picks.catalog_filter`: trạng thái `COMPLETED`, ngưỡng rating chọn để khoảng 2% bảng khớp |
| Tipping point | Chỉ ở 50k: `sql/i2_tipping.sql` (`WHERE RatingAvg >= ?`, index `IX_Rating` không covering), tỉ lệ dòng khớp 0,2% / 0,5% / 1% / 2% / 5% / 10% / 25% / 50% (`picks.TIP_FRACTIONS`, ngưỡng lấy theo phân bố thật nên tỉ lệ thật đi theo nấc). Mỗi mức đo hai lần: optimizer tự chọn, và ép `WITH (INDEX(IX_Rating))`. Ghi `tipping_pct` = tỉ lệ nhỏ nhất mà optimizer chuyển sang quét bảng. Redis quét cùng các ngưỡng bằng ZSET `by_rating` và `FT.SEARCH`. `FT.SEARCH` chỉ trả tối đa `MAXSEARCHRESULTS` dòng (mặc định 10.000) nên ở mức lớn chỉ kiểm tra tổng số khớp |
| Redis | `scan` (Lua lọc trên Hash) · `zset_intersect` (ZSET `by_rating` + Set `status:<st>`, giao trong Lua) · `zset_per_status` (ZSET `by_rating:<st>`: tên key là cột "bằng", score là cột "khoảng", tương tự composite index) · `search` (`NUMERIC` + `TAG`) |
| Dự đoán | Thứ tự `eq, range` seek trên cả hai cột; `range, eq` chỉ seek theo rating và kiểm tra status từng dòng. Covering bỏ Key Lookup. Tipping point ở vài phần trăm. Redis không có optimizer: chi phí tỉ lệ với số phần tử phải duyệt, không có điểm "bỏ index" |
| Check | Cùng tập id; `covering` không có `Key Lookup` và đọc ít trang hơn `no_index`; `composite_eq_range` (khi được chọn) seek trên cả hai cột; tồn tại tipping point ở 50k |

### I3. Sắp xếp và phân trang (F1 truyện mới cập nhật)

| | |
|---|---|
| Truy vấn | Truyện công khai **đã có chương**, mới nhất trước, trang 20 truyện (`sql/i3_page_offset.sql`): `WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0 AND LastChapterAt IS NOT NULL ORDER BY LastChapterAt DESC, StoryId DESC OFFSET ? ROWS FETCH NEXT 20 ROWS ONLY`. Bỏ truyện chưa có chương để keyset không phải xử lý `NULL` |
| Độ sâu | Trang 1, và trang ở 10% / 50% / 90% số truyện công khai |
| SQL Server | `no_index` (Sort; chỉ đo các trang cần sort tối đa 10.000 dòng, vì RDS rất ít bộ nhớ cho sort) · `index_offset` (`PublishStatus, IsDeleted, LastChapterAt DESC, StoryId DESC` `INCLUDE (Title, ChapterCount)`) · `index_keyset` (cùng index, `WHERE … AND (LastChapterAt < @t OR (LastChapterAt = @t AND StoryId < @id))`) |
| Redis | `lua/page_fetch.lua`: `zset_rank` (ZSET `public:by_last`, `ZRANGE off off+19 REV`) · `zset_keyset` (`ZRANGE score -inf BYSCORE REV LIMIT`, bỏ các dòng đã hiện cùng score) · `search_sortby` (`FT.SEARCH … SORTBY LastChapterAt DESC LIMIT off 20`; trang có offset + 20 > `MAXSEARCHRESULTS` không lấy được, ghi metric `unreachable`). Member ZSET là id đệm 8 chữ số để thứ tự khi bằng điểm trùng với `StoryId DESC` |
| Dự đoán | Có index đúng thứ tự thì không còn Sort. `OFFSET` đọc và bỏ đi `@o` dòng nên trang sâu chậm dần; keyset gần như không đổi. ZSET lấy theo hạng là O(log N + 20) nên không phụ thuộc độ sâu; `FT.SEARCH` thì tăng theo offset |
| Check | Mỗi trang đúng 20 truyện, đúng thứ tự (SQL, ZSET); `FT.SEARCH` đúng tập truyện (SORTBY chỉ một khoá nên có thể đảo thứ tự khi bằng điểm); `no_index` có Sort, `index_offset` không; keyset đọc ≤ 60 dòng ở mọi độ sâu |

### I4. Filtered index

| | |
|---|---|
| Truy vấn | Trang 1 của I3 (`sql/i3_page_offset.sql`, trạng thái viết bằng hằng số như `vw_PublicStory`); bản có tham số: `sql/i4_page_param.sql` (tham số được `CAST` về kiểu của cột, nếu không `N'PUBLISHED'` cũng không khớp điều kiện lọc) |
| SQL Server | `full_index` (index của I3) · `filtered` (`LastChapterAt DESC, StoryId DESC` `INCLUDE (Title, ChapterCount)` `WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0`, cùng điều kiện lọc với `IX_Story_Public_LastChapter` của web) · `filtered_param` (trạng thái là tham số) · `filtered_param_recompile` (thêm `OPTION (RECOMPILE)`; thời gian đo gồm cả compile mỗi lần chạy) |
| Redis | `zset_all_filter` (`lua/zset_filter_page.lua`: ZSET mọi truyện, xem từng truyện tới khi đủ 20 truyện công khai) · `zset_public` (ZSET chỉ gồm truyện trong danh sách; ứng dụng phải `ZADD` / `ZREM` khi đăng / ẩn) · `search_tags` (RediSearch, trạng thái là `TAG`) · `search_filter` (`FT.CREATE … FILTER "@PublishStatus=='PUBLISHED' && @IsDeleted=='0'"`, chỉ index `LastChapterAt`) |
| Đo | Thêm số trang và số dòng của từng index (SQL); `MEMORY USAGE` / `FT.INFO` (Redis) |
| Dự đoán | Filtered nhỏ hơn đúng theo tỉ lệ truyện công khai (`public_share` của scenario `dataset`). Có tham số thì optimizer không dùng được filtered index vì plan phải đúng cho mọi giá trị; `RECOMPILE` thì dùng lại được |
| Check | Cùng trang ở mọi biến thể; `filtered` dùng filtered index và index chỉ chứa đúng số truyện công khai, nhỏ hơn `full_index`; `filtered_param` không dùng, `filtered_param_recompile` dùng lại được (ghi kèm cảnh báo `UnmatchedIndexes` nếu plan báo). Redis: ZSET công khai nhỏ hơn ZSET mọi truyện; index có `FILTER` ít document hơn |

### I5. Tìm kiếm toàn văn (F2 ô tìm kiếm)

| | |
|---|---|
| Từ khoá | `textsearch.choose_terms` trên các truyện gốc: từ có dấu phổ biến nhất trong khoảng 2–10% truyện (≥ 3 chữ cái, không có `đ` vì `đ` là một chữ cái riêng, không phải dấu), một từ chỉ có ở một truyện, và từ phổ biến gõ **không dấu** |
| Tham chiếu | `textsearch.reference`: truyện có một từ của Title / Description **bắt đầu bằng** từ khoá, sau khi bỏ dấu và hạ chữ thường (điều người đọc mong đợi). Mỗi biến thể được chấm `recall_pct` và `precision_pct` so với tập này |
| SQL Server (trên `StoryFt_<n>`) | `like` (`sql/i5_like.sql`, cả 3 từ khoá) · `title_prefix` (`Title LIKE N'w%'` + `IX_Title`, chỉ từ phổ biến) · `fulltext` (`sql/i5_fulltext.sql`: `CONTAINSTABLE(…, (Title, Description), '"w*"')`; index tạo bằng `sql/i5_fulltext_create.sql` trong `ftc_Novelle`, word breaker lcid 1066 nếu có, ngược lại 0; đo thời gian tạo + populate và dung lượng fragment) |
| Redis | `scan` (`lua/scan_text.lua`: `SCAN` + `string.find`, chỉ hạ chữ thường ASCII) · `search` (`FT.SEARCH 'w*'`, `TEXT NOSTEM` trên `Title`, `Description`, `STOPWORDS 0`) · `search_unaccented` (field `SearchText` = bản bỏ dấu do ứng dụng ghi thêm vào Hash; teardown xoá field này) |
| Độ tươi | Ghi một truyện mới chứa một từ duy nhất, rồi đo thời gian tới khi tìm thấy: full-text (`CHANGE_TRACKING AUTO`, cập nhật **bất đồng bộ**) so với RediSearch (index **ngay trong lệnh `HSET`**) |
| Đo | server_ms, số kết quả, độ phủ (recall) so với tập tham chiếu tính trên client (so khớp sau khi bỏ dấu, không phân biệt hoa thường), độ tươi (ms), dung lượng index (`FULLTEXTCATALOGPROPERTY` / `FT.INFO`) |
| Dự đoán | `LIKE '%w%'` quét cả bảng gồm cả LOB, nhưng tìm được không dấu nhờ collation `AI`. Full-text nhanh nhưng có độ trễ khi cập nhật. RediSearch nhanh, tìm thấy ngay, nhưng **không bỏ dấu tiếng Việt** nếu không thêm field riêng. `string.find` trong Lua không hiểu chữ hoa / dấu tiếng Việt |
| Check | Full-text và RediSearch tìm được từ phổ biến có dấu; `search_unaccented` có recall ≥ 99%; truyện mới tìm thấy (SQL: trong 120 s; Redis: ngay lần tìm đầu). Recall / precision của các biến thể còn lại chỉ ghi lại, không bắt buộc. `STOPWORDS 0` vì từ bỏ dấu có thể trùng stopword tiếng Anh (`thế` → `the`) |

### I7. Chi phí ghi và dung lượng

| | |
|---|---|
| Bộ index (SQL, trên `StoryW_<n>`) | 0: chỉ PK · 1: + `RatingAvg` · 3: + `AuthorId`, unique `Slug` · 6: + `ViewCount`, `(CompletionStatus, RatingAvg) INCLUDE (...)`, filtered `LastChapterAt` (gần đúng bộ index của web) |
| Lệnh ghi | `sql/i7_insert.sql` (truyện mới, id `MAX + 1`, slug có id nên không vi phạm `UX_Slug`) · `sql/i7_update_rating.sql` (`RatingAvg` +0,01, quay về 1,00 sau 4,99: là khoá của 2 index trong bộ 6) · `sql/i7_update_views.sql` (`ViewCount + 1`, như `sp_FlushViews`) · `sql/i7_update_description.sql` (đổi ký tự đầu, không index phụ nào chứa `Description`). Truyện đích: `picks.write_target`, truyện công khai có mô tả |
| Cách đo | Dung lượng ở 1k / 10k / 50k (tạo đủ 6 index rồi đọc `dm_db_partition_stats`). Thời gian ghi chỉ ở 50k: mỗi mẫu chạy lệnh **50 lần** trong một batch (`WRITE_INNER`), vì một lệnh ghi một dòng nhanh hơn bước ~1 ms của `SYSDATETIME` trên RDS; các lệnh được viết để lặp lại được, dòng đã chèn bị xoá sau mỗi bộ index. `inspect_sql` cho số trang mà lệnh ghi đọc (gồm cả việc cập nhật index) |
| Redis | `manual_0` (chỉ `HSET` / `HINCRBY`) · `manual_1/3/6` (thêm `ZADD` / `SADD` / `SET` của `redisidx.SET_KINDS`, gói trong `MULTI` khi có cấu trúc phụ) · `search_1/3/6` (lệnh như `manual_0`, nhưng có index RediSearch 1 / 3 / 6 field theo `redisidx.SET_SCHEMA`). Metric `commands` = số lệnh mỗi lần ghi |
| Đo | server_ms của từng lệnh ghi; số trang và MB của từng index ở mỗi kích thước; bộ nhớ của cấu trúc phụ và `FT.INFO` |
| Dự đoán | Thời gian ghi tăng theo số index bị chạm. `UPDATE Description` gần như không đổi theo số index. Ở Redis, index tự quản lý thêm số lệnh; RediSearch thêm thời gian ngay trong `HSET` |
| Check | Dung lượng: bộ 6 > bộ 1 > 0 (cả hai DBMS). SQL: `update_rating` và `insert` đọc nhiều trang hơn khi có 6 index; `update_description` gần như không đổi (≤ 2 trang). Redis: `insert` với RediSearch 6 field và với 6 cấu trúc tự quản lý đều chậm hơn `HSET` một mình |

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
