# Query Processing

Người thực hiện: Dang Quang Phong

## 1. Mục tiêu

Tìm hiểu **SQL Server và Redis thực thi một truy vấn như thế nào**, trên các truy vấn thật của web Novelle:

- **SQL Server** có *query optimizer*: nhận câu SQL, ước tính chi phí của nhiều cách làm, chọn một **execution plan** (kế hoạch thực thi). Với mỗi truy vấn, đề tài xem plan gồm những bước nào (Scan, Seek, Key Lookup, thuật toán join, Sort, Aggregate…), số dòng ước tính so với thực tế, số trang đọc, thời gian, và **plan có đổi khi dữ liệu tăng không, vì sao**.
- **Redis** không có optimizer: các bước là những lệnh do người viết code chọn. Đề tài mô tả các bước đó, số lệnh, và thời gian.

Phạm vi: 5 loại truy vấn mà đề bài yêu cầu ứng dụng phải có (một điều kiện, nhiều điều kiện, join, subquery, hàm tổng hợp).

**Khác với đề tài Indexing:** index ở đây là **điều kiện có sẵn** của schema web (giữ nguyên, không tạo thêm, không so sánh loại index, không đo chi phí ghi hay dung lượng). Đề tài chỉ quan sát optimizer **dùng** các index có sẵn ra sao.

## 2. Môi trường và dữ liệu

### 2.1. Môi trường

| | SQL Server | Redis |
|---|---|---|
| Phiên bản | SQL Server 2019 Express (15.0.4490.9) | Redis Stack 7.4.2 |
| Nơi chạy | AWS RDS db.t3.micro (2 vCPU, ~1 GB RAM), dùng chung cả nhóm | Docker trên máy cá nhân |
| Đo thời gian | Thời gian xử lý phía server: `SYSDATETIME()` quanh vòng lặp chạy câu lệnh nhiều lần, chia trung bình | Tổng thời gian các lệnh trong `SLOWLOG` |
| Thông tin thêm | Actual execution plan, `STATISTICS IO` (logical reads = số trang 8 KB đọc từ bộ đệm) | Số lệnh của mỗi lần chạy |

- Chỉ đo thời gian **phía server**, không tính mạng giữa máy chạy lab và RDS, nên hai DBMS so được với nhau.
- Để không tính thời gian gửi kết quả qua mạng, bản đo của SQL Server gán kết quả vào biến (cùng plan), còn Redis chạy các bước trong một script Lua và chỉ trả về số dòng.
- Mỗi con số thời gian là trung vị (p50) của 10 lần đo.

### 2.2. Dữ liệu: ba mức 150 / 1.000 / 10.000 truyện

Dữ liệu web hiện có 150 truyện, quá ít để optimizer phải cân nhắc (cả bảng Story chỉ 13 trang). Lab tạo **bản sao** dữ liệu web ở ba mức, trong schema `lab` (không đụng `dbo.*`, tự xoá sau mỗi lần chạy):

- Nhân bản 150 truyện thật; mỗi bản sao giữ nguyên trạng thái, rating, số chương, thể loại, lượt xem theo ngày của truyện gốc.
- Mỗi bản sao có **tác giả mới**: web lớn lên vì có thêm tác giả, nên một tác giả vẫn có khoảng 4 truyện ở mọi mức. Nếu giữ nguyên tác giả thì mỗi tác giả sẽ có thêm truyện theo đúng tỉ lệ, plan sẽ không bao giờ đổi.
- `Genre` không nhân bản (20 thể loại ở mọi mức).
- Redis được nạp từ **chính các bản sao này**, nên hai DBMS làm việc trên cùng dữ liệu.

**Số dòng từng bảng:**

| Bảng | 150 truyện | 1.000 truyện | 10.000 truyện | Ghi chú |
|---|---|---|---|---|
| `Story` | 150 (13 trang) | 1.000 (75 trang) | 10.000 (736 trang) | Mỗi dòng rộng (có `Description`), khoảng 13 truyện/trang |
| `Author` | 30 | 210 | 2.010 | |
| `StoryGenre` | 285 | 1.904 | 19.004 | Một truyện có 1–3 thể loại, đúng 1 thể loại chính |
| `Genre` | 20 | 20 | 20 | Không nhân bản |
| `StoryViewDaily` | 11.979 | 79.933 | 798.673 | Một dòng cho mỗi (truyện, ngày), từ 01/08 đến 29/10/2026 |

