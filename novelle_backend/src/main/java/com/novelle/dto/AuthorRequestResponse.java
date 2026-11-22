package com.novelle.dto;

import java.time.Instant;

import com.novelle.model.AuthorRequest;

/** One author request as its applicant sees it (A1–A3). */
public record AuthorRequestResponse(
        int requestId,
        String proposedPenName,
        String introduction,
        String status,
        String reviewNote,
        Instant createdAt,
        Instant reviewedAt) {

    public static AuthorRequestResponse from(AuthorRequest r) {
        return new AuthorRequestResponse(r.getRequestId(), r.getProposedPenName(), r.getIntroduction(),
                r.getStatus(), r.getReviewNote(), Times.utc(r.getCreatedAt()), Times.utc(r.getReviewedAt()));
    }
}
