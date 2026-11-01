"""Example topic: shows how to write scenarios. Not one of the 6 assignment topics."""
from lab.framework import TopicMeta

TOPIC = TopicMeta(
    id="example",
    title="Ví dụ: đọc truyện theo khoá và top rating",
    owner="Khung lab (mẫu)",
    research_questions=[
        "Lấy chi tiết 1 truyện theo khoá: SQL Server (clustered index seek) và Redis (HGETALL) tốn bao nhiêu thời gian xử lý phía server?",
        "Lấy top 10 truyện rating cao nhất: ORDER BY trên bảng so với sorted set của Redis?",
        "10 phiên cùng tăng lượt xem: cách đọc-rồi-ghi mất bao nhiêu lượt, cách cập nhật nguyên tử có mất không?",
    ],
    context="Dữ liệu là dbo.Story trên RDS (150 truyện). Phía Redis, truyện được nạp thành Hash và Sorted Set trước khi đo.",
)