Không dùng mức 100.000: RDS free tier chỉ còn khoảng 6,6 MB bộ nhớ cho sắp xếp và bảng băm. Khi thử tạo dữ liệu ở mức đó, câu lệnh đứng chờ bộ nhớ (`RESOURCE_SEMAPHORE`) và chặn các phiên khác của RDS.

### 2.3. Index có sẵn của web

Các bản sao có **đúng các index** của schema web (`02_indexes.sql`):

| Bảng | Index | Cột (khoá) | Ghi chú |
|---|---|---|---|
| `Story` | `PK_Story` (clustered) | `StoryId` | Bảng được sắp vật lý theo `StoryId` |
| | `UQ_Story_Slug` | `Slug` | Unique |
| | `IX_Story_Author` | `AuthorId` | |
| | `IX_Story_RatingAvg` | `RatingAvg DESC` | |
| | `IX_Story_ViewCount` | `ViewCount DESC` | |
| | `IX_Story_Public_LastChapter` | `LastChapterAt DESC`, include `Title, CoverUrl, ChapterCount, AuthorId` | Filtered: chỉ truyện `PUBLISHED`, chưa xoá |
| `Author` | `PK_Author` (clustered) | `UserId` | |
| | `UQ_Author_PenName` | `PenName` | Unique |
| `StoryGenre` | `PK_StoryGenre` (clustered) | `StoryId, GenreId` | |
| | `IX_StoryGenre_Genre` | `GenreId, StoryId` | |
| | `UX_StoryGenre_Primary` | `StoryId` | Filtered: `IsPrimary = 1` |
| `Genre` | `PK_Genre` (clustered) | `GenreId` | |
| | `UQ_Genre_Slug`, `UQ_Genre_Name` | `Slug`, `Name` | Unique |
| `StoryViewDaily` | `PK_StoryViewDaily` (clustered) | `StoryId, ViewDate` | |
| | `IX_StoryViewDaily_Date` | `ViewDate`, include `Views` | |

Không có index trên `CompletionStatus`, `ChapterCount`, `PublishStatus`.

### 2.4. Thuật ngữ dùng trong bài

| Thuật ngữ | Nghĩa |
|---|---|
| Clustered Index Scan | Đọc cả bảng từ đầu đến cuối |
| Index Seek | Tra index để nhảy thẳng tới các dòng cần |
| Key Lookup | Sau khi tra index phụ, quay lại bảng chính lấy các cột index không có |
| Seek Predicate | Điều kiện được dùng để tra index |
| Residual Predicate | Điều kiện chỉ được kiểm tra lại trên từng dòng đã đọc ra |
| Nested Loops | Join bằng cách: với mỗi dòng bên ngoài, tra bên trong một lần |
| Hash Match (join) | Đưa một bên vào bảng băm trong bộ nhớ, rồi đọc bên kia một lượt và ghép |
| Stream Aggregate | Gom nhóm trên dữ liệu **đã sắp** theo khoá nhóm: cộng dồn, sang nhóm mới thì ghi kết quả |
| Hash Match (aggregate) | Gom nhóm bằng bảng băm, không cần dữ liệu đã sắp |
| Sort / Top | Sắp xếp / lấy N dòng đầu rồi dừng |
| Table Spool | Bảng tạm giữ kết quả trung gian để dùng lại |
| Logical reads | Số trang 8 KB đọc từ bộ đệm |

## 3. Kết quả từng truy vấn

Số đo thời gian của lần chạy `20261107-115331` (07/11/2026), cũng là lần chạy dùng cho report này. Plan, số dòng và số trang đọc giống hệt nhau giữa các lần chạy; thời gian thì dao động (nhất là ở mức 10.000 trên RDS và các con số dưới 1 ms của Redis), nên dưới mỗi bảng có thêm một dòng ghi mức thời gian khoảng.

### 3.1. Truy vấn một điều kiện: truyện của một tác giả (F3, trang tác giả)

