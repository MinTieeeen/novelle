-- Insert ? rows into {table}; ? = 1 commits after every row, 0 commits once at the end.
-- Returns the server-side time and how many log flushes / WRITELOG waits the inserts caused.
-- The log counters are per database, so other sessions writing to NovelleDB at the same time add noise.
SET NOCOUNT ON;
DECLARE @rows int = ?, @each bit = ?, @i int = 0;
DECLARE @t0 datetime2(7), @elapsed_us bigint;
DECLARE @flush0 bigint, @bytes0 bigint, @wait0 bigint, @flush1 bigint, @bytes1 bigint, @wait1 bigint;

SELECT @flush0 = MAX(CASE WHEN counter_name = 'Log Flushes/sec' THEN cntr_value END),
       @bytes0 = MAX(CASE WHEN counter_name = 'Log Bytes Flushed/sec' THEN cntr_value END)
FROM sys.dm_os_performance_counters                       -- nchar columns: trailing spaces, hence RTRIM
WHERE RTRIM(object_name) LIKE '%:Databases' AND RTRIM(instance_name) = DB_NAME()
  AND counter_name IN ('Log Flushes/sec', 'Log Bytes Flushed/sec');
SELECT @wait0 = ISNULL(SUM(wait_time_ms), 0)
FROM sys.dm_exec_session_wait_stats WHERE session_id = @@SPID AND wait_type = 'WRITELOG';

SET @t0 = SYSDATETIME();
IF @each = 0 BEGIN TRANSACTION;
WHILE @i < @rows
BEGIN
    INSERT INTO {table} (Payload) VALUES (REPLICATE(N'n', 200));   -- each row ~400 bytes of data
    SET @i += 1;
END;
IF @each = 0 COMMIT TRANSACTION;
SET @elapsed_us = DATEDIFF_BIG(MICROSECOND, @t0, SYSDATETIME());

SELECT @flush1 = MAX(CASE WHEN counter_name = 'Log Flushes/sec' THEN cntr_value END),
       @bytes1 = MAX(CASE WHEN counter_name = 'Log Bytes Flushed/sec' THEN cntr_value END)
FROM sys.dm_os_performance_counters
WHERE RTRIM(object_name) LIKE '%:Databases' AND RTRIM(instance_name) = DB_NAME()
  AND counter_name IN ('Log Flushes/sec', 'Log Bytes Flushed/sec');
SELECT @wait1 = ISNULL(SUM(wait_time_ms), 0)
FROM sys.dm_exec_session_wait_stats WHERE session_id = @@SPID AND wait_type = 'WRITELOG';

SELECT @elapsed_us / 1000.0    AS elapsed_ms,
       @flush1 - @flush0       AS log_flushes,
       @bytes1 - @bytes0       AS log_bytes,
       @wait1 - @wait0         AS writelog_wait_ms;
