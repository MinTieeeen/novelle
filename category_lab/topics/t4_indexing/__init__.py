"""Indexing (owner: Huỳnh Minh Tiến)."""
from lab.framework import TopicMeta

TOPIC = TopicMeta(
    id="indexing",
    title="Indexing: SQL Server so với Redis",
    owner="Huỳnh Minh Tiến",
    research_questions=[
        "I1 Tra cứu theo một cột (mở truyện theo Slug, truyện của một tác giả): không index và nonclustered index "
        "khác nhau thế nào về số trang đọc và thời gian? Redis chỉ tra được theo key: SCAN, index phụ tự quản lý "
        "(String / Set) và RediSearch TAG tốn bao nhiêu?",
        "I2 Index nhiều cột (lọc trạng thái hoàn thành + rating tối thiểu): composite và covering index (INCLUDE) "
        "ảnh hưởng thế nào tới số trang và Key Lookup? Redis dựng index nhiều điều kiện bằng ZSET hoặc RediSearch ra sao?",
        "I3 Sắp xếp và phân trang (truyện mới cập nhật): index đúng thứ tự ORDER BY có bỏ được Sort không, OFFSET so "
        "với keyset? ZSET (lấy theo hạng) và FT.SEARCH SORTBY so sánh thế nào?",
        "I4 Filtered index (chỉ chứa truyện công khai): nhỏ hơn và đọc ít hơn index đầy đủ bao nhiêu? Redis làm index "
        "có điều kiện bằng ZSET riêng hoặc FT.CREATE … FILTER ra sao?",
        "I5 Tìm kiếm toàn văn (ô tìm kiếm): LIKE '%từ%', full-text CONTAINSTABLE và RediSearch khác nhau thế nào về "
        "tốc độ và số kết quả khi gõ có dấu / không dấu?",
        "I7 Chi phí của index: index phụ làm INSERT / UPDATE tốn thêm bao nhiêu? Ở Redis, tự duy trì index phụ trong "
        "MULTI và để RediSearch tự index khi HSET tốn bao nhiêu?",
    ],
    context=("Bảng Story của Novelle (dbo.Story) được sao thành 100 / 1.000 truyện trong lab.indexing__Story_<n> "
             "(chỉ có clustered PK); mỗi biến thể tự tạo rồi xoá index của mình. Redis: Hash "
             "lab:indexing:s<n>:story:<id> sinh theo đúng quy tắc nhân bản đó. Mỗi scenario có một check kiểm chứng "
             "cơ bản. Index của web: novelle_backend/database/schema/02_indexes.sql, full-text: 03_fulltext.sql."),
)