```sql
SELECT StoryId, Title, Slug, CompletionStatus, ChapterCount, RatingAvg, LastChapterAt
FROM Story WHERE AuthorId = ? ORDER BY LastChapterAt DESC
```

- **Bảng dùng:** `Story` (150 / 1.000 / 10.000 dòng).
- **Điều kiện và index liên quan:** `AuthorId = ?` có index `IX_Story_Author (AuthorId)`; index này chỉ chứa `AuthorId` (và khoá `StoryId`). Không có index nào xếp theo `LastChapterAt` trong từng tác giả.
- **Dữ liệu:** tác giả có số truyện trung vị (AuthorId 25): **4 truyện** ở mọi mức.

| Số truyện | Plan SQL Server | Dự đoán / thực tế | Trang đọc | SQL Server | Redis |
|---|---|---|---|---|---|
| 150 | Clustered Index Scan → Sort | 4 / 4 | 13 | 0,21 ms | 0,07 ms |
| 1.000 | Index Seek `IX_Story_Author` → Key Lookup → Sort | 4 / 4 | 10 | 0,10 ms | 0,05 ms |
| 10.000 | như trên | 3,7 / 4 | 14 | 0,11 ms | 0,04 ms |

Thời gian: cả hai DBMS đều dưới 0,3 ms ở mọi mức; chênh lệch giữa các mức nằm trong sai số đo.

**Giải thích:**
- Bảng 150 truyện chỉ 13 trang: đọc hết còn rẻ hơn tra index rồi lookup từng truyện, nên optimizer chọn quét cả bảng.
- Từ 1.000 truyện, bảng 75 trang trở lên mà chỉ cần 4 truyện, nên optimizer chuyển sang tra index rồi lookup (khoảng 10–14 trang).
- `Sort` vì các truyện tìm được không nằm sẵn theo `LastChapterAt`.
- Ước tính số dòng gần đúng nhờ statistics của index.

**Redis:** Sorted Set `author:<id>:stories` (score = thời điểm cập nhật). Các bước: `ZREVRANGE` lấy id đã xếp sẵn, rồi `HMGET` từng truyện, tổng **5 lệnh** ở mọi mức; không cần bước sắp xếp vì thứ tự được giữ lúc ghi. Chênh lệch thời gian giữa các mức (vài chục micro giây) là nhiễu đo.

### 3.2. Truy vấn nhiều điều kiện: tìm truyện (F2, tìm kiếm và lọc)

```sql
SELECT StoryId, Title, Slug, RatingAvg, ChapterCount FROM Story
WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0
  AND CompletionStatus = 'COMPLETED' AND RatingAvg >= 4 AND ChapterCount >= 20
ORDER BY RatingAvg DESC OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY
```

- **Bảng dùng:** `Story`.
- **Điều kiện và index liên quan:** 5 điều kiện; chỉ `RatingAvg` có index (`IX_Story_RatingAvg`, xếp giảm dần). `CompletionStatus`, `ChapterCount`, `PublishStatus`, `IsDeleted` không có index.
- **Dữ liệu:** số truyện khớp 24 / 161 / 1.601; trang đầu lấy 20.

| Số truyện | Plan SQL Server | Seek Predicate | Residual Predicate | Xem bao nhiêu dòng | Trang đọc | SQL Server | Redis |
|---|---|---|---|---|---|---|---|
| 150 | Clustered Index Scan → Sort (top 20) | không có | cả 5 điều kiện | 150 | 13 | 0,61 ms | 0,38 ms |
| 1.000 | như trên | không có | cả 5 điều kiện | 1.000 | 75 | 2,81 ms | 0,30 ms |
| 10.000 | Index Seek `IX_Story_RatingAvg` → Key Lookup → Top | `RatingAvg >= 4` | 4 điều kiện còn lại | 77 | 246 | 0,58 ms | 0,30 ms |

Thời gian: SQL Server chậm nhất ở 1.000 truyện (khoảng 2–3 ms, quét cả bảng) và nhanh lại ở 10.000 truyện (dưới 1 ms, nhờ dừng sớm); Redis dưới 1 ms ở mọi mức.

