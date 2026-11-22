package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.util.List;

import com.novelle.dto.AuthorRequestResponse;
import com.novelle.dto.CreateAuthorRequestRequest;
import com.novelle.exception.ApiError;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.AuthMapper;
import com.novelle.mapper.AuthorRequestMapper;
import com.novelle.model.AuthorRequest;
import com.novelle.model.UserState;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.DuplicateKeyException;

class AuthorRequestServiceTest {

    private static final int USER = 120;
    private static final String INTRO = "Tôi muốn viết một bộ truyện tiên hiệp dài.";

    private AuthorRequestMapper mapper;
    private AuthMapper authMapper;
    private AuthorRequestService service;

    @BeforeEach
    void setUp() {
        mapper = mock(AuthorRequestMapper.class);
        authMapper = mock(AuthMapper.class);
        service = new AuthorRequestService(mapper, authMapper);
        when(authMapper.findState(USER)).thenReturn(state("READER", "ACTIVE"));
        // the INSERT sets the generated key, as MyBatis does
        doAnswer(inv -> {
            inv.<AuthorRequest>getArgument(0).setRequestId(77);
            return 1;
        }).when(mapper).insert(any());
        when(mapper.findOwned(77, USER)).thenReturn(stored(77, "PENDING"));
    }

    private static UserState state(String role, String status) {
        UserState s = new UserState();
        s.setUserId(USER);
        s.setRole(role);
        s.setStatus(status);
        return s;
    }

    private static AuthorRequest stored(int id, String status) {
        AuthorRequest r = new AuthorRequest();
        r.setRequestId(id);
        r.setUserId(USER);
        r.setProposedPenName("Mộc Lan");
        r.setIntroduction(INTRO);
        r.setStatus(status);
        return r;
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    /* ---------- submit ---------- */

    @Test
    void submitTrimsAndInsertsAPendingRequest() {
        AuthorRequestResponse res = service.submit(USER, new CreateAuthorRequestRequest("  Mộc Lan ", "  " + INTRO + " "));

        assertThat(res.requestId()).isEqualTo(77);
        assertThat(res.status()).isEqualTo("PENDING");
        verify(mapper).insert(org.mockito.ArgumentMatchers.argThat(r ->
                r.getUserId() == USER && r.getProposedPenName().equals("Mộc Lan") && r.getIntroduction().equals(INTRO)));
        verify(mapper).penNameTaken("Mộc Lan");
    }

    @ParameterizedTest
    @CsvSource({"AUTHOR, ACTIVE", "ADMIN, ACTIVE", "READER, BANNED"})
    void onlyAnActiveReaderMaySubmit(String role, String status) {
        when(authMapper.findState(USER)).thenReturn(state(role, status));

        assertCode(() -> service.submit(USER, new CreateAuthorRequestRequest("Mộc Lan", INTRO)),
                ErrorCode.ONLY_READER_CAN_REQUEST);
        verify(mapper, never()).insert(any());
    }

    @Test
    void unknownUserCannotSubmit() {
        when(authMapper.findState(USER)).thenReturn(null);

        assertCode(() -> service.submit(USER, new CreateAuthorRequestRequest("Mộc Lan", INTRO)),
                ErrorCode.ONLY_READER_CAN_REQUEST);
    }

    @Test
    void secondPendingRequestIsRejectedBeforeInsert() {
        when(mapper.hasPending(USER)).thenReturn(true);

        assertCode(() -> service.submit(USER, new CreateAuthorRequestRequest("Mộc Lan", INTRO)),
                ErrorCode.REQUEST_ALREADY_PENDING);
        verify(mapper, never()).insert(any());
    }

    @Test
    void penNameOfAnExistingAuthorIsRejected() {
        when(mapper.penNameTaken("Mộc Lan")).thenReturn(true);

        assertCode(() -> service.submit(USER, new CreateAuthorRequestRequest("Mộc Lan", INTRO)), ErrorCode.PEN_NAME_TAKEN);
        verify(mapper, never()).insert(any());
    }

    @Test
    void raceOnThePendingIndexBecomesAlreadyPending() {
        doThrow(new DuplicateKeyException("dup", new SQLException(
                "Cannot insert duplicate key row in object 'dbo.AuthorRequest' with unique index 'UX_AuthorRequest_Pending'.")))
                .when(mapper).insert(any());

        assertCode(() -> service.submit(USER, new CreateAuthorRequestRequest("Mộc Lan", INTRO)),
                ErrorCode.REQUEST_ALREADY_PENDING);
    }

    @Test
    void otherDuplicateKeysAreRethrown() {
        DuplicateKeyException other = new DuplicateKeyException("dup", new SQLException("PK_Something"));
        doThrow(other).when(mapper).insert(any());

        assertThatThrownBy(() -> service.submit(USER, new CreateAuthorRequestRequest("Mộc Lan", INTRO))).isSameAs(other);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "' a '   | proposedPenName",
            "Mộc Lan | introduction"})
    void lengthsAreCheckedAfterTrimming(String penName, String field) {
        String intro = "introduction".equals(field) ? "  quá ngắn          " : INTRO;

        assertThatThrownBy(() -> service.submit(USER, new CreateAuthorRequestRequest(penName, intro)))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
                    assertThat((List<?>) ex.details()).singleElement()
                            .extracting(d -> ((ApiError.FieldError) d).field()).isEqualTo(field);
                });
        verify(authMapper, never()).findState(anyInt());
    }

    /* ---------- cancel ---------- */

    @Test
    void cancelPendingRequest() {
        when(mapper.cancel(77, USER)).thenReturn(1);
        when(mapper.findOwned(77, USER)).thenReturn(stored(77, "CANCELLED"));

        assertThat(service.cancel(USER, 77).status()).isEqualTo("CANCELLED");
    }

    @Test
    void cancelOfUnknownOrForeignRequestIsNotFound() {
        when(mapper.cancel(78, USER)).thenReturn(0);
        when(mapper.findOwned(78, USER)).thenReturn(null);

        assertCode(() -> service.cancel(USER, 78), ErrorCode.AUTHOR_REQUEST_NOT_FOUND);
    }

    @Test
    void cancelOfDecidedRequestIsAlreadyProcessed() {
        when(mapper.cancel(77, USER)).thenReturn(0);
        when(mapper.findOwned(77, USER)).thenReturn(stored(77, "APPROVED"));

        assertCode(() -> service.cancel(USER, 77), ErrorCode.ALREADY_PROCESSED);
    }

    @Test
    void roleIsReadFromTheDatabaseNotTheSession() {
        service.submit(USER, new CreateAuthorRequestRequest("\tMộc Lan\n", INTRO));

        verify(authMapper).findState(USER);
        verify(mapper).penNameTaken("Mộc Lan");
    }
}
