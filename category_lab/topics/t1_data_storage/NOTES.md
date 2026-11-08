# Data Storage & Management

Người thực hiện: Nguyen Hoang Minh Quan

## Mục tiêu

So sánh cách MS SQL Server và Redis **tổ chức, lưu trữ và quản lý** dữ liệu của Novelle qua hai cặp scenario:

| Cặp | Trạng thái | Câu hỏi |
|---|---|---|
| `test_write_bottleneck` | Hoàn tất | Chi phí ghi và dung lượng lưu trữ khi nhập hàng loạt chương và khi tự động lưu bản nháp khác nhau thế nào? |
| `test_key_eviction` | Hoàn tất | Khi bộ nhớ không đủ chứa dữ liệu, mỗi DBMS quản lý tài nguyên ra sao, và dữ liệu nào của Novelle có nguy cơ bị mất? |

`test_write_bottleneck` dựa trên hai tình huống thực tế của chức năng F9 (viết chương):

- **`bulk_import`**: tác giả chuyển cả bộ truyện đã có sang Novelle. Ít lần ghi, mỗi lần rất nhiều dữ liệu.
- **`autosave`**: trình soạn thảo tự lưu bản nháp vài giây một lần. Rất nhiều lần ghi, mỗi lần một chương.

Theo thiết kế của Novelle (README backend, mục 5.5), autosave chỉ ghi vào Hash Redis `draft:{userId}:{chapterId}` (TTL 7 ngày); SQL Server chỉ nhận một lần `UPDATE` khi tác giả bấm Lưu. Thí nghiệm kiểm chứng thiết kế này.

`test_key_eviction` dựa trên tình huống **giờ cao điểm đọc truyện** (chức năng F4): người đọc tập trung vào một nhóm nhỏ chương "nóng" của các truyện đang hot. Nội dung chương được cache trên Redis theo mô hình cache-aside (`cache:chapter:{chapterId}`); khi cache không đủ chỗ, câu hỏi là Redis giữ lại chương nào, và dữ liệu nào bị mất. Theo đặc tả (data-dictionary, mục 8), dữ liệu Redis duy nhất có thể mất là lượt xem chưa kịp đổ xuống SQL Server (`views:*`), nên thí nghiệm theo dõi riêng loại dữ liệu này.

## Cách làm

### Môi trường

| Thành phần | Cấu hình |
|---|---|
| SQL Server | SQL Server 2019 **Express** (15.0.4490.9) trên AWS RDS ap-southeast-1, database `NovelleDB` |
| Redis | Redis Stack 7.4.2 chạy local trong Docker (WSL2); AOF bật, `appendfsync everysec`; RDB `save 3600 1 300 100 60 10000` |
| Cách đo | Lab chỉ đo **thời gian xử lý phía server** (SQL Server: thời gian thực thi câu lệnh; Redis: SLOWLOG). Thời gian mạng không được tính |

### Cặp `test_write_bottleneck`

**Dữ liệu** (giống nhau ở hai bên):

- **Dữ liệu ghi:** 500 chương thật đầu tiên của `dbo.Chapter` (`IsDeleted = 0`, theo `ChapterId`). Nội dung trung bình 22,6 KB mỗi chương.
- **Dữ liệu nền:** 1.500 chương thật nạp sẵn ở cả hai bên trước khi đo (khoảng 34 MB nội dung).
- Mỗi phép đo chạy **5 lần** (`repeat = 5`), sau **1 lần khởi động** không tính. Kết quả so sánh theo **p50**.

**Cấu trúc SQL Server:** `sandbox_table` chỉ sao chép cột và dữ liệu, nên cấu trúc của `dbo.Chapter` được dựng lại đúng theo `database/schema/02_indexes.sql` trên bảng `lab.data_storage__Chapter`:

- Clustered index (khóa chính) trên `ChapterId`.
- `UNIQUE IX_Story_No (StoryId, ChapterNo) INCLUDE (Title, Status, PublishedAt)`.
- `IX_Scheduled (ScheduledAt) WHERE Status = 'SCHEDULED'` (index có lọc).

**Cấu trúc Redis** (tiền tố `lab:data_storage:`):