**Giải thích:**
- Một index chỉ giúp tra theo cột của nó, nên chỉ điều kiện rating có thể thành Seek Predicate; các điều kiện khác phải kiểm tra trên từng truyện.
- Ở mức nhỏ, quét cả bảng rồi sắp xếp vẫn rẻ.
- Ở 10.000, optimizer đi theo index rating từ cao xuống, kiểm tra từng truyện, **đủ 20 truyện thì dừng** (`Top`): chỉ xem 77 truyện thay vì 10.000. Vì vậy ở 10.000 truyện nó **nhanh hơn** ở 1.000 truyện.
- Plan có `CONVERT(nvarchar, CompletionStatus)`: cột kiểu `VARCHAR` nhưng tham số được driver gửi dạng `NVARCHAR`, nên SQL Server phải đổi kiểu cột trước khi so sánh (ứng dụng Java/JDBC mặc định cũng gửi chuỗi dạng Unicode).

**Redis:** Sorted Set `by_rating` (score = rating) + Hash mỗi truyện. Các bước: `ZREVRANGEBYSCORE … +inf 4 LIMIT offset 50` lấy từng lô 50 id từ rating cao xuống, `HMGET` từng truyện, script tự kiểm tra các điều kiện còn lại, đủ 20 thì dừng: 66–94 lệnh. Cách làm giống plan của SQL Server ở mức 10.000, nhưng do người viết code chọn từ trước (kể cả kích thước lô 50).

### 3.3. Truy vấn có join: trang thể loại (F2)

```sql
SELECT s.StoryId, s.Title, s.Slug, s.LastChapterAt, a.PenName, g.Name AS GenreName
FROM Genre g
JOIN StoryGenre sg ON sg.GenreId = g.GenreId
JOIN Story s       ON s.StoryId = sg.StoryId
JOIN Author a      ON a.UserId = s.AuthorId
WHERE g.Slug = 'tien-hiep' AND s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0
ORDER BY s.LastChapterAt DESC OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY
```

- **Bảng dùng (4 bảng):** `Genre` (20), `StoryGenre` (285 / 1.904 / 19.004), `Story` (150 / 1.000 / 10.000), `Author` (30 / 210 / 2.010).
- **Điều kiện, khoá join và index liên quan:**
  - `Genre.Slug`: `UQ_Genre_Slug`.
  - `StoryGenre.GenreId`: `IX_StoryGenre_Genre (GenreId, StoryId)`.
  - `Story.StoryId`: khoá chính.
  - `Author.UserId`: khoá chính.
- **Dữ liệu:** thể loại Tiên hiệp (nhiều truyện nhất) có 19 / 129 / 1.269 truyện công khai.

| Số truyện | Genre ⋈ StoryGenre | … ⋈ Story | … ⋈ Author | Trang đọc | SQL Server | Redis |
|---|---|---|---|---|---|---|
| 150 | Nested Loops | Nested Loops (tra Story 19 lần) | Nested Loops (19 lần) | 81 | 0,33 ms | 0,11 ms |
| 1.000 | Nested Loops | Nested Loops (129 lần) | Nested Loops (20 lần) | 321 | 1,10 ms | 0,14 ms |
| 10.000 | Nested Loops | **Hash Match** (đọc cả bảng Story) | Nested Loops (20 lần) | 784 | 20,63 ms | 0,15 ms |

Thời gian: SQL Server từ dưới 0,5 ms (150 truyện) lên khoảng 1 ms (1.000) và 20–30 ms (10.000); Redis dưới 0,5 ms ở mọi mức.

**Giải thích:**
- Thuật toán được chọn **riêng cho từng phép join**, theo **số dòng đi vào phép join đó**:
  - Nested Loops tốn công theo số dòng cần ghép (mỗi dòng một lần tra, khoảng 2 trang).
  - Hash Match tốn công theo kích thước bảng, cộng thêm phần chuẩn bị cố định (xin bộ nhớ, dựng bảng băm).
