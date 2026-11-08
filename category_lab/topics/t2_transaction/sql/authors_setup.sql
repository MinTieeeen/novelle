/*
 * T1/T2 sandbox: the author-approval part of NovelleDB (dbo.[User], dbo.AuthorRequest, dbo.Author), only the
 * columns sp_ApproveAuthorRequest touches, with the keys and constraints that matter for the race:
 *   PK_User, PK_AuthorRequest, UX_AuthorRequest_Pending (one PENDING request per user),
 *   PK_Author (one profile per user), UQ_Author_PenName, UQ_Author_ApprovedRequest.
 * No foreign keys: the runner drops the lab.transaction__* tables in any order.
 */
DROP TABLE IF EXISTS lab.transaction__Author;
DROP TABLE IF EXISTS lab.transaction__AuthorRequest;
DROP TABLE IF EXISTS lab.transaction__User;
GO
CREATE TABLE lab.transaction__User (
    UserId     INT          NOT NULL CONSTRAINT PK_transaction__User PRIMARY KEY,
    Username   VARCHAR(50)  NOT NULL,
    Role       VARCHAR(10)  NOT NULL CONSTRAINT CK_transaction__User_Role CHECK (Role IN ('READER', 'AUTHOR', 'ADMIN')),
    Status     VARCHAR(10)  NOT NULL,
    UpdatedAt  DATETIME2(3) NOT NULL
);
CREATE TABLE lab.transaction__AuthorRequest (
    RequestId        INT           NOT NULL CONSTRAINT PK_transaction__AuthorRequest PRIMARY KEY,
    UserId           INT           NOT NULL,
    ProposedPenName  NVARCHAR(100) NOT NULL,
    Status           VARCHAR(10)   NOT NULL
        CONSTRAINT CK_transaction__AuthorRequest_Status CHECK (Status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    ReviewedBy       INT           NULL,
    ReviewedAt       DATETIME2(3)  NULL
);
CREATE UNIQUE NONCLUSTERED INDEX UX_transaction__AuthorRequest_Pending
    ON lab.transaction__AuthorRequest (UserId) WHERE Status = 'PENDING';
CREATE TABLE lab.transaction__Author (
    UserId             INT           NOT NULL CONSTRAINT PK_transaction__Author PRIMARY KEY,
    PenName            NVARCHAR(100) NOT NULL CONSTRAINT UQ_transaction__Author_PenName UNIQUE,
    ApprovedRequestId  INT           NOT NULL CONSTRAINT UQ_transaction__Author_ApprovedRequest UNIQUE,
    CreatedAt          DATETIME2(3)  NOT NULL CONSTRAINT DF_transaction__Author_CreatedAt DEFAULT SYSUTCDATETIME()
);
