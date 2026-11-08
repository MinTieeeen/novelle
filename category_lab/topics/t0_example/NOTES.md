# Ví dụ: đọc truyện theo khoá và top rating

<!-- lab:comments:start (do lab serve ghi; sửa trong report hoặc giữa các dấu lab:comment) -->
## Nhận xét chi tiết

### Lấy 1 truyện theo StoryId

#### SQL Server · `example.sqlserver.story_by_id`
<!-- lab:comment id=example.sqlserver.story_by_id -->
Trong thí nghiệm lấy thông tin chi tiết một truyện theo khóa chính trên SQL Server, nhóm chúng tôi ghi nhận thời gian xử lý phía server trung vị (p50) đạt 0.0315 ms (với độ phân giải phép đo khoảng 0.0105 ms). Hiệu năng này đạt được nhờ hệ thống thực hiện thao tác Clustered Index Seek trực tiếp trên khóa chính PK_Story để truy xuất thẳng vào trang dữ liệu chứa bản ghi. So với kịch bản tương đương sử dụng lệnh HGETALL trên Redis (p50 đạt 0.003 ms), thời gian xử lý của SQL Server nhỉnh hơn do phải gánh thêm chi phí quản lý trang bộ đệm và giao dịch của cơ sở dữ liệu quan hệ. Mặc dù vậy, tốc độ xử lý 0.0315 ms của SQL Server vẫn rất tối ưu cho các truy vấn tra cứu theo khóa chính trong ứng dụng Novelle.
<!-- /lab:comment -->

#### Redis · `example.redis.story_by_id`
<!-- lab:comment id=example.redis.story_by_id -->
Thực hiện truy xuất thông tin chi tiết một truyện theo khoá chính trên Redis qua câu lệnh HGETALL, chúng tôi ghi nhận thời gian xử lý phía server (server_ms) đạt giá trị trung vị p50 là 0.003 ms và dung lượng lưu trữ của đối tượng Hash là 256 byte. Hiệu năng này đạt được nhờ toàn bộ dữ liệu được lưu trữ hoàn toàn trên bộ nhớ trong (RAM) dưới dạng mã hoá listpack gồm 8 trường thông tin, giúp độ phức tạp truy vấn ở mức O(N) theo số trường và không tốn chi phí I/O đĩa. So với kịch bản tương ứng trên SQL Server (example.sqlserver.story_by_id) có p50 đạt 0.0315 ms bằng thao tác Clustered Index Seek, thời gian xử lý phía server của Redis nhanh hơn rõ rệt. Kết quả này phản ánh đúng ưu thế của bộ nhớ đệm in-memory khi dùng làm lớp truy xuất dữ liệu tạm thời cho hệ thống Novelle.
<!-- /lab:comment -->

<!-- lab:comments:end -->
