import os

from lab.framework import Ctx, scenario

N_IMPORT = 500                 # số chương mỗi lần nhập
TARGET_ROWS = 1500       # số chương thật copy vào bảng đích
REPEAT, WARMUP = 5, 1    # số lần đo và số lần khởi động không tính
STORY_BASE = 1_000_000

def _announce_write_bottleneck():
    if os.environ.get("DS_WRITE_BOTTLENECK_SCOPE"):
        return
    os.environ["DS_WRITE_BOTTLENECK_SCOPE"] = "1"
    print(
    "======================== Phạm vi test_write_bottleneck (chung cho SQL Server và Redis) ========================\n"
    f" - Dữ liệu ghi : {N_IMPORT} chương đầu tiên trích xuất từ dbo.Chapter (IsDeleted = 0, theo ChapterId)\n"
    f" - Dữ liệu nền : {TARGET_ROWS} chương dữ liệu thật đã được nạp sẵn\n"
    " - Cấu trúc dữ liệu trong SQL Server  : clustered PK(ChapterId), UNIQUE IX_Story_No(StoryId, ChapterNo) "
    "INCLUDE(Title, Status, PublishedAt), IX_Scheduled(ScheduledAt) WHERE Status = 'SCHEDULED'\n"
    " - Cấu trúc dữ liệu trong Redis       : Hash {storyId}:{chapterNo} (title, content, wordCount, chapterNo, status)\n"
    "ZSet {storyId} (member = key chương, score = chapterNo)\n"
    f" - Bulk_import : mỗi lần nhập {N_IMPORT} chương thành một truyện mới đo {REPEAT} lần sau {WARMUP} lần khởi động\n"
    " - Autosave    : SQL UPDATE Content của một chương | Redis HSET draft:{userId}:{chapterId} + EXPIRE 7 ngày"
    )

def _require(condition: bool, message: str):
    """Kiểm tra tính đúng của thí nghiệm mà không thêm dòng ✔ vào bảng kết quả.
    Sai thì scenario dừng với trạng thái error kèm thông báo."""
    if not condition:
        raise AssertionError(message)

def _columns(ctx: Ctx, table: str) -> dict:
    rows = ctx.sql.query(
        "SELECT name, TYPE_NAME(system_type_id) AS type, is_identity " #Kiểu dữ liệu và IDENTITY của từng cột trên bảng sandbox
        "FROM sys.columns WHERE object_id = OBJECT_ID(?)", table)
    return {r["name"]: r for r in rows}

def _make_target(ctx: Ctx) -> str:
    t = ctx.sandbox_table("Chapter", "dbo.Chapter", 
                          where=f"ChapterId IN (SELECT TOP ({TARGET_ROWS}) ChapterId FROM dbo.Chapter ORDER BY ChapterId)", #Bản sao TARGET_ROWS chương của dbo.Chapter cùng với PK 
                          primary_key=["ChapterId"])
    ctx.sql.exec(f"CREATE UNIQUE NONCLUSTERED INDEX IX_Story_No ON {t} " #dựng lại hai index 
                 "(StoryId, ChapterNo) INCLUDE (Title, Status, PublishedAt)")
    ctx.sql.exec(f"CREATE NONCLUSTERED INDEX IX_Scheduled ON {t} (ScheduledAt) "
                 "WHERE Status = 'SCHEDULED'")
    return t

def _import_sql(ctx: Ctx, target: str, src: str) -> str:
    cols = _columns(ctx, target)
    names = ["StoryId", "VolumeId", "ChapterNo", "Title", "Content", "WordCount", "Status",
             "ScheduledAt", "PublishedAt", "ViewCount", "IsDeleted", "CreatedAt", "UpdatedAt"]
    values = [f"CAST({STORY_BASE} + m.MaxId AS INT)", "NULL", "s.rn", "s.Title", "s.Content",
              "s.WordCount", "'DRAFT'", "NULL", "NULL", "0", "0", "SYSUTCDATETIME()", "SYSUTCDATETIME()"]

    if not cols["ChapterId"]["is_identity"]:
        names.insert(0, "ChapterId")
        values.insert(0, "m.MaxId + s.rn")
        ctx.observe("Sandbox mất IDENTITY của ChapterId: khóa được tính bằng MAX(ChapterId) + số thứ tự.")
    if cols["RowVer"]["type"] != "timestamp":
        names.append("RowVer")
        values.append("0x0000000000000000")
        ctx.observe(f"RowVer trên sandbox có kiểu {cols['RowVer']['type']}: điền giá trị hằng.")

    return f"""
INSERT INTO {target} ({", ".join(names)})
SELECT {", ".join(values)}
FROM (SELECT ChapterId, Title, Content, WordCount,
             ROW_NUMBER() OVER (ORDER BY ChapterId) AS rn
      FROM {src}) s
CROSS JOIN (SELECT ISNULL(MAX(ChapterId), 0) AS MaxId FROM {target}) m"""