| Cấu trúc | Key | Nội dung | Tương đương SQL Server |
|---|---|---|---|
| Hash chương | `chapter:{storyId}:{chapterNo}` | `title`, `content`, `wordCount`, `chapterNo`, `status` | Một dòng của bảng (clustered index và trang LOB) |
| Sorted Set mục lục | `toc:{storyId}` | member là key chương, score là `chapterNo` | `IX_Story_No` |
| Hash bản nháp | `draft:{userId}:{chapterId}` | `title`, `content`; TTL 7 ngày | Không có |

**Các phép ghi:**

| Label | SQL Server | Redis |
|---|---|---|
| `bulk_import` | Một câu `INSERT ... SELECT` nhập 500 chương thành một truyện mới. `StoryId = 1.000.000 + MAX(ChapterId)` để không trùng truyện thật và không vi phạm UNIQUE | Pipeline gồm 500 `HSET` và 500 `ZADD` vào một truyện mới (`storyId` từ 1.000.000) |
| `autosave` | `UPDATE Content` của một chương, nội dung thay đổi ở mỗi lần lưu | `HSET` và `EXPIRE` bản nháp của cùng chương đó, nội dung thay đổi ở mỗi lần lưu |

**Vì sao chọn cách đo này:**

- Ghi bằng **một câu lệnh hoặc một pipeline** để đo chi phí của DBMS, không phải chi phí của hàng trăm lượt đi về qua mạng.
- Dựng lại **đúng cấu trúc thật** của `dbo.Chapter` để kết quả phản ánh chi phí duy trì index như trên hệ thống thật.
- Dùng **chương thật** để kích thước dữ liệu và việc ghi trang LOB giống thực tế.
- Nạp **dữ liệu nền giống nhau** để hai DBMS xuất phát từ cùng trạng thái.

**Các đại lượng phụ**, đo trong **một lần nhập riêng** ngoài phần đo thời gian:

- `log_bytes`: hiệu số byte ghi vào file log (`sys.dm_io_virtual_file_stats`).
- `storage_bytes`: dung lượng mà **một truyện 500 chương** chiếm. SQL Server: số trang tăng thêm × 8 KB (trên đĩa). Redis: tổng `MEMORY USAGE` của 500 Hash và 1 Sorted Set (trong RAM). Cùng tên metric ở hai bên để lab so sánh trực tiếp.
- `pages_*`, `frag_*`: số trang và độ phân mảnh của từng index, đo trên **toàn bảng** sau thí nghiệm (5.000 dòng).
- `memory_bytes`: RAM của **một** key Redis (một Hash chương, một Hash bản nháp).

### Cặp `test_key_eviction`

**Dữ liệu:** 1.000 chương thật đầu tiên của `dbo.Chapter` (`IsDeleted = 0`, theo `ChapterId`), dùng chung cho cả hai DBMS.

**SQL Server:** bản sao 1.000 chương có khóa chính (`lab.data_storage__EvictChapter`).

- Trên RDS không có quyền `sysadmin`, nên không tự đặt được giới hạn bộ nhớ hay xóa bộ đệm. Bài test **quan sát** trạng thái buffer pool qua `sys.dm_os_buffer_descriptors`, `sys.dm_os_sys_info` và bộ đếm Page life expectancy.
- **Điều kiện môi trường** (không do bài test đặt): bộ nhớ mục tiêu của toàn bộ instance SQL Server là **287,6 MB** (`memory_target_mb`), trong đó buffer pool chỉ giữ khoảng **8 MB** trang dữ liệu (`buffer_pool_total_mb`).

**Redis** (chỉ chạy trên Redis local, `targets={"local"}`):

| Loại key | Key | TTL | Vai trò trong thí nghiệm |
|---|---|---|---|
| Cache chương | `cache:chapter:{chapterId}` (String JSON) | 30 phút | Dữ liệu tạm; bị xóa thì tải lại từ SQL Server |
| Bộ đếm lượt xem | `views:chapter:{chapterId}`, 100 key | Không có | "Chim báo": lượt xem chưa đồng bộ, bị xóa là mất thật |

