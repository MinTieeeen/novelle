-- Named statements of the crash_recovery scenario; {table} is a sandbox write-test table.

-- name: insert_rows
INSERT INTO {table} (Payload)
SELECT TOP (?) REPLICATE(N'c', 200) FROM sys.all_objects AS a CROSS JOIN sys.all_objects AS b;

-- name: row_count
SELECT COUNT(*) FROM {table};
