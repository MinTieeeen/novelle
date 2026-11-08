-- T2 step 2/3: the applicant becomes an AUTHOR. Param: @UserId.
UPDATE lab.transaction__User SET Role = 'AUTHOR', UpdatedAt = SYSUTCDATETIME() WHERE UserId = ?;
