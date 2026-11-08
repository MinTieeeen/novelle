# Backup & Recovery

Người thực hiện: Nguyễn Khánh Trinh

## Mục tiêu

So sánh cách SQL Server (AWS RDS) và Redis bảo vệ dữ liệu của Novelle khi có sự cố: mỗi bên mất tối đa bao
nhiêu dữ liệu (RPO), cái giá của việc ghi bền vững, transaction lỗi giữa chừng thì sao, và khôi phục dữ liệu
bị xoá nhầm bằng cách nào. Kết quả giúp quyết định dữ liệu nào chỉ được để ở Redis (lượt xem, bản nháp
autosave, session) và dữ liệu nào bắt buộc phải nằm trong SQL Server.

## Giới hạn của môi trường

- RDS dùng chung cả nhóm, login của lab không phải `sysadmin`: không chạy được `BACKUP DATABASE ... TO DISK`.
- `rds_backup_database` (native backup ra S3) chưa dùng được vì instance chưa gắn option group
  `SQLSERVER_BACKUP_RESTORE` và S3 bucket/IAM role. Phần backup vì vậy đọc lại các bản backup RDS tự tạo
  trong `msdb.dbo.backupset`.
- Không làm sập RDS để đo crash recovery; phía SQL Server chỉ thử ngắt một phiên giữa transaction.
- Các scenario Redis cần `BGSAVE`, đổi `appendfsync` hoặc tắt server chỉ chạy trên Redis local
  (`targets={"local"}`), sau khi kiểm tra Redis chỉ chứa key `lab:*`. Scenario tắt server gắn
  `destructive=True`, chạy bằng `lab run backup_recovery --allow-destructive`.

## Cách làm

| Cặp | SQL Server | Redis |
|---|---|---|
| `backup_rpo` | Đọc `msdb.dbo.backupset` 7 ngày: full backup (D) hằng ngày, log backup (L) mỗi 5 phút; khoảng cách giữa hai lần bằng `LAG()`; trạng thái log qua `sys.dm_db_log_stats` | Nạp 20 150 key (~20 MB dữ liệu ngẫu nhiên), chạy `BGSAVE` và `BGREWRITEAOF`, đọc `INFO persistence` |
| `durability_cost` | 500 `INSERT` commit từng dòng so với một transaction; đếm `Log Flushes/sec` và chờ `WRITELOG` | 2 000 `SET` với `appendfsync everysec`, `always`, và `always` gộp trong `MULTI/EXEC` |
| `atomic_rollback` | Bước 1 cộng lượt xem, bước 2 chia cho 0, với `XACT_ABORT ON` / `OFF`; thêm một batch lỗi biên dịch | `MULTI/EXEC` có lệnh lỗi lúc chạy (`WRONGTYPE`) và lỗi lúc xếp hàng (lệnh không tồn tại) |
| `accidental_delete` | Bảng temporal (system-versioned) chứa chương của 5 truyện; `DELETE` nhầm 40 chương rồi lấy lại bằng `FOR SYSTEM_TIME AS OF` | Cùng 40 chương dưới dạng Hash; backup bằng `DUMP`, xoá nhầm, khôi phục bằng `RESTORE` |
| `crash_recovery` | Commit 1 000 dòng, ghi thêm 1 000 dòng không commit rồi ngắt kết nối | Ghi 50 000 key, `SHUTDOWN NOSAVE`, Docker khởi động lại container, đếm key nạp lại từ AOF |

RPO được ghi theo **loại sự cố** để chỉ so những con số cùng nghĩa: `process_crash` (tiến trình chết, đĩa còn),
`instance_loss` (mất cả máy, chỉ còn backup bên ngoài), `snapshot_only` (nếu chỉ có bản chụp định kỳ).

## Kết quả và nhận xét

Số liệu cụ thể xem trong report; các con số dưới đây lấy từ một lần chạy và có thể dao động.

1. **RPO.** SQL Server không mất transaction đã commit khi tiến trình crash: COMMIT chỉ trả về sau khi log
   xuống đĩa (write-ahead log, delayed durability tắt), recovery redo/undo từ log. Khi mất cả instance, RDS
   khôi phục tới một thời điểm từ log backup trên S3, mất tối đa khoảng 5–7 phút. Redis với AOF `everysec`
   mất tối đa khoảng 1 s khi máy mất điện, nhưng file AOF/RDB nằm trên chính máy Redis; mất máy là mất hết
   nếu không tự chép ra ngoài. Chỉ dùng RDB (`save 3600 1 ...`) thì có thể mất tới 1 giờ.
