-- RB13 exactly as in novelle_backend/database/queries/99_check_invariants.sql, on the sandbox,
-- plus pen names used by more than one author (what UQ_Author_PenName prevents).
SELECT
    (SELECT COUNT(*) FROM (
        SELECT u.UserId FROM lab.transaction__User u
        WHERE u.Role = 'AUTHOR' AND NOT EXISTS (SELECT 1 FROM lab.transaction__Author a WHERE a.UserId = u.UserId)
        UNION ALL
        SELECT a.UserId FROM lab.transaction__Author a
        JOIN lab.transaction__User u ON u.UserId = a.UserId
        WHERE u.Role <> 'AUTHOR'
        UNION ALL
        SELECT a.UserId FROM lab.transaction__Author a
        JOIN lab.transaction__AuthorRequest r ON r.RequestId = a.ApprovedRequestId
        WHERE r.Status <> 'APPROVED' OR r.UserId <> a.UserId
    ) v) AS Rb13Violations,
    (SELECT COUNT(*) - COUNT(DISTINCT PenName) FROM lab.transaction__Author) AS PenNameDuplicates;
