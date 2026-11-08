-- A pen name that an existing author already uses (T2 makes the INSERT Author fail on it).
SELECT TOP (1) PenName FROM lab.transaction__Author ORDER BY UserId;
