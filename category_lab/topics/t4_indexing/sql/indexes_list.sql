-- Secondary indexes of {story} (index_id > 1: everything but the heap / clustered index) and whether it
-- has a full-text index. common.reset_indexes drops them, so every variant starts from "PK only".
SELECT i.name AS index_name, 0 AS is_fulltext
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID(N'{story}') AND i.index_id > 1
UNION ALL
SELECT N'(full-text)', 1
FROM sys.fulltext_indexes fi
WHERE fi.object_id = OBJECT_ID(N'{story}');