def _log_bytes(ctx: Ctx) -> int:
    return int(ctx.sql.scalar(
        "SELECT num_of_bytes_written FROM sys.dm_io_virtual_file_stats(DB_ID(), 2)")) #Tổng byte đã ghi vào file log của NovelleDB

def _pages(ctx: Ctx, table: str) -> list[dict]:
    return ctx.sql.query(           # Số trang đang dùng của từng index: dữ liệu in-row và LOB
        "SELECT i.name, i.type_desc, ps.in_row_used_page_count AS in_row, "
        "ps.lob_used_page_count AS lob, ps.used_page_count AS used "
        "FROM sys.dm_db_partition_stats ps JOIN sys.indexes i "
        "ON i.object_id = ps.object_id AND i.index_id = ps.index_id "
        "WHERE ps.object_id = OBJECT_ID(?)", table)

def _used_pages(ctx: Ctx, table: str) -> int:
    return sum(int(r["used"]) for r in _pages(ctx, table))

def _count(ctx: Ctx, table: str) -> int:
    return int(ctx.sql.scalar(f"SELECT COUNT(*) FROM {table}"))

@scenario(title="Write bottleneck: nhập hàng loạt và autosave chương", pair="test_write_bottleneck", repeat=REPEAT, warmup=WARMUP)
def test_write_bottleneck(ctx: Ctx):
    _announce_write_bottleneck()

    # 1. Dữ liệu nguồn: N_IMPORT chương thật
    src = ctx.sandbox_table("ChapterSrc", "dbo.Chapter", 
                            where=f"ChapterId IN (SELECT TOP ({N_IMPORT}) ChapterId FROM dbo.Chapter "
                            "WHERE IsDeleted = 0 ORDER BY ChapterId)")
    _require(_count(ctx, src) == N_IMPORT, f"bảng nguồn phải có đúng {N_IMPORT} chương")
    avg_kb = float(ctx.sql.scalar(f"SELECT AVG(DATALENGTH(Content)) / 1024.0 FROM {src}"))

    # 2. Bảng đích có cấu trúc thật
    t = _make_target(ctx)
    sql = _import_sql(ctx, t, src)

    # ── Nhóm 1: dữ liệu chương ──
    ctx.metric("avg_content_kb", round(avg_kb, 1), "KB", label="bulk_import")
    s_bulk = ctx.bench_sql("bulk_import", sql, inner=1)

    rows_before = _count(ctx, t)
    log_before, pages_before = _log_bytes(ctx), _used_pages(ctx, t)
    ctx.sql.exec(sql)                                   # một lần nhập riêng để đo log và dung lượng
    log_delta = _log_bytes(ctx) - log_before
    storage = (_used_pages(ctx, t) - pages_before) * 8192
    _require(_count(ctx, t) - rows_before == N_IMPORT, f"INSERT ... SELECT phải ghi đúng {N_IMPORT} dòng")
    last = ctx.sql.scalar(f"SELECT MAX(StoryId) FROM {t}")
    _require(ctx.sql.scalar(f"SELECT COUNT(*) FROM {t} WHERE StoryId = ?", last) == N_IMPORT,
             "truyện vừa nhập phải có đủ chương")

    ctx.metric("log_bytes", log_delta, "bytes", label="bulk_import")
    ctx.metric("storage_bytes", storage, "bytes", label="bulk_import")   # cùng tên với redis.py

    pages = _pages(ctx, t)
    clustered = next(r for r in pages if r["type_desc"] == "CLUSTERED")
    ctx.metric("pages_data_inrow", int(clustered["in_row"]), "pages", label="bulk_import")
    ctx.metric("pages_data_lob", int(clustered["lob"]), "pages", label="bulk_import")

    # ── Nhóm 2: index ──
    index_items = []
    for r in pages:
        if r["type_desc"] != "CLUSTERED":
            ctx.metric(f"pages_{r['name']}", int(r["used"]), "pages", label="bulk_import")
            index_items.append((f"pages_{r['name']}", f"{int(r['used'])} pages"))

    frag = ctx.sql.query(
        "SELECT i.name, i.type_desc, s.avg_fragmentation_in_percent AS frag "
        "FROM sys.dm_db_index_physical_stats(DB_ID(), OBJECT_ID(?), NULL, NULL, 'LIMITED') s "
        "JOIN sys.indexes i ON i.object_id = s.object_id AND i.index_id = s.index_id "
        "WHERE s.alloc_unit_type_desc = 'IN_ROW_DATA'", t)
    for r in frag:
        name = "clustered" if r["type_desc"] == "CLUSTERED" else r["name"]
        ctx.metric(f"frag_{name}", round(float(r["frag"]), 2), "%", label="bulk_import")
        index_items.append((f"frag_{name}", f"{float(r['frag']):.2f} %"))

    # ── Nhóm 3: autosave (cùng chương với redis.py) ──
    chap_id = ctx.sql.scalar(f"SELECT MIN(ChapterId) FROM {src}")
    content = ctx.sql.scalar(f"SELECT Content FROM {t} WHERE ChapterId = ?", chap_id) + " "
    upd = (f"UPDATE {t} SET Content = CAST(? AS NVARCHAR(MAX)) + CONVERT(NVARCHAR(30), SYSUTCDATETIME(), 121), "
       "UpdatedAt = SYSUTCDATETIME() WHERE ChapterId = ?")
    s_auto = ctx.bench_sql("autosave", upd, content, chap_id, inner=1)
    _require(ctx.sql.scalar(f"SELECT DATALENGTH(Content) FROM {t} WHERE ChapterId = ?", chap_id)
         > len(content) * 2, "nội dung chương phải được ghi lại")

    ctx.observe(
        f"bulk_import {N_IMPORT} chương (trung bình {avg_kb:.1f} KB/chương): p50 {s_bulk.p50:.1f} ms; "
        f"ghi {log_delta / 1024:.0f} KB log và {storage / 1024:.0f} KB trang dữ liệu cho một truyện. "
        "Khóa IDENTITY và StoryId mới luôn lớn nhất nên dòng mới nằm cuối mọi B-tree (không page split); "
        "chương nhập ở trạng thái DRAFT nên IX_Scheduled không bị chạm.")
    ctx.observe(
        f"autosave (UPDATE khoảng {len(content) // 1024} K ký tự): p50 {s_auto.p50:.2f} ms. "
        "Mỗi lần lưu ghi lại trang LOB và transaction log; hệ thống thật còn chạy trigger "
        "trg_Chapter_Revision (không có trên sandbox), nên đây là cận dưới.")

