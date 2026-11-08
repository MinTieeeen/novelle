"""Backup & Recovery (owner: Nguyễn Khánh Trinh)."""
from lab.framework import TopicMeta

TOPIC = TopicMeta(
    id="backup_recovery",
    title="Backup & Recovery",
    owner="Nguyễn Khánh Trinh",
    research_questions=[
        "Cơ chế backup và RPO: RDS SQL Server (full backup hằng ngày + log backup 5 phút, recovery model FULL) "
        "so với Redis (snapshot RDB + AOF everysec) mất tối đa bao nhiêu giây dữ liệu, và tạo bản backup tốn bao lâu?",
        "Chi phí ghi bền vững: commit từng dòng so với commit theo lô trên SQL Server (số lần flush log) "
        "và appendfsync everysec so với always trên Redis?",
        "Transaction lỗi giữa chừng: SQL Server ROLLBACK đưa dữ liệu về trạng thái trước, "
        "còn MULTI/EXEC của Redis có hoàn tác các lệnh đã chạy không?",
        "Lỡ xoá dữ liệu: khôi phục các dòng bằng temporal table (FOR SYSTEM_TIME AS OF) trên SQL Server "
        "so với khôi phục key bằng DUMP/RESTORE trên Redis?",
        "Sự cố tiến trình: Redis bị tắt đột ngột (SHUTDOWN NOSAVE) thì nạp lại được bao nhiêu key từ AOF, "
        "so với crash recovery dựa trên transaction log của SQL Server?",
    ],
    context=(
        "Novelle lưu dữ liệu gốc trên SQL Server (AWS RDS, NovelleDB, recovery model FULL); RDS tự backup, "
        "không dùng được BACKUP TO DISK hay rds_backup_database (chưa có option group). Redis giữ lượt xem, "
        "bản nháp autosave, session (F4, F7, F11) với AOF everysec. Dữ liệu thí nghiệm là bản sao dbo.Story, "
        "dbo.Chapter trong schema lab và key lab:backup_recovery:*."
    ),
)
