-- {table}: a sandbox table for write tests (dropped after the run).
DROP TABLE IF EXISTS {table};
CREATE TABLE {table} (
    Id        bigint IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    Payload   nvarchar(200)         NOT NULL,
    CreatedAt datetime2(7)          NOT NULL DEFAULT SYSUTCDATETIME()
);
