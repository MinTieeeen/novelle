package com.novelle.service;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import com.novelle.dto.AdminAuthorRequestDetailResponse;
import com.novelle.dto.AdminAuthorRequestItemResponse;
import com.novelle.dto.PageResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.AuthorRequestLockProperties;
import com.novelle.infrastructure.cache.LockKeys;
import com.novelle.infrastructure.cache.RedisLockService;
import com.novelle.mapper.AuthorRequestMapper;
import com.novelle.model.AuthorRequestDetail;
import com.novelle.model.AuthorRequestStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The admin side of author requests (F11, RB15): review queue, detail, approve, reject.
 *
 * <p>Approve and reject are deliberately <b>not</b> {@code @Transactional} (docs/module-author-request.md D3):
 * {@code sp_ApproveAuthorRequest} / {@code sp_RejectAuthorRequest} open and commit their own transaction and lock
 * the request row WITH (UPDLOCK, HOLDLOCK). The status pre-check here only answers the common cases early
 * (404 / 409 without an error inside the procedure); when two admins pass it at the same time, the procedure
 * lets one win and the other gets error 50001 → 409 ALREADY_PROCESSED.
 */
@Service
public class AuthorRequestReviewService {

    /** Query value of {@code status} meaning "every status". */
    static final String ALL = "ALL";

    private final AuthorRequestMapper authorRequestMapper;
    private final RedisLockService lockService;
    private final AuthorRequestLockProperties lockProperties;

    public AuthorRequestReviewService(AuthorRequestMapper authorRequestMapper, RedisLockService lockService,
                                      AuthorRequestLockProperties lockProperties) {
        this.authorRequestMapper = authorRequestMapper;
        this.lockService = lockService;
        this.lockProperties = lockProperties;
    }

    /** {@code status}: PENDING (default), APPROVED, REJECTED, CANCELLED or ALL, case-insensitive. */
    @Transactional(readOnly = true)
    public PageResponse<AdminAuthorRequestItemResponse> page(String status, Integer page, Integer size) {
        String filter = parseStatus(status);
        PageQuery q = PageQuery.of(page, size);
        long total = authorRequestMapper.adminCount(filter);
        List<AdminAuthorRequestItemResponse> items = total == 0 ? List.of()
                : authorRequestMapper.adminPage(filter, q.offset(), q.size()).stream()
                        .map(AdminAuthorRequestItemResponse::from).toList();
        return PageResponse.of(items, q.page(), q.size(), total);
    }

    @Transactional(readOnly = true)
    public AdminAuthorRequestDetailResponse detail(int requestId) {
        return loadDetail(requestId);
    }

    public AdminAuthorRequestDetailResponse approve(int adminId, int requestId) {
        return review(requestId, () -> authorRequestMapper.approve(requestId, adminId));
    }

    /** A blank note is stored as NULL. */
    public AdminAuthorRequestDetailResponse reject(int adminId, int requestId, String note) {
        String cleanNote = note == null || note.isBlank() ? null : note.trim();
        return review(requestId, () -> authorRequestMapper.reject(requestId, adminId, cleanNote));
    }

    /**
     * [Redis lock when enabled] → pre-check the status → run the procedure → [release] → reload the detail.
     * The lock is released in {@code finally}, also when the procedure throws.
     */
    private AdminAuthorRequestDetailResponse review(int requestId, Runnable procedure) {
        RedisLockService.Lock lock = null;
        if (lockProperties.enabled()) {
            lock = lockService.tryLock(LockKeys.authorRequest(requestId), lockProperties.ttl());
            if (!lock.mayProceed()) {
                throw new ApiException(ErrorCode.REVIEW_IN_PROGRESS);
            }
        }
        try {
            String status = authorRequestMapper.findStatus(requestId);
            if (status == null) {
                throw new ApiException(ErrorCode.AUTHOR_REQUEST_NOT_FOUND);
            }
            if (!AuthorRequestStatus.PENDING.name().equals(status)) {
                throw new ApiException(ErrorCode.ALREADY_PROCESSED);
            }
            procedure.run();
        } finally {
            if (lock != null) {
                lockService.release(lock);
            }
        }
        return loadDetail(requestId);
    }

    private AdminAuthorRequestDetailResponse loadDetail(int requestId) {
        AuthorRequestDetail detail = authorRequestMapper.adminDetail(requestId);
        if (detail == null) {
            throw new ApiException(ErrorCode.AUTHOR_REQUEST_NOT_FOUND);
        }
        return AdminAuthorRequestDetailResponse.from(detail, authorRequestMapper.countOtherByStatus(requestId));
    }

    /** Null → PENDING; ALL → null (no filter); otherwise one of the statuses, else 400 on {@code status}. */
    static String parseStatus(String value) {
        if (value == null || value.isBlank()) {
            return AuthorRequestStatus.PENDING.name();
        }
        String upper = value.trim().toUpperCase(Locale.ROOT);
        if (ALL.equals(upper)) {
            return null;
        }
        return Arrays.stream(AuthorRequestStatus.values()).map(Enum::name).filter(upper::equals).findFirst()
                .orElseThrow(() -> ApiException.invalidField("status",
                        "must be one of PENDING, APPROVED, REJECTED, CANCELLED, ALL"));
    }
}
