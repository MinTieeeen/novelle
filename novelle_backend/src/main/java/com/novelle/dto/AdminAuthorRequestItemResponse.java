package com.novelle.dto;

import java.time.Instant;

import com.novelle.model.AuthorRequestAdminRow;

/** One line of the admin review queue (A4). */
public record AdminAuthorRequestItemResponse(
        int requestId,
        String proposedPenName,
        String status,
        Instant createdAt,
        Instant reviewedAt,
        UserRefResponse applicant,
        boolean previouslyRejected) {

    public static AdminAuthorRequestItemResponse from(AuthorRequestAdminRow r) {
        return new AdminAuthorRequestItemResponse(r.getRequestId(), r.getProposedPenName(), r.getStatus(),
                Times.utc(r.getCreatedAt()), Times.utc(r.getReviewedAt()),
                UserRefResponse.from(r.getApplicant()), r.isPreviouslyRejected());
    }
}
