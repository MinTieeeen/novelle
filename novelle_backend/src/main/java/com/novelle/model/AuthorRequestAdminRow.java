package com.novelle.model;

import java.time.LocalDateTime;

/** One line of the admin review queue: the request, its applicant and whether they were rejected before. */
public class AuthorRequestAdminRow {

    private int requestId;
    private String proposedPenName;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime reviewedAt;
    private UserRef applicant;
    private boolean previouslyRejected;

    public int getRequestId() { return requestId; }
    public void setRequestId(int requestId) { this.requestId = requestId; }

    public String getProposedPenName() { return proposedPenName; }
    public void setProposedPenName(String proposedPenName) { this.proposedPenName = proposedPenName; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(LocalDateTime reviewedAt) { this.reviewedAt = reviewedAt; }

    public UserRef getApplicant() { return applicant; }
    public void setApplicant(UserRef applicant) { this.applicant = applicant; }

    public boolean isPreviouslyRejected() { return previouslyRejected; }
    public void setPreviouslyRejected(boolean previouslyRejected) { this.previouslyRejected = previouslyRejected; }
}
