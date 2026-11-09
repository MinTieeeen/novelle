package com.novelle.dto;

import jakarta.validation.constraints.Size;

/** Optional body of POST /api/admin/author-requests/{id}/reject; a blank note means "no note". */
public record RejectAuthorRequestRequest(@Size(max = 500) String note) {
}