- **Ghép Story:** 19 hay 129 truyện thì tra từng cái vẫn rẻ. 1.269 truyện thì tra từng cái tốn khoảng 2.500 trang đọc rời rạc, trong khi đọc cả bảng chỉ 736 trang, nên optimizer chuyển sang Hash Match.
- **Genre ⋈ StoryGenre** chỉ có 1 dòng vào (một thể loại): một lần tra index là ra mọi truyện của thể loại.
- **Author** được ghép **sau cùng**, sau khi đã sắp xếp và lấy 20 truyện, nên chỉ còn 20 lần tra: optimizer tự đổi thứ tự công việc để phép join này nhỏ.

**Redis:** không có join, code tự ghép. Sorted Set `genre:<id>:stories` chỉ chứa truyện công khai (score = thời điểm cập nhật), Hash mỗi truyện, Hash bút danh mỗi tác giả. Các bước: `ZREVRANGE 0 19`, `HGET` tên thể loại, rồi với mỗi truyện `HMGET` thông tin và `HGET` bút danh tác giả: **42 lệnh** ở mọi mức. Đây giống Nested Loops do người viết code tự làm. Đổi lại, ứng dụng phải cập nhật sorted set của thể loại mỗi khi truyện được đăng, ẩn hoặc có chương mới.

### 3.4. Truy vấn có subquery: truyện nổi bật hơn trung bình của tác giả (F1)

```sql
SELECT s.StoryId, s.Title, s.Slug, s.AuthorId, s.RatingAvg FROM Story s
WHERE s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0
  AND s.RatingAvg > (SELECT AVG(s2.RatingAvg) FROM Story s2
                     WHERE s2.AuthorId = s.AuthorId
                       AND s2.PublishStatus = 'PUBLISHED' AND s2.IsDeleted = 0)
ORDER BY s.RatingAvg DESC OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY
```

- **Bảng dùng:** `Story` (dùng hai lần: câu ngoài và câu con).
- **Loại subquery:** tương quan (correlated), vì câu con dùng `AuthorId` của dòng bên ngoài.
- **Index liên quan:** `IX_Story_Author (AuthorId)`, `IX_Story_RatingAvg (RatingAvg DESC)`.
- **Dữ liệu:** 27 / 188 / 1.808 tác giả có truyện công khai; 68 / 453 / 4.533 truyện vượt trung bình tác giả; trang đầu lấy 20.

| Số truyện | Cách SQL Server thực thi | Số lần tính trung bình | Trang đọc* | SQL Server | Redis |
|---|---|---|---|---|---|
| 150 | Đọc bảng → Sort theo tác giả → xử lý từng nhóm tác giả (Segment, Table Spool, Stream Aggregate) → Sort theo rating, lấy 20 | 28 (mỗi tác giả một lần) | 378 | 1,75 ms | 0,29 ms |
| 1.000 | như trên | 189 | 2.538 | 11,77 ms | 0,23 ms |
| 10.000 | Tính trung bình **mọi** tác giả một lượt (Hash Match Aggregate, Table Spool) → đi theo `IX_Story_RatingAvg` từ cao xuống, Key Lookup, so với trung bình tác giả, đủ 20 thì dừng (Top) | 1 (cho cả 1.808 tác giả) | 4.648 | 37,80 ms | 0,30 ms |

\* Gồm cả trang của bảng tạm (Table Spool), không chỉ trang của bảng `Story`.

Thời gian: SQL Server khoảng 2 ms (150 truyện), 8–12 ms (1.000) và 30–40 ms (10.000); Redis dưới 0,5 ms ở mọi mức.

**Giải thích:**
- Viết theo nghĩa đen thì câu con phải chạy lại cho **từng truyện**. Optimizer không làm vậy ở mức nào: nó **viết lại** để mỗi tác giả chỉ tính trung bình một lần.
- Bảng nhỏ: sắp xếp cả bảng theo tác giả rồi xử lý từng nhóm là rẻ.
- Bảng lớn: sắp xếp cả bảng tốn kém, nên optimizer tính trung bình mọi tác giả bằng bảng băm (không cần sắp xếp), rồi tận dụng index rating để khỏi sắp xếp kết quả: lấy đủ 20 truyện từ rating cao xuống là dừng.

