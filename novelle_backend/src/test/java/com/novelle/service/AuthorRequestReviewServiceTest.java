package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;

import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.AuthorRequestLockProperties;
import com.novelle.infrastructure.cache.RedisLockService;
import com.novelle.infrastructure.cache.RedisLockService.Lock;
import com.novelle.infrastructure.cache.RedisLockService.State;
import com.novelle.mapper.AuthorRequestMapper;
import com.novelle.model.AuthorRequestDetail;
import com.novelle.model.StatusCount;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.DataIntegrityViolationException;

class AuthorRequestReviewServiceTest {

    private static final int ADMIN = 1;
    private static final int REQUEST = 395;
    private static final String KEY = "lock:author-request:395";

    private AuthorRequestMapper mapper;
    private RedisLockService lockService;

    @BeforeEach
    void setUp() {
        mapper = mock(AuthorRequestMapper.class);
        lockService = mock(RedisLockService.class);
        when(mapper.findStatus(REQUEST)).thenReturn("PENDING");
        when(mapper.adminDetail(REQUEST)).thenReturn(detail("APPROVED"));
        when(mapper.countOtherByStatus(REQUEST)).thenReturn(List.of(count("REJECTED", 2)));
    }

    private AuthorRequestReviewService service(boolean lockEnabled) {
        return new AuthorRequestReviewService(mapper, lockService,
                new AuthorRequestLockProperties(lockEnabled, Duration.ofSeconds(5)));
    }

    private static AuthorRequestDetail detail(String status) {
        AuthorRequestDetail d = new AuthorRequestDetail();
        d.setRequestId(REQUEST);
        d.setProposedPenName("Tịch Dương");
        d.setStatus(status);
        AuthorRequestDetail.Applicant a = new AuthorRequestDetail.Applicant();
        a.setUserId(171);
        a.setUsername("reader_171");
        a.setRole("AUTHOR");
        a.setStatus("ACTIVE");
        d.setApplicant(a);
        return d;
    }

