/*
 * 01_create_logins_users.sql   [RDS OK]
 *
 * Creates the three least-privilege logins and their users in NovelleDB.
 * Run with the RDS master user AFTER 00_create_database.sql. Passwords are SQLCMD variables,
 * never stored in the file (they must not contain a single quote):
 *
 *   sqlcmd -S <rds-endpoint>,1433 -U <master-user> -P <password> -C -b -f 65001 \
 *          -v MIGRATOR_PASSWORD="..." APP_PASSWORD="..." RO_PASSWORD="..." \
 *          -i 01_create_logins_users.sql
 *
 * | Login             | Rights                                                         | Used by                   |
 * |-------------------|----------------------------------------------------------------|---------------------------|
 * | novelle_migrator  | db_owner                                                       | schema scripts, seeder    |
 * | novelle_app       | db_datareader, db_datawriter, EXECUTE on schema dbo            | the backend               |
 * | novelle_readonly  | db_datareader, SHOWPLAN, VIEW DATABASE STATE                   | team members, demos       |
 *
 * Safe to re-run: existing logins keep their password. The "relink" block at the end re-attaches
 * database users to logins after a database is restored from a .bak (the login SIDs differ).
 */
SET NOCOUNT ON;
GO

USE master;
GO

IF SUSER_ID(N'novelle_migrator') IS NULL
    EXEC (N'CREATE LOGIN [novelle_migrator] WITH PASSWORD = N''$(MIGRATOR_PASSWORD)'', CHECK_POLICY = ON');
GO
IF SUSER_ID(N'novelle_app') IS NULL
    EXEC (N'CREATE LOGIN [novelle_app] WITH PASSWORD = N''$(APP_PASSWORD)'', CHECK_POLICY = ON');
GO
IF SUSER_ID(N'novelle_readonly') IS NULL
    EXEC (N'CREATE LOGIN [novelle_readonly] WITH PASSWORD = N''$(RO_PASSWORD)'', CHECK_POLICY = ON');
GO

USE NovelleDB;
GO

IF USER_ID(N'novelle_migrator') IS NULL CREATE USER [novelle_migrator] FOR LOGIN [novelle_migrator];
IF USER_ID(N'novelle_app')      IS NULL CREATE USER [novelle_app]      FOR LOGIN [novelle_app];
IF USER_ID(N'novelle_readonly') IS NULL CREATE USER [novelle_readonly] FOR LOGIN [novelle_readonly];
GO

ALTER ROLE db_owner      ADD MEMBER [novelle_migrator];

ALTER ROLE db_datareader ADD MEMBER [novelle_app];
ALTER ROLE db_datawriter ADD MEMBER [novelle_app];
GRANT EXECUTE ON SCHEMA::dbo TO [novelle_app];      -- stored procedures and the table type used by sp_FlushViews

ALTER ROLE db_datareader ADD MEMBER [novelle_readonly];
GRANT SHOWPLAN            TO [novelle_readonly];    -- execution plans
GRANT VIEW DATABASE STATE TO [novelle_readonly];    -- DMVs, Query Store
GO

-- Relink block: run after restoring a .bak taken on another server (orphaned users).
ALTER USER [novelle_migrator] WITH LOGIN = [novelle_migrator];
ALTER USER [novelle_app]      WITH LOGIN = [novelle_app];
ALTER USER [novelle_readonly] WITH LOGIN = [novelle_readonly];
GO

SELECT dp.name AS UserName, dp.type_desc, sp.name AS LoginName
FROM sys.database_principals dp
LEFT JOIN sys.server_principals sp ON sp.sid = dp.sid
WHERE dp.name LIKE N'novelle[_]%';
GO
