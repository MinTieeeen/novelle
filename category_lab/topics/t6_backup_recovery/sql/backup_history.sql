-- Backups RDS took of the current database in the last ? days, by type (D = full, I = differential, L = log).
SELECT b.type,
       COUNT(*)                                                         AS backups,
       MIN(b.backup_finish_date)                                        AS first_finish,
       MAX(b.backup_finish_date)                                        AS last_finish,
       CAST(AVG(b.backup_size) / 1048576.0 AS decimal(12, 2))           AS avg_size_mb,
       CAST(MAX(b.backup_size) / 1048576.0 AS decimal(12, 2))           AS max_size_mb,
       AVG(DATEDIFF(SECOND, b.backup_start_date, b.backup_finish_date)) AS avg_duration_s,
       MAX(DATEDIFF(SECOND, b.backup_start_date, b.backup_finish_date)) AS max_duration_s
FROM msdb.dbo.backupset AS b
WHERE b.database_name = DB_NAME()
  AND b.backup_finish_date >= DATEADD(DAY, -?, SYSUTCDATETIME())
GROUP BY b.type
ORDER BY b.type;
