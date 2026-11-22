-- Pages and rows of every index of {story} (index_id 0 = heap, 1 = clustered index = the table itself).
-- sys.dm_db_partition_stats needs VIEW DATABASE STATE; dataset.py reports the size as unknown without it.
SELECT ISNULL(i.name, '(heap)')            AS index_name,
       i.type_desc                          AS index_type,
       SUM(ps.row_count)                    AS [rows],
       SUM(ps.in_row_data_page_count)       AS in_row_pages,
       SUM(ps.lob_used_page_count)          AS lob_pages,
       SUM(ps.used_page_count)              AS used_pages
FROM sys.dm_db_partition_stats ps
JOIN sys.indexes i ON i.object_id = ps.object_id AND i.index_id = ps.index_id
WHERE ps.object_id = OBJECT_ID(N'{story}')
GROUP BY i.index_id, i.name, i.type_desc
ORDER BY i.index_id;