- **Ràng buộc bộ nhớ:** `maxmemory` = bộ nhớ nền + 50% dung lượng của 1.000 chương, tức cache chỉ chứa được **khoảng 500 chương**.
- **Hai chính sách:** `noeviction` (mặc định của Redis, không tự xóa key) và `allkeys-lru` (xóa key ít được truy cập gần đây nhất, trên mọi key).
- **Quy trình cho mỗi chính sách** (cùng seed ngẫu nhiên, nên hai chính sách nhận đúng cùng một chuỗi thao tác):
  1. Nạp 100 bộ đếm lượt xem (giá trị 1 đến 50) khi chưa giới hạn bộ nhớ.
  2. Bật giới hạn, nạp 1.000 cache chương; xen kẽ các lượt đọc chương nóng như người đọc thật.
  3. **Tải đọc:** 5.000 lượt đọc cache-aside; **20% số chương là chương nóng, nhận 80% lượt đọc**. Miss thì ghi lại cache; chương có bộ đếm thì tăng lượt xem (`INCR`).
  4. Đếm key bị trục xuất, lệnh ghi bị từ chối, hit rate và phần trăm lượt xem bị mất.
- `setup` lưu cấu hình bộ nhớ; `teardown` (luôn chạy) bỏ giới hạn, xóa key và khôi phục cấu hình. Nếu phát hiện lần chạy trước bị ngắt, cấu hình được khôi phục về mặc định (`maxmemory 0`, `noeviction`).

**Vì sao chọn cách đo này:**

- Dùng **nội dung chương thật** để kích thước cache giống thực tế (khoảng 16,5 KB mỗi chương).
- Giới hạn **50%** đủ để eviction xảy ra rõ ràng, trong khi nhóm chương nóng (20%) vẫn vừa trong cache. Nhờ vậy đo được tác dụng của LRU.
- Dùng bộ đếm lượt xem để phân biệt **dữ liệu tạm** (cache, có bản gốc ở SQL Server) với **dữ liệu chưa đồng bộ** (lượt xem).

**Các đại lượng chính:**

- SQL Server: `buffer_pct · sandbox` (phần trăm trang của bản sao đang nằm trong RAM), `page_life_expectancy` (thời gian trung bình một trang nằm trong RAM), `rows_lost` (số dòng bị mất).
- Redis, theo từng chính sách: `evicted_keys` (số key bị trục xuất), `oom_errors` (số lệnh ghi bị từ chối), `hit_rate_hot` và `hit_rate_all` (tỷ lệ đọc trúng cache với chương nóng và toàn bộ), `views_lost_pct` (phần trăm lượt xem bị mất).

## Kết quả và nhận xét

### `test_write_bottleneck`

**Thời gian ghi (`server_ms`, p50)**

| Label | SQL Server | Redis | SQL / Redis |
|---|---|---|---|
| `bulk_import` (500 chương) | 762,3 ms (p95 943,4), khoảng 1,52 ms mỗi chương | 42,87 ms (p95 48,26), khoảng 86 µs mỗi chương | khoảng 18 lần |
| `autosave` (1 chương) | 2,00 ms* (p95 3,00) | 0,008 ms* (p95 0,011) | khoảng 250 lần |

\* Độ phân giải của phép đo lớn hơn 10% giá trị, nên chữ số cuối không đáng tin.

**Dung lượng của một truyện 500 chương (`storage_bytes`)**

| SQL Server | Redis | SQL / Redis |
|---|---|---|
| 12,53 MB trên đĩa (1.530 trang, khoảng 25,1 KB mỗi chương) | 8,79 MB trong RAM (khoảng 17,6 KB mỗi chương, kể cả mục lục) | khoảng 1,43 lần |

**Cấu trúc lưu trữ SQL Server (toàn bảng, 5.000 dòng)**

| Thành phần | Số trang | Tỷ lệ | Độ phân mảnh |
|---|---|---|---|
| `pages_data_lob` (nội dung chương) | 15.168 | khoảng 98,8% | |
| `pages_data_inrow` (dòng của clustered index) | 125 | khoảng 0,8% | 2,44% |
| `pages_IX_Story_No` | 59 | khoảng 0,4% | 15,79% |
| `pages_IX_Scheduled` | 2 | khoảng 0,01% | 0% |

