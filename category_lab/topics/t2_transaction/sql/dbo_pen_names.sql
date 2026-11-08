-- Redis side: pen names already in use (loaded into a Set, the Redis stand-in for UQ_Author_PenName).
SELECT PenName FROM dbo.Author ORDER BY UserId;
