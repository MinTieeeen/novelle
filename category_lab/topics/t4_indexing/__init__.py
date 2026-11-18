"""Indexing (owner: Huỳnh Minh Tiến)."""
from lab.framework import TopicMeta

TOPIC = TopicMeta(
    id="indexing",
    title="Indexing: SQL Server so với Redis",
    owner="Huỳnh Minh Tiến",
    research_questions=[
        "I2 Index nhiều cột (lọc trạng thái hoàn thành + rating tối thiểu): thứ tự cột trong composite index, "
        "Key Lookup và covering index (INCLUDE) ảnh hưởng thế nào, và ở độ chọn lọc nào optimizer bỏ index "
        "(tipping point)? Redis dựng index nhiều điều kiện bằng ZSET / Set hoặc RediSearch ra sao?",
        "I3 Sắp xếp và phân trang (F1 truyện mới cập nhật): index đúng thứ tự ORDER BY có bỏ được Sort không, "
        "trang sâu tốn bao nhiêu với OFFSET so với keyset? ZSET (lấy theo hạng) và FT.SEARCH SORTBY so sánh thế nào?",
        "I4 Filtered index (IX_Story_Public_LastChapter chỉ chứa truyện đã đăng): nhỏ hơn và đọc ít hơn index "
        "đầy đủ bao nhiêu, và khi nào optimizer không dùng được nó (truy vấn có tham số)? Redis làm index có "
        "điều kiện bằng ZSET riêng hoặc FT.CREATE … FILTER ra sao?",
        "I5 Tìm kiếm toàn văn (ô tìm kiếm): LIKE '%từ%', full-text CONTAINSTABLE và RediSearch khác nhau thế "
        "nào về tốc độ, số kết quả khi gõ có dấu / không dấu, và độ trễ từ lúc ghi đến lúc tìm thấy?",
        "I7 Chi phí của index: mỗi index thêm làm INSERT / UPDATE chậm đi bao nhiêu và tốn bao nhiêu dung lượng? "
        "Ở Redis, tự duy trì index phụ trong MULTI và để RediSearch tự index khi HSET tốn bao nhiêu thời gian "
        "ghi và bộ nhớ?",
    ],
    context=("Bảng Story của Novelle (dbo.Story) được nhân bản thành 1k / 10k / 50k truyện trong "
             "lab.indexing__Story_<n> (chỉ có clustered PK); mỗi biến thể tự tạo rồi xoá index của mình. "
             "Redis: Hash lab:indexing:s<n>:story:<id> sinh theo đúng quy tắc nhân bản đó. Index của web: "
             "novelle_backend/database/schema/02_indexes.sql, full-text: 03_fulltext.sql; truy vấn tìm kiếm thật: "
             "StorySearchMapper.xml."),
)
