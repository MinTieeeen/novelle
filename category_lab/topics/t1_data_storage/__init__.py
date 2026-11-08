"""Data Storage & Management (owner: Nguyen Hoang Minh Quan)."""
from lab.framework import TopicMeta

TOPIC = TopicMeta(
    id="data_storage",
    title="Data Storage & Management",
    owner="Nguyen Hoang Minh Quan",
    research_questions=[
        "Write bottleneck: khi tác giả nhập hàng loạt chương (bulk_import) hoặc tự động lưu bản nháp "
        "(autosave), chi phí ghi và dung lượng lưu trữ của SQL Server (B-tree, trang LOB, index phụ, "
        "transaction log) so với Redis (Hash và Sorted Set trong RAM, AOF) khác nhau thế nào?",
        "Key eviction: khi bộ nhớ không đủ chứa dữ liệu, SQL Server (buffer pool) và Redis (maxmemory, "
        "eviction policy) quản lý tài nguyên ra sao, và dữ liệu nào của Novelle có nguy cơ bị mất?",
    ],
    context="Bảng dbo.Chapter (F9: viết chương, autosave); bản sao lab.data_storage__Chapter có đúng "
            "PK, IX_Story_No, IX_Scheduled; Redis key chapter:{storyId}:{chapterNo}, toc:{storyId}, "
            "draft:{userId}:{chapterId} (thiết kế autosave của Novelle).",
)