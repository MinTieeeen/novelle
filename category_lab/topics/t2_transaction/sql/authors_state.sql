-- What the experiment left behind for its two requests.
SELECT r.RequestId, r.UserId, r.Status, r.ReviewedBy, u.Role, a.PenName, a.ApprovedRequestId
FROM lab.transaction__AuthorRequest r
JOIN lab.transaction__User u ON u.UserId = r.UserId
LEFT JOIN lab.transaction__Author a ON a.UserId = r.UserId
WHERE r.RequestId IN (?, ?)
ORDER BY r.RequestId;
