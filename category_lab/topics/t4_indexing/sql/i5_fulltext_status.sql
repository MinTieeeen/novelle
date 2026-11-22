-- I5: state of the full-text index of {table}. populate_status 0 = idle; item_count = rows indexed;
-- pending = changes not applied yet; fragments_kb = size of the index fragments on disk.
SELECT CAST(OBJECTPROPERTYEX(OBJECT_ID(N'{table}'), 'TableFulltextPopulateStatus') AS INT) AS populate_status,
       CAST(OBJECTPROPERTYEX(OBJECT_ID(N'{table}'), 'TableFulltextItemCount') AS INT)     AS item_count,
       CAST(OBJECTPROPERTYEX(OBJECT_ID(N'{table}'), 'TableFulltextPendingChanges') AS INT) AS pending,
       ISNULL((SELECT SUM(CAST(f.data_size AS BIGINT)) FROM sys.fulltext_index_fragments f
               WHERE f.table_id = OBJECT_ID(N'{table}')), 0) / 1024.0                     AS fragments_kb,
       (SELECT COUNT(*) FROM {table})                                                     AS table_rows;
