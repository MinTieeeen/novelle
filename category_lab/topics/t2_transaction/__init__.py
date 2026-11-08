"""Transaction và concurrency (owner: NghiaTran)."""
from lab.framework import TopicMeta

TOPIC = TopicMeta(
    id="transaction",
    title="Transaction và concurrency: SQL Server so với Redis",
    owner="NghiaTran",
    research_questions=[
        "T1 · Hai admin cùng duyệt một yêu cầu làm tác giả (hoặc hai yêu cầu trùng bút danh): khoá UPDLOCK/HOLDLOCK, "
        "UPDATE có điều kiện và REPEATABLE READ của SQL Server so với WATCH/MULTI/EXEC và Lua của Redis, cách nào "
        "bảo đảm đúng một lần duyệt?",
        "T2 · Bước thứ 3 của việc duyệt tác giả bị lỗi: SQL Server rollback được những gì (có / không XACT_ABORT, "
        "rollback từ ứng dụng), còn MULTI/EXEC, DISCARD và Lua của Redis để lại những gì?",
        "T3 · 200 lượt đánh giá cùng một truyện từ 1, 10, 50, 100 client: thông lượng, độ trễ p50/p95/p99, số "
        "deadlock / retry và tính đúng của RatingAvg thay đổi thế nào trên mỗi DBMS?",
    ],
    context=(
        "Dữ liệu là của web Novelle trên RDS: User, AuthorRequest, Author (F7, F11: sp_ApproveAuthorRequest ghi 3 "
        "bảng trong một transaction, quy tắc RB13) và Story, Rating (F6: trg_Rating tính lại RatingAvg/RatingCount). "
        "SQL Server chạy trên bản sao lab.transaction__* của các bảng này (dbo chỉ được đọc); Redis dùng Hash/Set "
        "lab:transaction:* mô phỏng cùng dữ liệu. NovelleDB tắt SNAPSHOT và READ_COMMITTED_SNAPSHOT nên các thí "
        "nghiệm dùng khoá (READ COMMITTED, REPEATABLE READ). Độ trễ đo ở client gồm cả mạng: RDS ở xa (~90 ms mỗi "
        "vòng), Redis local (~0,1 ms), nên so sánh hai DBMS dựa trên số lần duyệt đúng/sai, số bước còn lại, "
        "deadlock/retry và thời gian phía server."
    ),
)
