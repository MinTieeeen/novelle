package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;

import com.novelle.dto.ChangePasswordRequest;
import com.novelle.dto.UpdateProfileRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.mybatis.RowVersion;
import com.novelle.mapper.UserMapper;
import com.novelle.model.AppUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

class ProfileServiceTest {

    private static final RowVersion RV = new RowVersion(new byte[] {0, 0, 0, 0, 0, 0, 0, 1});

    private UserMapper userMapper;
    private PasswordEncoder encoder;
    private ProfileService service;

    @BeforeEach
    void setUp() {
        userMapper = mock(UserMapper.class);
        encoder = mock(PasswordEncoder.class);
        service = new ProfileService(userMapper, encoder);
    }

    @Test
    void getMeMapsTheRow() {
        when(userMapper.findMe(5)).thenReturn(user(5));
        assertThat(service.getMe(5).username()).isEqualTo("u5");
    }

    @Test
    void getMeOfMissingUserIs404() {
        assertCode(() -> service.getMe(5), ErrorCode.USER_NOT_FOUND);
    }

    @Test
    void updateTrimsFieldsAndReturnsFreshProfile() {
        when(userMapper.updateProfile(5, "Tên", true, "Giới thiệu", RV)).thenReturn(1);
        when(userMapper.findMe(5)).thenReturn(user(5));

        service.updateProfile(5, new UpdateProfileRequest("  Tên ", "  Giới thiệu  ", RV));

        verify(userMapper).updateProfile(5, "Tên", true, "Giới thiệu", RV);
    }

    @Test
    void nullFieldsAreLeftUnchanged() {
        when(userMapper.updateProfile(anyInt(), any(), anyBoolean(), any(), any())).thenReturn(1);
        when(userMapper.findMe(5)).thenReturn(user(5));

        service.updateProfile(5, new UpdateProfileRequest(null, null, RV));

        verify(userMapper).updateProfile(eq(5), isNull(), eq(false), isNull(), eq(RV));
    }

    @Test
    void blankBioClearsIt() {
        when(userMapper.updateProfile(anyInt(), any(), anyBoolean(), any(), any())).thenReturn(1);
        when(userMapper.findMe(5)).thenReturn(user(5));

        service.updateProfile(5, new UpdateProfileRequest(null, "   ", RV));

        verify(userMapper).updateProfile(eq(5), isNull(), eq(true), isNull(), eq(RV));
    }

    @Test
    void staleRowVersionIsConflict() {
        when(userMapper.updateProfile(anyInt(), any(), anyBoolean(), any(), any())).thenReturn(0);
        assertCode(() -> service.updateProfile(5, new UpdateProfileRequest("X", null, RV)), ErrorCode.STALE_DATA);
        verify(userMapper, never()).findMe(anyInt());
    }

    @Test
    void changePasswordStoresNewHash() {
        when(userMapper.findPasswordHash(5)).thenReturn("old-hash");
        when(encoder.matches("current", "old-hash")).thenReturn(true);
        when(encoder.encode("newPassw0rd")).thenReturn("new-hash");

        service.changePassword(5, new ChangePasswordRequest("current", "newPassw0rd"));

        verify(userMapper).updatePasswordHash(5, "new-hash");
    }

    @Test
    void wrongCurrentPasswordIsRejected() {
        when(userMapper.findPasswordHash(5)).thenReturn("old-hash");
        assertCode(() -> service.changePassword(5, new ChangePasswordRequest("bad", "newPassw0rd")),
                ErrorCode.WRONG_PASSWORD);
        verify(userMapper, never()).updatePasswordHash(anyInt(), anyString());
    }

    @Test
    void changePasswordOfMissingUserIs404() {
        assertCode(() -> service.changePassword(5, new ChangePasswordRequest("x", "newPassw0rd")),
                ErrorCode.USER_NOT_FOUND);
    }

    @Test
    void newPasswordOver72BytesIsRejectedBeforeAnyQuery() {
        assertCode(() -> service.changePassword(5, new ChangePasswordRequest("x", "ệ".repeat(25))),
                ErrorCode.VALIDATION_FAILED);
        verify(userMapper, never()).findPasswordHash(anyInt());
    }

    @Test
    void publicProfileOfUnknownOrBannedUserIs404() {
        assertCode(() -> service.getPublicProfile("ghost"), ErrorCode.USER_NOT_FOUND);
    }

    @Test
    void publicProfileHidesPrivateFields() {
        when(userMapper.findPublicByUsername("u5")).thenReturn(user(5));
        assertThat(service.getPublicProfile("u5").username()).isEqualTo("u5");
    }

    private static AppUser user(int id) {
        AppUser u = new AppUser();
        u.setUserId(id);
        u.setUsername("u" + id);
        u.setEmail("u" + id + "@x.vn");
        u.setDisplayName("U" + id);
        u.setRole("READER");
        u.setStatus("ACTIVE");
        u.setCreatedAt(LocalDateTime.of(2026, 1, 1, 0, 0));
        u.setRowVersion(RV);
        return u;
    }

    private static void assertCode(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class,
                ex -> assertThat(ex.code()).isEqualTo(code));
    }
}
