package com.novelle.model;

import java.time.LocalDateTime;

/**
 * Filters of the admin user list (U1), already validated by the service. Every field may be null (= no filter).
 *
 * @param role        READER / AUTHOR / ADMIN
 * @param status      ACTIVE / BANNED
 * @param likePattern {@code %q%} with the LIKE wildcards of {@code q} escaped
 * @param createdFrom inclusive, UTC
 * @param createdTo   exclusive, UTC
 */
public record AdminUserCriteria(String role, String status, String likePattern,
                                LocalDateTime createdFrom, LocalDateTime createdTo) {
}