#====================================================================================================================================

EV_N = 1000                      # số chương được cache
EV_LIMIT_RATIO = 0.5             # maxmemory = bộ nhớ nền + 50% dung lượng 1000 chương
EV_HOT_RATIO = 0.2               # 20% chương là "nóng"
EV_HOT_SHARE = 0.8               # ... và nhận 80% lượt đọc
EV_READS = 5000                  # số lượt đọc cache-aside sau khi nạp
EV_VIEWS = 100                   # số bộ đếm lượt xem làm "chim báo"
EV_CACHE_TTL = 30 * 60           # TTL của cache:chapter theo đặc tả (30 phút)
EV_POLICIES = ("noeviction", "allkeys-lru")
EV_SEED = 42                     # cùng chuỗi ngẫu nhiên cho mọi chính sách

# Trang của một bảng đang nằm trong buffer pool: nối qua allocation unit
# (IN_ROW và ROW_OVERFLOW gắn với hobt_id, LOB gắn với partition_id)
BUFFER_PAGES_SQL = """
SELECT COUNT(*)
FROM sys.dm_os_buffer_descriptors bd
JOIN sys.allocation_units au ON au.allocation_unit_id = bd.allocation_unit_id
JOIN sys.partitions p ON (au.type IN (1, 3) AND au.container_id = p.hobt_id)
                      OR (au.type = 2 AND au.container_id = p.partition_id)
WHERE bd.database_id = DB_ID() AND p.object_id = OBJECT_ID(?)"""


def _announce_eviction():
    if os.environ.get("DS_KEY_EVICTION_SCOPE"):
        return
    os.environ["DS_KEY_EVICTION_SCOPE"] = "1"
    print("======================== Phạm vi test_key_eviction (chung cho SQL Server và Redis) ========================\n"
        f" - Dữ liệu    : {EV_N} chương thật đầu tiên của dbo.Chapter\n"
        f" - SQL Server : bản sao {EV_N} chương; quan sát buffer pool\n"
        " - Redis      : lưu cache:chapter:{chapterId} (String JSON, TTL 30 phút) + "
        f"{EV_VIEWS} bộ đếm views:chapter:{{chapterId}} (không TTL);\n"
        f"   giới hạn RAM  : maxmemory = bộ nhớ nền + {EV_LIMIT_RATIO:.0%} dung lượng {EV_N} chương;\n"
        f"   chính sách {', '.join(EV_POLICIES)};\n"
        f"   tải đọc    : {EV_READS} lượt đọc cache-aside; {EV_HOT_RATIO:.0%} chương nóng nhận "
        f"{EV_HOT_SHARE:.0%} lượt đọc\n"
        )

