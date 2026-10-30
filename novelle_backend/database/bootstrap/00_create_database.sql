/*
 * 00_create_database.sql   [RDS OK]
 *
 * Creates the Novelle database. Run ONCE with the RDS master user, connected to `master`:
 *
 *   sqlcmd -S <rds-endpoint>,1433 -U <master-user> -P <password> -C -b -f 65001 -i 00_create_database.sql
 *
 * RDS notes: no ON (FILENAME = ...) clause (RDS manages files); recovery model is managed by RDS.
 * Safe to re-run: every statement checks the current state first.
 */
SET NOCOUNT ON;
GO

IF DB_ID(N'NovelleDB') IS NULL
    CREATE DATABASE NovelleDB COLLATE Vietnamese_100_CI_AI;
GO

-- Default isolation. The concurrency-control demo (topic 5) flips this on and off when needed.
IF EXISTS (SELECT 1 FROM sys.databases WHERE name = N'NovelleDB' AND is_read_committed_snapshot_on = 1)
    ALTER DATABASE NovelleDB SET READ_COMMITTED_SNAPSHOT OFF WITH ROLLBACK IMMEDIATE;
GO

-- Query Store is used by the query-processing topic (topic 3).
IF EXISTS (SELECT 1 FROM sys.databases WHERE name = N'NovelleDB' AND is_query_store_on = 0)
    ALTER DATABASE NovelleDB SET QUERY_STORE = ON;
GO

SELECT name, collation_name, is_read_committed_snapshot_on, is_query_store_on
FROM sys.databases
WHERE name = N'NovelleDB';
GO