`log_bytes` cho một lần nhập: **12,89 MB**. Redis: một Hash chương chiếm 16.864 byte; một Hash bản nháp chiếm 16.656 byte.

**Nhận xét**

1. **SQL Server tổ chức dữ liệu theo trang 8 KB và tách nội dung lớn ra trang LOB.**
   - Nội dung chương (`NVARCHAR(MAX)`, khoảng 22,6 KB) vượt kích thước một trang, nên được lưu ở trang LOB, khoảng 3 trang mỗi chương. Trang LOB chiếm khoảng 98,8% dung lượng bảng; phần dòng của bảng rất gọn (khoảng 40 dòng mỗi trang).
   - Hai index phụ chiếm dưới 0,5% dung lượng, nên **chi phí lưu trữ index không phải nút cổ chai**. `IX_Scheduled` gần như rỗng vì các chương nhập vào đều là `DRAFT`, nên index có lọc không bị chạm khi ghi.
   - **`log_bytes` (12,89 MB) xấp xỉ `storage_bytes` (12,53 MB).** Theo cơ chế ghi nhật ký trước (WAL), toàn bộ nội dung được ghi vào transaction log trước khi ghi vào trang dữ liệu, tức mỗi chương thực chất được **ghi hai lần**. Đây là chi phí cốt lõi của write bottleneck trên SQL Server.
   - `ChapterId` tăng dần và `StoryId` của truyện mới luôn lớn nhất, nên dòng mới luôn nằm cuối mọi B-tree, **không gây page split**. Độ phân mảnh 15,79% của `IX_Story_No` không phản ánh page split: index chỉ có 59 trang, và các extent của clustered index, trang LOB và index phụ xen kẽ nhau khi cùng lớn lên. Microsoft khuyên bỏ qua chỉ số phân mảnh của index dưới khoảng 1.000 trang.

2. **Redis lưu mỗi chương thành một Hash trong RAM.**
   - Nội dung dài hơn ngưỡng 64 byte của listpack, nên Hash dùng encoding `hashtable`.
   - Sorted Set `toc` đóng vai trò mục lục có thứ tự, tương tự `IX_Story_No`. Khác biệt: Redis **không kiểm tra trùng**; ghi lại cùng một key sẽ ghi đè âm thầm, trong khi unique index của SQL Server báo lỗi.
   - Toàn bộ dữ liệu phải nằm thường trực trong RAM.

3. **Dung lượng chênh lệch khoảng 1,43 lần, chủ yếu do mã hóa văn bản.**
   - `NVARCHAR` của SQL Server dùng **UTF-16** (2 byte mỗi ký tự); Redis lưu chuỗi **UTF-8** (khoảng 1,5 byte mỗi ký tự tiếng Việt). Riêng điểm này cho tỷ lệ khoảng 1,38.
   - Phần còn lại là khoảng trống trong trang LOB (22,6 KB nội dung trong 24 KB trang) và các trang của index.
   - Hai con số đo trên hai phương tiện khác nhau: SQL Server chỉ đưa vào RAM những trang đang dùng, còn Redis phải giữ toàn bộ 8,79 MB trong RAM.

4. **Thời gian ghi: Redis nhanh hơn khoảng 18 lần khi nhập hàng loạt và khoảng 250 lần khi autosave.**
   - SQL Server phải duy trì B-tree, cấp phát trang LOB, kiểm tra ràng buộc UNIQUE, và **chờ log được ghi bền vững xuống đĩa** trước khi commit. Redis chỉ ghi vào bảng băm và Sorted Set trong RAM, không chờ đĩa.
   - Khi `bulk_import`, chi phí cố định của transaction SQL (commit, chờ ghi log) được chia đều cho 500 chương. Khi `autosave`, một chương phải chịu trọn chi phí đó. Vì vậy chênh lệch ở `autosave` lớn hơn nhiều.
   - Kết quả **kiểm chứng thiết kế của Novelle**: thao tác càng nhỏ và càng thường xuyên, lợi thế của Redis càng lớn. Lưu bản nháp trên Redis và chỉ ghi xuống SQL Server khi tác giả bấm Lưu là hợp lý.
   - **Đánh đổi:** tốc độ của Redis đi kèm việc không bảo đảm độ bền tức thời. Với `appendfsync everysec`, Redis có thể mất tới khoảng 1 giây dữ liệu khi sự cố xảy ra. Mất vài giây cuối của một bản nháp là chấp nhận được; với dữ liệu chính thức thì không.

