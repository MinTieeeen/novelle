-- Recovery settings of the current database and how much log is waiting for the next log backup.
SELECT d.name,
       d.recovery_model_desc,
       d.log_reuse_wait_desc,
       d.delayed_durability_desc,
       d.page_verify_option_desc,
       ls.log_backup_time,
       ls.log_since_last_log_backup_mb,
       CAST(lu.total_log_size_in_bytes / 1048576.0 AS decimal(12, 2)) AS log_size_mb,
       CAST(lu.used_log_space_in_percent AS decimal(5, 2))             AS log_used_pct
FROM sys.databases AS d
CROSS APPLY sys.dm_db_log_stats(d.database_id) AS ls
CROSS JOIN sys.dm_db_log_space_usage AS lu
WHERE d.database_id = DB_ID();