    private static StatusCount count(String status, int total) {
        StatusCount c = new StatusCount();
        c.setStatus(status);
        c.setTotal(total);
        return c;
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    /* ---------- queue ---------- */

    @ParameterizedTest
    @CsvSource(nullValues = "NULL", value = {
            "NULL,      PENDING",
            "'  ',      PENDING",
            "approved,  APPROVED",
            "' Rejected ', REJECTED",
            "all,       NULL"})
    void statusFilterIsCaseInsensitive(String input, String expected) {
        assertThat(AuthorRequestReviewService.parseStatus(input)).isEqualTo(expected);
    }

    @Test
    void unknownStatusIsAValidationError() {
        assertCode(() -> AuthorRequestReviewService.parseStatus("DONE"), ErrorCode.VALIDATION_FAILED);
    }

    @Test
    void emptyQueueSkipsThePageQuery() {
        when(mapper.adminCount("PENDING")).thenReturn(0L);

        assertThat(service(false).page(null, null, null).items()).isEmpty();
        verify(mapper, never()).adminPage(any(), anyInt(), anyInt());
    }

    @Test
    void detailCountsEveryStatus() {
        var res = service(false).detail(REQUEST);

        assertThat(res.otherRequests().rejected()).isEqualTo(2);
        assertThat(res.otherRequests().pending()).isZero();
        assertThat(res.reviewer()).isNull();
    }

    @Test
    void unknownDetailIsNotFound() {
        when(mapper.adminDetail(9)).thenReturn(null);

        assertCode(() -> service(false).detail(9), ErrorCode.AUTHOR_REQUEST_NOT_FOUND);
    }

    /* ---------- approve / reject: pre-check ---------- */

    @Test
    void approveCallsTheProcedureWithoutTouchingRedisWhenTheLockIsOff() {
        var res = service(false).approve(ADMIN, REQUEST);

        assertThat(res.status()).isEqualTo("APPROVED");
        verify(mapper).approve(REQUEST, ADMIN);
        verifyNoInteractions(lockService);
    }

    @Test
    void unknownRequestIsNotFoundWithoutCallingTheProcedure() {
        when(mapper.findStatus(REQUEST)).thenReturn(null);

        assertCode(() -> service(false).approve(ADMIN, REQUEST), ErrorCode.AUTHOR_REQUEST_NOT_FOUND);
        verify(mapper, never()).approve(anyInt(), anyInt());
    }

    @ParameterizedTest
    @CsvSource({"APPROVED", "REJECTED", "CANCELLED"})
    void decidedRequestIsAlreadyProcessedWithoutCallingTheProcedure(String status) {
        when(mapper.findStatus(REQUEST)).thenReturn(status);

        assertCode(() -> service(false).approve(ADMIN, REQUEST), ErrorCode.ALREADY_PROCESSED);
        assertCode(() -> service(false).reject(ADMIN, REQUEST, "x"), ErrorCode.ALREADY_PROCESSED);
        verify(mapper, never()).approve(anyInt(), anyInt());
        verify(mapper, never()).reject(anyInt(), anyInt(), any());
    }

    @Test
    void blankRejectNoteIsStoredAsNull() {
        service(false).reject(ADMIN, REQUEST, "   ");

        verify(mapper).reject(org.mockito.ArgumentMatchers.eq(REQUEST), org.mockito.ArgumentMatchers.eq(ADMIN), isNull());
    }

    @Test
    void rejectNoteIsTrimmed() {
        service(false).reject(ADMIN, REQUEST, "  quá ngắn  ");

        verify(mapper).reject(REQUEST, ADMIN, "quá ngắn");
    }

    /* ---------- approve / reject: Redis lock ---------- */

    @Test
    void busyLockIsReviewInProgressWithoutCallingTheProcedure() {
        when(lockService.tryLock(KEY, Duration.ofSeconds(5))).thenReturn(new Lock(KEY, null, State.BUSY));

        assertCode(() -> service(true).approve(ADMIN, REQUEST), ErrorCode.REVIEW_IN_PROGRESS);
        verify(mapper, never()).findStatus(anyInt());
        verify(mapper, never()).approve(anyInt(), anyInt());
    }

    @Test
    void acquiredLockIsReleasedAfterSuccess() {
        Lock lock = new Lock(KEY, "token", State.ACQUIRED);
        when(lockService.tryLock(KEY, Duration.ofSeconds(5))).thenReturn(lock);

        service(true).approve(ADMIN, REQUEST);

        verify(mapper).approve(REQUEST, ADMIN);
        verify(lockService).release(lock);
    }

    @Test
    void acquiredLockIsReleasedWhenTheProcedureFails() {
        Lock lock = new Lock(KEY, "token", State.ACQUIRED);
        when(lockService.tryLock(KEY, Duration.ofSeconds(5))).thenReturn(lock);
        doThrow(new DataIntegrityViolationException("50001")).when(mapper).approve(REQUEST, ADMIN);

        assertThatThrownBy(() -> service(true).approve(ADMIN, REQUEST)).isInstanceOf(DataIntegrityViolationException.class);
        verify(lockService).release(lock);
    }

    @Test
    void acquiredLockIsReleasedWhenThePreCheckFails() {
        Lock lock = new Lock(KEY, "token", State.ACQUIRED);
        when(lockService.tryLock(KEY, Duration.ofSeconds(5))).thenReturn(lock);
        when(mapper.findStatus(REQUEST)).thenReturn("APPROVED");

        assertCode(() -> service(true).approve(ADMIN, REQUEST), ErrorCode.ALREADY_PROCESSED);
        verify(lockService).release(lock);
    }

    @Test
    void redisDownProceedsWithoutALock() {
        Lock skipped = new Lock(KEY, null, State.SKIPPED);
        when(lockService.tryLock(KEY, Duration.ofSeconds(5))).thenReturn(skipped);

        service(true).approve(ADMIN, REQUEST);

        verify(mapper).approve(REQUEST, ADMIN);
    }
}