@scenario(title="Key eviction: cache chương khi bộ nhớ không đủ", pair="test_key_eviction")
def test_key_eviction(ctx: Ctx):
    _announce_eviction()

    # ── Dữ liệu: cùng 1000 chương với redis.py ──
    t = ctx.sandbox_table(
        "EvictChapter", "dbo.Chapter",
        where=f"ChapterId IN (SELECT TOP ({EV_N}) ChapterId FROM dbo.Chapter "
              "WHERE IsDeleted = 0 ORDER BY ChapterId)",
        primary_key=["ChapterId"])
    _require(_count(ctx, t) == EV_N, f"bản sao phải có đúng {EV_N} chương")

    # ── Dung lượng trên đĩa (so sánh trực tiếp với RAM của Redis) ──
    pages = sum(int(r["used"]) for r in _pages(ctx, t))
    ctx.metric("storage_bytes", pages * 8192, "bytes", label="dataset")

    # ── Đọc một chương theo khóa chính (cùng label với redis.py) ──
    chap_id = ctx.sql.scalar(f"SELECT MIN(ChapterId) FROM {t}")
    read_sql = f"SELECT Title, Content FROM {t} WHERE ChapterId = ?"
    s_read = ctx.bench_sql("read_chapter", read_sql, chap_id)
    info = ctx.inspect_sql("read_chapter", read_sql, chap_id)

    # ── Buffer pool: bao nhiêu dữ liệu đang nằm trong RAM ──
    buf_sandbox = int(ctx.sql.scalar(BUFFER_PAGES_SQL, t))
    buf_dbo = int(ctx.sql.scalar(BUFFER_PAGES_SQL, "dbo.Chapter"))
    dbo_pages = int(ctx.sql.scalar(
        "SELECT SUM(used_page_count) FROM sys.dm_db_partition_stats WHERE object_id = OBJECT_ID('dbo.Chapter')"))
    buf_db_mb = int(ctx.sql.scalar(
        "SELECT COUNT(*) FROM sys.dm_os_buffer_descriptors WHERE database_id = DB_ID()")) * 8 / 1024
    buf_all_mb = int(ctx.sql.scalar("SELECT COUNT(*) FROM sys.dm_os_buffer_descriptors")) * 8 / 1024
    mem = ctx.sql.query("SELECT committed_kb, committed_target_kb FROM sys.dm_os_sys_info")[0]
    ple = int(ctx.sql.scalar(
        "SELECT cntr_value FROM sys.dm_os_performance_counters "
        "WHERE counter_name LIKE 'Page life expectancy%' AND object_name LIKE '%Buffer Manager%'"))

    ctx.metric("buffer_pct", round(100 * buf_sandbox / max(pages, 1), 1), "%", label="sandbox", better="higher")
    ctx.metric("buffer_pct", round(100 * buf_dbo / max(dbo_pages, 1), 1), "%", label="dbo_chapter", better="higher")
    ctx.metric("buffer_pool_db_mb", round(buf_db_mb, 1), "MB", label="NovelleDB")
    ctx.metric("buffer_pool_total_mb", round(buf_all_mb, 1), "MB", label="server")
    ctx.metric("memory_target_mb", round(int(mem["committed_target_kb"]) / 1024, 1), "MB", label="server")
    ctx.metric("page_life_expectancy", ple, "s", label="server", better="higher")

    # ── Không mất dữ liệu: buffer pool chỉ là bản sao của trang trên đĩa ──
    rows_lost = EV_N - _count(ctx, t)
    ctx.metric("rows_lost", rows_lost, "rows", label="dataset")
    _require(rows_lost == 0, "SQL Server không được mất dòng nào")

    ctx.observe(
        f"{EV_N} chương chiếm {pages} trang ({pages * 8 / 1024:.1f} MB) trên đĩa; "
        f"{buf_sandbox} trang ({100 * buf_sandbox / max(pages, 1):.0f}%) đang trong buffer pool. "
        f"Bảng thật dbo.Chapter: {buf_dbo}/{dbo_pages} trang trong RAM "
        f"({100 * buf_dbo / max(dbo_pages, 1):.0f}%). Buffer pool của NovelleDB {buf_db_mb:.0f} MB, "
        f"toàn server {buf_all_mb:.0f} MB / mục tiêu {int(mem['committed_target_kb']) / 1024:.0f} MB; "
        f"Page life expectancy {ple} s.")
    ctx.observe(
        f"Đọc một chương theo khóa chính: p50 {s_read.p50:.3f} ms, {info.logical_reads} logical reads. "
        "Khi thiếu RAM, SQL Server chỉ bỏ trang khỏi buffer pool (trang bẩn được ghi xuống đĩa trước), "
        "nên không mất dòng nào; lần đọc sau chậm hơn vì phải đọc lại từ đĩa.")