-- A temporal table cannot be dropped while system versioning is on.
IF OBJECTPROPERTY(OBJECT_ID('{table}'), 'TableTemporalType') = 2
    ALTER TABLE {table} SET (SYSTEM_VERSIONING = OFF);
GO
DROP TABLE IF EXISTS {table};
DROP TABLE IF EXISTS {history};