5. **Biến động của Redis `bulk_import`.** Ở lần chạy này, Redis mất khoảng 86 µs mỗi chương khi nhập hàng loạt, cao hơn nhiều so với khoảng 8 µs mỗi lần lưu ở `autosave`. Giả thuyết: lượng ghi lớn (dữ liệu nền cộng nhiều lần nhập) kích hoạt cơ chế bền vững chạy nền của Redis (BGSAVE theo quy tắc `save 60 10000`, hoặc ghi lại AOF), và tiến trình `fork()` làm tăng thời gian xử lý lệnh ghi trong lúc chạy. Đây chính là hiện tượng khuếch đại ghi đã nêu trong phần lý thuyết. Giả thuyết cần được kiểm chứng bằng `INFO persistence` và `latest_fork_usec` trước và sau khi đo.

**Giới hạn**

- Bảng sandbox không có khóa ngoại, `CHECK` và trigger `trg_Chapter_Revision`. Trên hệ thống thật, mỗi lần lưu còn ghi thêm một bản revision, nên thời gian SQL Server đo được là **cận dưới**.
- RDS được cả nhóm dùng chung, nên thời gian và `log_bytes` có thể bị ảnh hưởng bởi hoạt động khác.
- Phần cứng hai bên khác nhau: SQL Server chạy trên instance RDS Express với ổ đĩa mạng; Redis chạy local trong Docker. Các tỷ lệ chỉ mang tính xấp xỉ; thứ tự độ lớn của chênh lệch mới là kết luận chính.
- Kịch bản `bulk_import` phía Redis là phương án giả định. Trong Novelle, SQL Server là nơi lưu chính của chương.
- Chuỗi tiếng Việt ghi vào Redis được đệm tối đa 3 khoảng trắng để SLOWLOG không cắt giữa một ký tự UTF-8 (lỗi giải mã trong `lab/framework/bench.py`, đã báo trưởng nhóm). Sai lệch dung lượng dưới 0,02%.

### `test_key_eviction`

**SQL Server: buffer pool khi thiếu RAM**

| Đại lượng | Giá trị | Ý nghĩa |
|---|---|---|
| `buffer_pct · sandbox` | 5,2% | Bản sao 1.000 chương vừa tạo chỉ còn 5,2% số trang trong RAM |
| `page_life_expectancy · server` | 2 giây | Một trang chỉ nằm trong RAM khoảng 2 giây trước khi bị đẩy ra |
| `rows_lost · dataset` | 0 dòng | Không mất dòng nào |

**Redis: hai chính sách trên cùng dung lượng cache (khoảng 500 chương)**

| Đại lượng | `noeviction` | `allkeys-lru` |
|---|---|---|
| `evicted_keys` | 0 | 1.566 |
| `oom_errors` | 3.598 | 0 |
| `hit_rate_hot` | 47% | **91,8%** |
| `hit_rate_all` | 46,9% | **81,7%** |
| `views_lost_pct` | 15,3% | **87,3%** |

Số chương còn trong cache ở cuối thí nghiệm: 501 (`noeviction`) và 499 (`allkeys-lru`), xác nhận giới hạn bộ nhớ hoạt động như nhau ở hai chính sách.

**Nhận xét**

1. **SQL Server: RAM chỉ là bộ đệm, dữ liệu luôn nằm trên đĩa.**
   - SQL Server trên RDS đang chịu áp lực bộ nhớ **thật**: buffer pool chỉ khoảng 8 MB, các trang chỉ sống khoảng 2 giây trong RAM, và bản sao vừa tạo chỉ còn 5,2% trong RAM.
   - Dù vậy, `rows_lost = 0`. Buffer pool chỉ giữ **bản sao** của trang; trang bị đẩy ra vẫn còn trên đĩa, và trang bẩn được ghi xuống đĩa trước khi giải phóng. Khi thiếu RAM, SQL Server chỉ phải đọc lại trang từ đĩa, tức là chậm hơn.