**Redis:** không có subquery, cũng không tự tính được trung bình theo nhóm. Ứng dụng lưu sẵn **tổng điểm (× 100) và số truyện** của từng tác giả trong Hash `author_rating:<id>`, cập nhật mỗi khi rating đổi. Các bước: `ZREVRANGE` theo rating từ cao xuống (lô 50), `HMGET` truyện, `HMGET` tổng điểm tác giả, giữ truyện nếu `rating × số truyện > tổng`, đủ 20 thì dừng: khoảng 41 lệnh. Phần "tính trung bình" đã làm sẵn lúc ghi, nên đây là truy vấn chênh lệch lớn nhất giữa hai bên.

### 3.5. Truy vấn tổng hợp: lượt xem toàn trang theo ngày (F13, thống kê admin)

```sql
SELECT v.ViewDate, SUM(v.Views) AS TotalViews, COUNT(*) AS StoriesViewed, MAX(v.Views) AS MaxViewsOneStory
FROM StoryViewDaily v
WHERE v.ViewDate >= '2026-09-30' AND v.ViewDate < '2026-10-30'
GROUP BY v.ViewDate ORDER BY v.ViewDate
```

- **Bảng dùng:** `StoryViewDaily` (11.979 / 79.933 / 798.673 dòng).
- **Điều kiện và index liên quan:** `ViewDate` trong 30 ngày có `IX_StoryViewDaily_Date (ViewDate) INCLUDE (Views)`. Index này vừa xếp sẵn theo ngày, vừa chứa đủ cột `Views` cần tính.
- **Dữ liệu:** 4.050 / 27.030 / 270.030 dòng nằm trong 30 ngày; kết quả 30 dòng (30 ngày).

| Số truyện | Plan SQL Server | Dòng phải đọc | Trang đọc | SQL Server | Redis |
|---|---|---|---|---|---|
| 150 | Index Seek `IX_StoryViewDaily_Date` → Stream Aggregate | 4.050 | 18 | 2,20 ms | 0,12 ms |
| 1.000 | như trên | 27.030 | 67 | 13,54 ms | 0,12 ms |
| 10.000 | như trên | 270.030 | 582 | 127,64 ms | 0,13 ms |

Thời gian: SQL Server khoảng 1,5–2,5 ms (150 truyện), 10–15 ms (1.000) và 125 ms (10.000), tăng theo số dòng phải đọc; Redis dưới 0,3 ms ở mọi mức.

**Giải thích:**
- **Plan không đổi.** Index đã xếp sẵn theo ngày, nên SQL Server tra đúng khoảng 30 ngày, đọc ra các dòng theo thứ tự ngày rồi cộng dồn (Stream Aggregate). Không cần Sort, không cần bộ nhớ cho bảng băm, nên đây là cách rẻ nhất ở mọi kích thước.
- Nhưng muốn tính tổng thì vẫn phải **đọc từng dòng** trong khoảng: số dòng tăng 67 lần thì thời gian cũng tăng tương ứng.

**Redis:** không có `GROUP BY` / `SUM` trên dữ liệu thô. Ứng dụng **cộng dồn lúc ghi**: mỗi ngày một Hash `views_day:<ngày>` gồm `total`, `stories`, `max`. Lúc đọc: 30 lệnh `HMGET`, không phụ thuộc số truyện hay số dòng lượt xem. Đổi lại, nó chỉ trả lời được đúng câu hỏi đã chuẩn bị; thống kê kiểu khác (theo thể loại, theo tuần…) phải thêm cấu trúc mới và cập nhật lúc ghi.

## 4. Tổng kết

| Truy vấn | Plan SQL Server đổi khi dữ liệu tăng? | Yếu tố quyết định | Redis |
|---|---|---|---|
| 1. Một điều kiện | Có: Scan → Seek + Key Lookup (từ 1.000) | Kích thước bảng so với số dòng cần lấy | 5 lệnh, thứ tự giữ sẵn lúc ghi |
| 2. Nhiều điều kiện | Có: Scan + Sort → Seek theo rating + Top (ở 10.000) | Chỉ cột có index mới thành Seek Predicate; Top cho phép dừng sớm | 66–94 lệnh, tự lọc trong code |
| 3. Join | Có: Nested Loops → Hash Match khi ghép Story (ở 10.000) | Số dòng đi vào từng phép join | 42 lệnh, tự ghép trong code |
| 4. Subquery | Có: gom theo nhóm tác giả → Hash Aggregate + index rating (ở 10.000) | Chi phí sắp xếp cả bảng | ~41 lệnh, trung bình tính sẵn lúc ghi |
| 5. Aggregate | Không: luôn Stream Aggregate trên index ngày | Index đã cho sẵn thứ tự cần gom | 30 lệnh, tổng cộng sẵn lúc ghi |

