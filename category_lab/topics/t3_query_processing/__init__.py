"""Query Processing (owner: Dang Quang Phong)."""
from lab.framework import TopicMeta

TOPIC = TopicMeta(
    id="query_processing",
    title="Query Processing",
    owner="Dang Quang Phong",
    research_questions=[
        "Truy vấn một điều kiện (F3, truyện của một tác giả): SQL Server chọn execution plan nào (Seek, Scan, "
        "Key Lookup), ước lượng số dòng có đúng không, và plan thay đổi thế nào khi dữ liệu tăng? "
        "Redis cần những bước lệnh nào?",
        "Truy vấn nhiều điều kiện (F2, lọc trạng thái + rating + số chương): điều kiện nào thành Seek Predicate, "
        "điều kiện nào thành Residual Predicate, và plan thay đổi thế nào khi dữ liệu tăng? "
        "Redis cần những bước lệnh nào?",
        "Truy vấn có join (F2, trang thể loại: thể loại + truyện + tác giả): SQL Server chọn thuật toán join "
        "nào (Nested Loops, Hash, Merge), và plan thay đổi thế nào khi dữ liệu tăng? Redis cần những bước "
        "lệnh nào?",
        "Truy vấn có subquery (F1, truyện có rating cao hơn trung bình các truyện cùng tác giả): optimizer có viết lại "
        "subquery thành join không, và plan thay đổi thế nào khi dữ liệu tăng? Redis cần những bước lệnh nào?",
        "Truy vấn tổng hợp (F13, lượt xem toàn trang theo ngày trong 30 ngày): Stream Aggregate hay Hash "
        "Aggregate, có Sort không, và plan thay đổi thế nào khi dữ liệu tăng? Redis cần những bước lệnh nào?",
    ],
    context=("Truy vấn thật của web Novelle trên bản sao dữ liệu web 150 / 1k / 10k dòng, giữ nguyên các index "
             "của schema web; index chỉ là điều kiện có sẵn, không phải đối tượng so sánh."),
)
