package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;

import com.novelle.dto.LoginRequest;
import com.novelle.dto.RegisterRequest;
import com.novelle.exception.ApiError;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.security.SessionUser;
import com.novelle.mapper.AuthMapper;
import com.novelle.model.NewUser;
import com.novelle.model.UserCredential;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthServiceTest {

    private AuthMapper authMapper;
    private PasswordEncoder encoder;
    private AuthService service;

    @BeforeEach
    void setUp() {
        authMapper = mock(AuthMapper.class);
        encoder = mock(PasswordEncoder.class);
        when(encoder.encode(anyString())).thenAnswer(inv -> "hash(" + inv.getArgument(0) + ")");
        service = new AuthService(authMapper, encoder);
    }

    /* ---------- register ---------- */

    @Test
    void registerInsertsReaderWithNormalizedEmailAndHashedPassword() {
        doAnswer(inv -> {
            inv.<NewUser>getArgument(0).setUserId(42);
            return 1;
        }).when(authMapper).insertUser(any());

        SessionUser user = service.register(new RegisterRequest("tester", "  Tester@Example.COM ", "Passw0rd!", "  Tên  "));

        ArgumentCaptor<NewUser> row = ArgumentCaptor.forClass(NewUser.class);
        verify(authMapper).insertUser(row.capture());
        assertThat(row.getValue().getEmail()).isEqualTo("tester@example.com");
        assertThat(row.getValue().getDisplayName()).isEqualTo("Tên");
        assertThat(row.getValue().getPasswordHash()).isEqualTo("hash(Passw0rd!)");
        assertThat(user).isEqualTo(new SessionUser(42, "tester", "READER"));
    }

    @Test
    void registerRejectsTakenUsername() {
        when(authMapper.existsUsername("tester")).thenReturn(true);
        assertCode(() -> service.register(req("tester@x.vn")), ErrorCode.USERNAME_TAKEN);
        verify(authMapper, never()).insertUser(any());
    }

    @Test
    void registerRejectsTakenEmailComparedInLowerCase() {
        when(authMapper.existsEmail("tester@x.vn")).thenReturn(true);
        assertCode(() -> service.register(req("TESTER@X.VN")), ErrorCode.EMAIL_TAKEN);
    }

    @Test
    void registerRaceOnEmailConstraintBecomesEmailTaken() {
        when(authMapper.insertUser(any())).thenThrow(new DuplicateKeyException("dup",
                new SQLException("Violation of UNIQUE KEY constraint 'UQ_User_Email'.")));
        assertCode(() -> service.register(req("a@x.vn")), ErrorCode.EMAIL_TAKEN);
    }

    @Test
    void registerRaceOnUsernameConstraintBecomesUsernameTaken() {
        when(authMapper.insertUser(any())).thenThrow(new DuplicateKeyException("dup",
                new SQLException("Violation of UNIQUE KEY constraint 'UQ_User_Username'.")));
        assertCode(() -> service.register(req("a@x.vn")), ErrorCode.USERNAME_TAKEN);
    }

    @Test
    void registerRejectsPasswordLongerThan72Bytes() {
        String password = "ệ".repeat(30);                       // 30 chars, 90 bytes in UTF-8
        assertThatThrownBy(() -> service.register(new RegisterRequest("tester", "a@x.vn", password, "T")))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
                    assertThat(ex.details()).isEqualTo(List.of(
                            new ApiError.FieldError("password", "must be at most 72 bytes in UTF-8")));
                });
        verify(authMapper, never()).existsUsername(anyString());
    }

    /* ---------- login ---------- */

    @Test
    void loginByUsernameUpdatesLastLogin() {
        when(authMapper.findCredential("reader01")).thenReturn(cred(7, "reader01", "AUTHOR", "ACTIVE", null));
        when(encoder.matches("pw", "stored")).thenReturn(true);

        SessionUser user = service.login(new LoginRequest(" reader01 ", "pw"));

        assertThat(user).isEqualTo(new SessionUser(7, "reader01", "AUTHOR"));
        verify(authMapper).updateLastLogin(7);
    }

    @Test
    void loginByEmailIsCaseInsensitive() {
        when(authMapper.findCredential("reader01@x.vn")).thenReturn(cred(7, "reader01", "READER", "ACTIVE", null));
        when(encoder.matches("pw", "stored")).thenReturn(true);

        assertThat(service.login(new LoginRequest("Reader01@X.VN", "pw")).userId()).isEqualTo(7);
    }

    @Test
    void unknownLoginStillRunsBcryptAndFailsGenerically() {
        assertCode(() -> service.login(new LoginRequest("ghost", "pw")), ErrorCode.INVALID_CREDENTIALS);
        verify(encoder).matches("pw", "hash(novelle-timing-dummy)");
        verify(authMapper, never()).updateLastLogin(anyInt());
    }

    @Test
    void wrongPasswordFailsGenerically() {
        when(authMapper.findCredential("reader01")).thenReturn(cred(7, "reader01", "READER", "ACTIVE", null));
        assertCode(() -> service.login(new LoginRequest("reader01", "bad")), ErrorCode.INVALID_CREDENTIALS);
        verify(authMapper, never()).updateLastLogin(anyInt());
    }

    @Test
    void bannedUserWithWrongPasswordLearnsNothing() {
        when(authMapper.findCredential("bad")).thenReturn(cred(9, "bad", "READER", "BANNED", "Spam"));
        assertCode(() -> service.login(new LoginRequest("bad", "wrong")), ErrorCode.INVALID_CREDENTIALS);
    }

    @Test
    void bannedUserWithRightPasswordGetsReason() {
        when(authMapper.findCredential("bad")).thenReturn(cred(9, "bad", "READER", "BANNED", "Spam"));
        when(encoder.matches("pw", "stored")).thenReturn(true);

        assertThatThrownBy(() -> service.login(new LoginRequest("bad", "pw")))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.code()).isEqualTo(ErrorCode.ACCOUNT_BANNED);
                    assertThat(ex.details()).isEqualTo(Map.of("banReason", "Spam"));
                });
        verify(authMapper, never()).updateLastLogin(anyInt());
    }

    @Test
    void bannedUserWithoutReasonHasNoDetails() {
        when(authMapper.findCredential("bad")).thenReturn(cred(9, "bad", "READER", "BANNED", null));
        when(encoder.matches("pw", "stored")).thenReturn(true);

        assertThatThrownBy(() -> service.login(new LoginRequest("bad", "pw")))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.details()).isNull());
    }

    /* ---------- helpers ---------- */

    private static RegisterRequest req(String email) {
        return new RegisterRequest("tester", email, "Passw0rd!", "Tester");
    }

    private static UserCredential cred(int id, String username, String role, String status, String banReason) {
        UserCredential c = new UserCredential();
        c.setUserId(id);
        c.setUsername(username);
        c.setPasswordHash("stored");
        c.setRole(role);
        c.setStatus(status);
        c.setBanReason(banReason);
        return c;
    }

    private static void assertCode(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class,
                ex -> assertThat(ex.code()).isEqualTo(code));
    }
}