**Kết luận:**
- **SQL Server:** người viết chỉ mô tả *cần gì* bằng SQL; optimizer tự chọn *làm thế nào* dựa trên statistics và các index có sẵn, và **tự đổi cách làm** khi dữ liệu lớn lên (4/5 truy vấn đổi plan). Ước tính số dòng gần đúng ở mọi truy vấn. Cái giá là công việc làm **lúc đọc**: truy vấn tổng hợp và subquery tăng thời gian theo số dòng (khoảng 125 ms và 30–40 ms ở 10.000 truyện).
- **Redis:** không có optimizer, không có join, subquery hay `GROUP BY`. Thời gian đọc luôn dưới 1 ms và gần như không phụ thuộc kích thước dữ liệu, vì **mọi việc nặng đã được làm lúc ghi** (giữ thứ tự bằng sorted set, cộng dồn tổng, lưu sẵn tổng điểm). Cái giá là code phải biết trước từng câu hỏi, và phải tự giữ cho các cấu trúc phụ luôn đúng khi dữ liệu thay đổi.
- **Cho Novelle:** SQL Server là nơi lưu chính và xử lý các truy vấn linh hoạt (tìm kiếm nhiều điều kiện, trang thể loại, thống kê). Redis phù hợp làm lớp đọc nhanh cho các câu hỏi cố định, được gọi rất nhiều: trang tác giả, danh sách theo thể loại, bộ đếm và thống kê theo ngày. Các cấu trúc Redis được cập nhật từ ứng dụng khi dữ liệu SQL thay đổi.

## 5. Hạn chế

- **Dữ liệu nhân bản:** các bản sao lặp lại giá trị của 150 truyện thật, nên phân bố đều hơn dữ liệu thật; statistics vì vậy ước tính dễ đúng hơn thực tế.
- **Tối đa 10.000 truyện:** RDS free tier (~1 GB RAM, ~5 MB bộ đệm dữ liệu, ~6,6 MB cho memory grant) không cho phép mức lớn hơn. Ở mức 10.000, một phần dữ liệu có thể phải đọc từ đĩa, làm thời gian dao động giữa các lần chạy.
- **Phần cứng khác nhau:** SQL Server chạy trên RDS t3.micro, Redis chạy trên máy cá nhân, nên so sánh thời gian tuyệt đối chỉ mang tính tham khảo; so sánh plan và số bước mới là trọng tâm.
- **Nhiễu đo của Redis:** các con số dưới 1 ms dao động giữa các lần chạy (cùng một truy vấn có lần 0,3 ms, có lần 0,6 ms); chênh lệch nhỏ giữa các mức không có ý nghĩa.
- **Chi phí ghi của Redis** (cập nhật sorted set, tổng điểm, tổng theo ngày) không được đo trong đề tài này.

## 6. Tài liệu tham khảo

- Microsoft, *Query processing architecture guide*: https://learn.microsoft.com/en-us/sql/relational-databases/query-processing-architecture-guide
- Microsoft, *Showplan logical and physical operators reference*: https://learn.microsoft.com/en-us/sql/relational-databases/showplan-logical-and-physical-operators-reference
- Microsoft, *Joins (SQL Server)*: https://learn.microsoft.com/en-us/sql/relational-databases/performance/joins
- Microsoft, *Statistics*: https://learn.microsoft.com/en-us/sql/relational-databases/statistics/statistics
- Redis, *Sorted sets*: https://redis.io/docs/latest/develop/data-types/sorted-sets/
- Redis, *Scripting with Lua*: https://redis.io/docs/latest/develop/interact/programmability/eval-intro/
- Redis, *SLOWLOG*: https://redis.io/docs/latest/commands/slowlog/