2. **Redis với `noeviction`: giữ dữ liệu cũ, từ chối dữ liệu mới.**
   - Không key nào bị xóa, nhưng **3.598 lệnh ghi bị từ chối** (lỗi OOM): phần chương còn lại khi nạp, các lần ghi lại cache sau khi miss, và các lệnh tăng lượt xem.
   - Cache "đóng băng" ở những chương **được nạp trước**, không cập nhật theo nhu cầu đọc. Hit rate xấp xỉ tỷ lệ dung lượng cache: 47% với chương nóng, 46,9% tổng thể.
   - Mất 15,3% lượt xem: số liệu cũ được giữ nguyên, nhưng các lệnh tăng lượt xem mới bị từ chối.

3. **Redis với `allkeys-lru`: giữ dữ liệu được dùng gần đây, xóa phần còn lại.**
   - 1.566 key bị trục xuất, nhiều hơn số chương, vì chương bị xóa rồi được đọc lại sẽ được ghi lại và có thể bị xóa lần nữa. Không lệnh ghi nào bị từ chối.
   - **Cùng dung lượng cache**, nhưng LRU giữ lại chương được đọc gần đây. Hit rate tăng lên 91,8% với chương nóng và 81,7% tổng thể, gần mức tối đa lý thuyết khoảng 87,5% (80% × 100% + 20% × 300/800). Phần thiếu là do Redis chỉ dùng **LRU xấp xỉ**, lấy mẫu `maxmemory-samples = 5` key.
   - Mất 87,3% lượt xem: bộ đếm của các chương ít đọc ít được truy cập, nên bị LRU xóa như các key cache. Lần tăng sau tạo lại bộ đếm từ 1, khiến số lượt xem chưa đồng bộ mất gần hết.

4. **Điểm chú ý trọng tâm.**
   - Hai chính sách Redis có **cùng dung lượng**; khác biệt nằm ở **key nào được giữ lại**.
   - Redis mất dữ liệu theo **hai cách khác nhau**: `noeviction` **từ chối dữ liệu mới**, còn `allkeys-lru` **xóa dữ liệu cũ**.
   - SQL Server đánh đổi **tốc độ** để giữ **dữ liệu**; Redis đánh đổi **dữ liệu** để giữ **tốc độ** và khả năng tiếp nhận ghi.

5. **Khuyến nghị cho Novelle.** `allkeys-lru` phù hợp cho một Redis **chỉ chứa cache** (`cache:*`), vì dữ liệu bị xóa luôn được tải lại từ SQL Server. Bộ đếm `views:*` và bản nháp `draft:*` không nên đặt chung trong một Redis giới hạn bộ nhớ với chính sách này. Hãy dùng chính sách chỉ xóa key có TTL (`volatile-lru`, `volatile-ttl`), hoặc tách thành instance riêng. Khuyến nghị về `volatile-*` dựa trên tài liệu Redis, chưa được đo trong thí nghiệm này.

**Giới hạn**

- Phía SQL Server chỉ **quan sát** trạng thái buffer pool; không tự đặt được giới hạn bộ nhớ trên RDS. Trạng thái này phụ thuộc vào hoạt động của cả nhóm tại thời điểm chạy.
- Thời gian đọc một chương (`read_chapter`) không được dùng để kết luận: Redis đo khi chưa có áp lực bộ nhớ, còn SQL Server đo khi buffer pool đang thiếu RAM.
- Tải đọc là mô phỏng (20% chương nhận 80% lượt đọc, seed cố định), không phải nhật ký truy cập thật.
- Chỉ thử hai chính sách; `volatile-lru`, `volatile-ttl` và `allkeys-lfu` chưa được đo.

## Tài liệu tham khảo

### MS SQL Server

- **Microsoft Learn, *Pages and extents architecture guide*.** Cấu trúc trang 8 KB, extent 64 KB và các trang quản lý cấp phát GAM, SGAM, PFS, IAM, DCM, BCM; cách lưu dữ liệu LOB.
  Dùng cho: tổ chức trang và trang LOB (`test_write_bottleneck`).
- **Microsoft Learn, *Memory management architecture guide*.** Cách buffer pool nạp các trang 8 KB từ đĩa lên RAM, và cơ chế Lazy Writer, Checkpoint xử lý trang bẩn.
  Dùng cho: buffer pool, Page life expectancy, `rows_lost = 0` (`test_key_eviction`).
