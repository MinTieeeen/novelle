-- Time between two consecutive backups of one type (? = 'L' or 'D') in the last ? days.
-- The largest gap is the worst-case data loss if the database had to be restored from these backups.
WITH b AS (
    SELECT backup_finish_date,
           LAG(backup_finish_date) OVER (ORDER BY backup_finish_date) AS prev_finish
    FROM msdb.dbo.backupset
    WHERE database_name = DB_NAME()
      AND type = ?
      AND backup_finish_date >= DATEADD(DAY, -?, SYSUTCDATETIME())
)
SELECT COUNT(*)                                                    AS gaps,
       MIN(DATEDIFF(SECOND, prev_finish, backup_finish_date))      AS min_gap_s,
       AVG(DATEDIFF(SECOND, prev_finish, backup_finish_date))      AS avg_gap_s,
       MAX(DATEDIFF(SECOND, prev_finish, backup_finish_date))      AS max_gap_s,
       DATEDIFF(SECOND, MAX(backup_finish_date), SYSUTCDATETIME()) AS since_last_s
FROM b
WHERE prev_finish IS NOT NULL;
