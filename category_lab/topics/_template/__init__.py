"""__TITLE__ (owner: __OWNER__)."""
from lab.framework import TopicMeta

TOPIC = TopicMeta(
    id="__TOPIC_ID__",
    title="__TITLE__",
    owner="__OWNER__",
    research_questions=[
        # TODO: mỗi câu hỏi nên trả lời được bằng một cặp scenario (cùng `pair` ở sqlserver.py và redis.py)
        "Câu hỏi 1: ... trên SQL Server so với Redis?",
    ],
    context="TODO: bối cảnh Novelle của topic này (bảng/key nào, chức năng F nào dùng tới).",
)
