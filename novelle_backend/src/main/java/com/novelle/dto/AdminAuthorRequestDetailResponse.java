package com.novelle.dto;

import java.time.Instant;
import java.util.List;

import com.novelle.model.AuthorRequestDetail;
import com.novelle.model.StatusCount;

/** Admin view of one request (A5–A7). {@code reviewer} is absent while the request is pending or cancelled. */
public record AdminAuthorRequestDetailResponse(
        int requestId,
        String proposedPenName,
        String introduction,
        String status,
        String reviewNote,
        Instant createdAt,
        Instant reviewedAt,
        Applicant applicant,
        UserRefResponse reviewer,
        OtherRequests otherRequests) {

    public static AdminAuthorRequestDetailResponse from(AuthorRequestDetail d, List<StatusCount> others) {
        AuthorRequestDetail.Applicant a = d.getApplicant();
        return new AdminAuthorRequestDetailResponse(d.getRequestId(), d.getProposedPenName(), d.getIntroduction(),
                d.getStatus(), d.getReviewNote(), Times.utc(d.getCreatedAt()), Times.utc(d.getReviewedAt()),
                new Applicant(a.getUserId(), a.getUsername(), a.getEmail(), a.getAvatarUrl(), a.getRole(),
                        a.getStatus(), Times.utc(a.getJoinedAt())),
                UserRefResponse.from(d.getReviewer()), OtherRequests.from(others));
    }

    /** The applicant's account as it is now. */
    public record Applicant(int userId, String username, String email, String avatarUrl, String role,
                            String status, Instant joinedAt) {
    }

    /** Counts of the applicant's other requests; every status is present (0 when none). */
    public record OtherRequests(int pending, int approved, int rejected, int cancelled) {

        static OtherRequests from(List<StatusCount> counts) {
            int pending = 0;
            int approved = 0;
            int rejected = 0;
            int cancelled = 0;
            for (StatusCount c : counts) {
                switch (c.getStatus()) {
                    case "PENDING" -> pending = c.getTotal();
                    case "APPROVED" -> approved = c.getTotal();
                    case "REJECTED" -> rejected = c.getTotal();
                    case "CANCELLED" -> cancelled = c.getTotal();
                    default -> { }
                }
            }
            return new OtherRequests(pending, approved, rejected, cancelled);
        }
    }
}