2. **Chi phí bền vững.** Commit từng dòng trên RDS tốn khoảng 1,2 ms/dòng, gần như toàn bộ là chờ `WRITELOG`
   (500 lần flush log); gộp 500 dòng vào một transaction chỉ còn ~5 lần flush, nhanh hơn hàng chục lần.
   Redis cho kết quả cùng dạng: `appendfsync always` chậm hơn `everysec` nhiều lần, gộp lệnh trong
   `MULTI/EXEC` để chung một lần fsync thì gần như hết chi phí. Số ms tuyệt đối không so được giữa hai bên vì
   Redis local fsync qua đĩa ảo của WSL2.
3. **Transaction lỗi giữa chừng.** SQL Server có rollback thật: với `XACT_ABORT ON`, lỗi ở bước 2 hoàn tác cả
   bước 1. Nhưng mặc định `XACT_ABORT OFF` chỉ huỷ câu lỗi, gọi COMMIT sau đó vẫn giữ bước 1; procedure của
   Novelle (ví dụ `sp_PublishChapter`) cần `SET XACT_ABORT ON` hoặc `TRY/CATCH` + `ROLLBACK`. Redis
   `MULTI/EXEC` không có rollback: lệnh lỗi lúc chạy không hoàn tác lệnh trước; chỉ lỗi lúc xếp hàng mới huỷ
   cả khối.
4. **Xoá nhầm.** Temporal table giữ mọi phiên bản cũ, khôi phục 40 chương (kể cả `Content`, kiểm bằng
   checksum) bằng một câu `INSERT ... SELECT ... FOR SYSTEM_TIME AS OF`, không cần restore cả database; đổi
   lại bảng history phình ra theo số lần sửa/xoá. Redis `DUMP/RESTORE` khôi phục rất nhanh nhưng chỉ khi bản
   DUMP đã được tạo trước, và chỉ đúng tại thời điểm DUMP; Redis không có lịch sử phiên bản hay point-in-time
   restore ở mức key.
5. **Sự cố giữa chừng.** SQL Server: sau khi phiên bị ngắt, còn đúng 1 000 dòng đã commit, 1 000 dòng dở dang
   bị rollback. Redis: sau `SHUTDOWN NOSAVE` vẫn nạp lại đủ mọi key từ AOF, mất khoảng 10 s để container khởi
   động lại và nạp AOF (RTO). `SHUTDOWN` vẫn flush AOF; kill tiến trình cũng không mất phần đã `write()` vì
   nó nằm trong page cache, chỉ mất điện mới mất tới 1 s của `everysec`.

**Khuyến nghị cho Novelle:** dữ liệu gốc (truyện, chương, tài khoản, đánh giá) ở SQL Server với recovery
model FULL và backup tự động của RDS. Redis chỉ giữ dữ liệu có thể mất ~1 s hoặc dựng lại được: lượt xem
(định kỳ đẩy về SQL Server), bản nháp autosave (mất tối đa ~1 s gõ phím), session (người dùng đăng nhập lại).
Nếu Redis trên EC2 cần chống mất máy thì phải chép AOF/RDB ra S3 theo lịch.

## Ghi chú cho người dùng lab

- `SqlServer.exec()` mở cursor bằng `with`, và pyodbc tự COMMIT khi thoát khối đó. Vì vậy với
  `new_connection(autocommit=False)`, mỗi câu lệnh được commit ngay. Topic này dùng kết nối autocommit với
  `BEGIN TRANSACTION` tường minh.
- Câu có tham số chạy qua `sp_executesql`, không được để transaction mở sau câu đó (lỗi 266); giá trị số được
  ghi thẳng vào câu lệnh.
- `bench_redis` không đọc được lệnh có tham số nhị phân (`RESTORE`), nên `accidental_delete` đo thời gian phía
  server bằng `INFO commandstats`.

## Tài liệu tham khảo

- Microsoft Learn: Recovery models (SQL Server); Transaction log architecture; Control transaction durability.
- Microsoft Learn: Temporal tables; `SET XACT_ABORT`.
- AWS: Backing up and restoring Amazon RDS DB instances; Point-in-time recovery; Native backup and restore
  for SQL Server.
- Redis docs: Redis persistence (RDB, AOF); Transactions (`MULTI/EXEC`); `DUMP` / `RESTORE`.
