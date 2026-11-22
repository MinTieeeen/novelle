/*
 * 40_demo_approve_race.sql   [RDS: writes demo rows, cleans them up]   ASK THE TEAM BEFORE RUNNING
 *
 * Concurrency demo for RB15 (docs/module-author-request.md §8.3): two administrators approve the same
 * author request at the same time. sp_ApproveAuthorRequest reads the request WITH (UPDLOCK, HOLDLOCK),
 * so the second session WAITS for the first and then gets error 50001 "already processed".
 *
 * The script works on its own throw-away data (a reader "demo_race_reader" and one PENDING request) and
 * removes it in STEP 5, so the shared database ends as it started (only IDENTITY values are consumed).
 * It is NOT a sqlcmd script: open TWO query windows in SSMS / Azure Data Studio on NovelleDB
 * (login novelle_app) and run the marked blocks by hand, in order.
 *
 *   STEP 1  window A   create the demo reader and request
 *   STEP 2  window A   BEGIN TRAN + approve           -> succeeds, transaction left open (locks held)
 *   STEP 3  window B   approve the same request       -> blocks (see the check query in window C)
 *   STEP 4  window A   COMMIT                         -> window B wakes up and fails with 50001
 *   STEP 5  window A   clean up the demo rows
 */

/* ============================== STEP 1 (window A) ============================== */
SET NOCOUNT ON;

IF EXISTS (SELECT 1 FROM dbo.[User] WHERE Username = 'demo_race_reader')
    THROW 50000, N'Demo data already exists: run STEP 5 first.', 1;

INSERT dbo.[User] (Username, Email, PasswordHash, DisplayName)
VALUES ('demo_race_reader', 'demo_race_reader@novelle.local', '$2a$10$demo.not.a.real.hash.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        N'Demo race reader');

INSERT dbo.AuthorRequest (UserId, ProposedPenName, Introduction)
SELECT UserId, N'Demo Race Pen Name', N'Throw-away request for the two-admin concurrency demo.'
FROM dbo.[User] WHERE Username = 'demo_race_reader';

SELECT r.RequestId, r.Status, u.Username, u.Role
FROM dbo.AuthorRequest r JOIN dbo.[User] u ON u.UserId = r.UserId
WHERE u.Username = 'demo_race_reader';
GO

/* ============================== STEP 2 (window A) ============================== */
-- The outer transaction keeps the procedure's locks after its own COMMIT (that COMMIT only decrements
-- @@TRANCOUNT), so window B can be started while A still holds the request row.
DECLARE @RequestId INT = (SELECT r.RequestId FROM dbo.AuthorRequest r JOIN dbo.[User] u ON u.UserId = r.UserId
                          WHERE u.Username = 'demo_race_reader');
DECLARE @AdminA INT = (SELECT TOP (1) UserId FROM dbo.[User] WHERE Role = 'ADMIN' AND Status = 'ACTIVE' ORDER BY UserId);

BEGIN TRANSACTION;
EXEC dbo.sp_ApproveAuthorRequest @RequestId = @RequestId, @AdminId = @AdminA;
SELECT @@TRANCOUNT AS OpenTransactions, @RequestId AS RequestId, 'approved by A, not committed yet' AS Note;
-- leave the transaction open and switch to window B
GO

/* ============================== STEP 3 (window B) ============================== */
-- Runs until window A commits or rolls back: the UPDLOCK on the request row is held by A.
DECLARE @RequestId INT = (SELECT r.RequestId FROM dbo.AuthorRequest r JOIN dbo.[User] u ON u.UserId = r.UserId
                          WHERE u.Username = 'demo_race_reader');
DECLARE @AdminB INT = (SELECT TOP (1) UserId FROM dbo.[User] WHERE Role = 'ADMIN' AND Status = 'ACTIVE' ORDER BY UserId DESC);

BEGIN TRY
    EXEC dbo.sp_ApproveAuthorRequest @RequestId = @RequestId, @AdminId = @AdminB;
    SELECT 'B approved (unexpected: A must have rolled back)' AS Result;
END TRY
BEGIN CATCH
    SELECT ERROR_NUMBER() AS ErrorNumber, ERROR_MESSAGE() AS ErrorMessage;   -- expected: 50001
END CATCH
GO

/* ============================== while B waits (optional, window C) ============================== */
-- Shows window B blocked on an update lock (wait type LCK_M_U) owned by window A's session.
SELECT r.session_id, r.blocking_session_id, r.wait_type, r.wait_time AS WaitMs, t.text AS RunningSql
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.blocking_session_id <> 0;
GO

/* ============================== STEP 4 (window A) ============================== */
COMMIT TRANSACTION;     -- window B now reads Status = 'APPROVED' and throws 50001
GO

/* ============================== STEP 5 (window A) — clean up ============================== */
-- Removes exactly the rows created in STEP 1 (and the Author row created by the approval).
DECLARE @DemoUser INT = (SELECT UserId FROM dbo.[User] WHERE Username = 'demo_race_reader');

BEGIN TRANSACTION;
DELETE dbo.Author        WHERE UserId = @DemoUser;
DELETE dbo.AuthorRequest WHERE UserId = @DemoUser;
DELETE dbo.[User]        WHERE UserId = @DemoUser;
COMMIT TRANSACTION;

SELECT COUNT(*) AS DemoRowsLeft FROM dbo.[User] WHERE Username = 'demo_race_reader';   -- expected 0
GO
