-- What the later scenarios need from the RDS instance; read-only.
SELECT CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(32))                         AS product_version,
       CAST(SERVERPROPERTY('Edition') AS VARCHAR(64))                                AS edition,
       CAST(FULLTEXTSERVICEPROPERTY('IsFullTextInstalled') AS INT)                   AS fulltext_installed,
       CASE WHEN EXISTS (SELECT 1 FROM sys.fulltext_languages WHERE lcid = 1066)
            THEN 1 ELSE 0 END                                                        AS vietnamese_word_breaker,
       CASE WHEN EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'ftc_Novelle')
            THEN 1 ELSE 0 END                                                        AS novelle_catalog_exists,
       ISNULL(HAS_PERMS_BY_NAME(N'ftc_Novelle', N'FULLTEXT CATALOG', N'REFERENCES'), 0) AS catalog_references,
       HAS_PERMS_BY_NAME(NULL, N'DATABASE', N'VIEW DATABASE STATE')                  AS view_database_state,
       HAS_PERMS_BY_NAME(NULL, N'DATABASE', N'CREATE TABLE')                         AS create_table,
       CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS VARCHAR(64))               AS db_collation;