- **Microsoft Learn, *sys.dm_os_buffer_descriptors* và *sys.dm_os_sys_info*.** Các view hệ thống dùng để đếm trang trong buffer pool và đọc bộ nhớ mục tiêu của instance.
  Dùng cho: `buffer_pct`, `buffer_pool_total_mb`, `memory_target_mb` (`test_key_eviction`).
- **Microsoft Learn, *SQL Server transaction log architecture and management guide*.** Cơ chế ghi nhật ký trước (write-ahead logging) và vai trò của transaction log.
  Dùng cho: `log_bytes` xấp xỉ dung lượng dữ liệu (`test_write_bottleneck`).
- **Microsoft Learn, *Clustered and nonclustered indexes described*.** Cấu trúc B-tree của index, phân biệt bảng heap và bảng có clustered index.
  Dùng cho: clustered PK, `IX_Story_No`, bảng sandbox là heap.
- **Microsoft Learn, *sys.dm_db_index_physical_stats*.** Cách tính độ phân mảnh, và khuyến nghị bỏ qua phân mảnh của index nhỏ.
  Dùng cho: diễn giải `frag_*`.
- **Dmitri Korotkevitch, *Pro SQL Server Internals* (Apress), chương 1 và 2.** Nguyên lý lưu trữ vật lý ở cấp byte: cấu trúc dòng, trang, bảng và chỉ mục.

### Redis

- **Redis documentation, *Redis persistence*.** Cơ chế lưu xuống đĩa bằng RDB (snapshot định kỳ, dùng `fork()`) và AOF (ghi nối tiếp từng lệnh, các chế độ `appendfsync`).
  Dùng cho: đánh đổi độ bền và giả thuyết về biến động thời gian ghi (`test_write_bottleneck`).
- **Redis documentation, *Memory optimization*.** Cấp phát bộ nhớ (jemalloc) và mã hóa gọn các cấu trúc nhỏ (listpack, trước Redis 7 là ziplist; intset).
  Dùng cho: encoding `hashtable` của Hash chương, chi phí metadata của mỗi key.
- **Redis documentation, *Key eviction*.** Tham số `maxmemory`, các chính sách trục xuất (`allkeys-lru`, `allkeys-lfu`, `volatile-ttl`…) và thuật toán LRU, LFU xấp xỉ bằng lấy mẫu ngẫu nhiên.
  Dùng cho: hành vi của `noeviction`, `allkeys-lru` và LRU xấp xỉ (`test_key_eviction`).
- **Redis documentation, *Redis data types*.** Các kiểu dữ liệu Hash, Sorted Set, mô hình xử lý đơn luồng.
- **Josiah L. Carlson, *Redis in Action* (Manning).** Cách dùng các cấu trúc dữ liệu của Redis cho bài toán thực tế.

### Tài liệu đối chiếu

- **Martin Kleppmann, *Designing Data-Intensive Applications* (O'Reilly), chương 3: Storage and Retrieval.** So sánh hash index, LSM-tree và B-tree; hiện tượng khuếch đại ghi (write amplification).
  Dùng cho: khung lý thuyết so sánh B-tree của SQL Server với bảng băm của Redis.
- **Martin Kleppmann, *Designing Data-Intensive Applications*, chương 7: Transactions.** Transaction ACID; thực thi tuần tự trên một luồng bằng stored procedure, có nhắc tới Redis và Lua.
  Dùng cho: đối chiếu độ bền khi commit của SQL Server với Redis.

### Tài liệu của dự án Novelle

- `novelle_backend/README.md`, mục 5.5: thiết kế autosave bằng Hash Redis `draft:{userId}:{chapterId}`.
- `novelle_backend/database/schema/01_tables.sql`, `02_indexes.sql`: cấu trúc thật của `dbo.Chapter` và các index.
- `docs/data-dictionary.md`, mục 8: thiết kế key Redis (`cache:chapter:*` TTL 30 phút, `views:*` không TTL, `draft:*` TTL 7 ngày) và nhận định dữ liệu Redis duy nhất có thể mất là lượt xem chưa flush.