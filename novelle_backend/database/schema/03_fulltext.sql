/*
 * 03_fulltext.sql   [RDS OK, verify on the Express instance]
 *
 * Full-text search on Story(Title, Description) for F2.
 * Run this file on its own, outside any transaction (CREATE FULLTEXT INDEX cannot run in one).
 *
 * - ACCENT_SENSITIVITY = OFF so that "tien hiep" finds "Tiên hiệp".
 * - Uses the Vietnamese word breaker (LCID 1066) when the instance has it, otherwise the neutral
 *   language (0). The language actually used is printed at the end; record it in the data dictionary.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'ftc_Novelle')
    CREATE FULLTEXT CATALOG ftc_Novelle WITH ACCENT_SENSITIVITY = OFF;
GO

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'dbo.Story'))
BEGIN
    DECLARE @lcid INT = CASE WHEN EXISTS (SELECT 1 FROM sys.fulltext_languages WHERE lcid = 1066) THEN 1066 ELSE 0 END;
    DECLARE @sql NVARCHAR(MAX) = N'CREATE FULLTEXT INDEX ON dbo.Story
        (Title LANGUAGE ' + CAST(@lcid AS NVARCHAR(10)) + N', Description LANGUAGE ' + CAST(@lcid AS NVARCHAR(10)) + N')
        KEY INDEX PK_Story ON ftc_Novelle
        WITH CHANGE_TRACKING AUTO;';
    EXEC (@sql);
END
GO

SELECT c.name AS CatalogName, c.is_accent_sensitivity_on,
       fic.column_id, COL_NAME(fic.object_id, fic.column_id) AS ColumnName, fic.language_id
FROM sys.fulltext_catalogs c
JOIN sys.fulltext_indexes fi ON fi.fulltext_catalog_id = c.fulltext_catalog_id
JOIN sys.fulltext_index_columns fic ON fic.object_id = fi.object_id
WHERE fi.object_id = OBJECT_ID(N'dbo.Story');
GO
