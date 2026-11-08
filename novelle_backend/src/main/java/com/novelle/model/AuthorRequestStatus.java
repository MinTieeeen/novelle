package com.novelle.model;

/** {@code AuthorRequest.Status} (CK_AuthorRequest_Status). Only PENDING can change (docs/module-author-request.md §9). */
public enum AuthorRequestStatus {
    PENDING,
    APPROVED,
    REJECTED,
    CANCELLED
}
