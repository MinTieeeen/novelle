package com.novelle.model;

import java.time.LocalDateTime;

/** Admin view of one request: the request, the applicant's account and the reviewer (null while pending). */
public class AuthorRequestDetail {

    private int requestId;
    private String proposedPenName;
    private String introduction;
    private String status;
    private String reviewNote;
    private LocalDateTime createdAt;
    private LocalDateTime reviewedAt;
    private Applicant applicant;
    private UserRef reviewer;

    public int getRequestId() { return requestId; }
    public void setRequestId(int requestId) { this.requestId = requestId; }

    public String getProposedPenName() { return proposedPenName; }
    public void setProposedPenName(String proposedPenName) { this.proposedPenName = proposedPenName; }

    public String getIntroduction() { return introduction; }
    public void setIntroduction(String introduction) { this.introduction = introduction; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getReviewNote() { return reviewNote; }
    public void setReviewNote(String reviewNote) { this.reviewNote = reviewNote; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(LocalDateTime reviewedAt) { this.reviewedAt = reviewedAt; }

    public Applicant getApplicant() { return applicant; }
    public void setApplicant(Applicant applicant) { this.applicant = applicant; }

    public UserRef getReviewer() { return reviewer; }
    public void setReviewer(UserRef reviewer) { this.reviewer = reviewer; }

    /** The applicant's account as it is now (role becomes AUTHOR after approval). */
    public static class Applicant {

        private int userId;
        private String username;
        private String email;
        private String avatarUrl;
        private String role;
        private String status;
        private LocalDateTime joinedAt;

        public int getUserId() { return userId; }
        public void setUserId(int userId) { this.userId = userId; }

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }

        public String getAvatarUrl() { return avatarUrl; }
        public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }

        public LocalDateTime getJoinedAt() { return joinedAt; }
        public void setJoinedAt(LocalDateTime joinedAt) { this.joinedAt = joinedAt; }
    }
}
