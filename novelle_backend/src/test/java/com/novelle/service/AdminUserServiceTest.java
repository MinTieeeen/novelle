package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import com.novelle.dto.CreateAdminRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.views.ViewProperties;
import com.novelle.mapper.AdminUserMapper;
import com.novelle.mapper.AuthMapper;
import com.novelle.mapper.StudioStoryMapper;
import com.novelle.model.AdminUser;
import com.novelle.model.AdminUserCriteria;
import com.novelle.model.NewUser;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;

class AdminUserServiceTest {

    private static final int ADMIN = 1;
    private static final int USER = 171;

    private AdminUserMapper mapper;
    private AuthMapper authMapper;
    private StudioStoryMapper storyMapper;
    private CacheService cache;
    private AdminUserService service;

    @BeforeEach
    void setUp() {
        mapper = mock(AdminUserMapper.class);
        authMapper = mock(AuthMapper.class);
        storyMapper = mock(StudioStoryMapper.class);
        cache = mock(CacheService.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        when(encoder.encode(anyString())).thenReturn("$2a$hash");
        ViewProperties views = new ViewProperties("views:", Duration.ofMinutes(30), ZoneId.of("Asia/Ho_Chi_Minh"),
                Duration.ofSeconds(60), 1000, 20);
        service = new AdminUserService(mapper, authMapper, storyMapper, encoder, cache, views);
        when(mapper.countRequestsByStatus(anyInt())).thenReturn(List.of());
    }

    private static AdminUser user(String role, String status) {
        AdminUser u = new AdminUser();
        u.setUserId(USER);
        u.setRole(role);
        u.setStatus(status);
        return u;
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    /* ---------- ban / unban (D1, D7) ---------- */

    @Test
    void banTrimsTheReasonAndReturnsTheBannedUser() {
        when(mapper.ban(USER, ADMIN, "Spam")).thenReturn(1);
        when(mapper.findUser(USER)).thenReturn(user("READER", "BANNED"));

        assertThat(service.ban(ADMIN, USER, "  Spam ").status()).isEqualTo("BANNED");
    }

    @Test
    void banningAnAdminIs403() {
        when(mapper.ban(anyInt(), anyInt(), anyString())).thenReturn(0);
        when(mapper.findUser(USER)).thenReturn(user("ADMIN", "ACTIVE"));
        assertCode(() -> service.ban(ADMIN, USER, "x"), ErrorCode.CANNOT_BAN_ADMIN);
    }

    @Test
    void banningTwiceIs409AndUnknownIs404() {
        when(mapper.ban(anyInt(), anyInt(), anyString())).thenReturn(0);
        when(mapper.findUser(USER)).thenReturn(user("AUTHOR", "BANNED"));
        assertCode(() -> service.ban(ADMIN, USER, "x"), ErrorCode.ALREADY_PROCESSED);

        when(mapper.findUser(USER)).thenReturn(null);
        assertCode(() -> service.ban(ADMIN, USER, "x"), ErrorCode.USER_NOT_FOUND);
    }

    @Test
    void unbanOfAnActiveUserIs409() {
        when(mapper.unban(USER)).thenReturn(0);
        when(mapper.findUser(USER)).thenReturn(user("READER", "ACTIVE"));
        assertCode(() -> service.unban(USER), ErrorCode.ALREADY_PROCESSED);
    }

    /* ---------- create admin (D8) ---------- */

    private static CreateAdminRequest admin() {
        return new CreateAdminRequest("new_admin", " New@Example.COM ", "Passw0rd!", " Quản trị ");
    }

    @Test
    void createAdminNormalisesAndInserts() {
        when(mapper.insertAdmin(any())).thenAnswer(inv -> {
            inv.<NewUser>getArgument(0).setUserId(900);
            return 1;
        });
        when(mapper.findUser(900)).thenReturn(user("ADMIN", "ACTIVE"));

        service.createAdmin(admin());

        ArgumentCaptor<NewUser> captor = ArgumentCaptor.forClass(NewUser.class);
        verify(mapper).insertAdmin(captor.capture());
        assertThat(captor.getValue().getEmail()).isEqualTo("new@example.com");
        assertThat(captor.getValue().getDisplayName()).isEqualTo("Quản trị");
        assertThat(captor.getValue().getPasswordHash()).isEqualTo("$2a$hash");
    }

    @Test
    void takenUsernameOrEmailIs409WithoutInsert() {
        when(authMapper.existsUsername("new_admin")).thenReturn(true);
        assertCode(() -> service.createAdmin(admin()), ErrorCode.USERNAME_TAKEN);
        when(authMapper.existsUsername("new_admin")).thenReturn(false);
        when(authMapper.existsEmail("new@example.com")).thenReturn(true);
        assertCode(() -> service.createAdmin(admin()), ErrorCode.EMAIL_TAKEN);
        verify(mapper, never()).insertAdmin(any());
    }

    @Test
    void concurrentDuplicateIsMappedByConstraintName() {
        when(mapper.insertAdmin(any())).thenThrow(new DuplicateKeyException("Violation of UNIQUE KEY constraint 'UQ_User_Email'"));
        assertCode(() -> service.createAdmin(admin()), ErrorCode.EMAIL_TAKEN);
    }

    @Test
    void passwordOver72BytesIsRejected() {
        CreateAdminRequest req = new CreateAdminRequest("a_b", "a@b.c", "ặ".repeat(30), "x");
        assertCode(() -> service.createAdmin(req), ErrorCode.VALIDATION_FAILED);
        verifyNoInteractions(authMapper);
    }

    /* ---------- verify ---------- */

    @Test
    void verifyEvictsOnlyWhenTheValueChanges() {
        when(mapper.findVerified(17)).thenReturn(false);
        when(storyMapper.storyIdsOfAuthor(17)).thenReturn(List.of(3, 4));

        service.setVerified(17, true);
        verify(mapper).setVerified(17, true);
        verify(cache).evict("cache:story:3", "cache:story:4", "cache:home");

        when(mapper.findVerified(17)).thenReturn(true);
        service.setVerified(17, true);
        verify(mapper, times(1)).setVerified(anyInt(), anyBoolean());
    }

    @Test
    void verifyOfANonAuthorIs404() {
        when(mapper.findVerified(17)).thenReturn(null);
        assertCode(() -> service.setVerified(17, true), ErrorCode.AUTHOR_NOT_FOUND);
    }

    /* ---------- list filters ---------- */

    @Test
    void filtersAreParsedAndDatesAreVietnamDays() {
        service.page("author", "banned", "a_b%", LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 10), null, null);

        ArgumentCaptor<AdminUserCriteria> c = ArgumentCaptor.forClass(AdminUserCriteria.class);
        verify(mapper).countUsers(c.capture());
        assertThat(c.getValue().role()).isEqualTo("AUTHOR");
        assertThat(c.getValue().status()).isEqualTo("BANNED");
        assertThat(c.getValue().likePattern()).isEqualTo("%a[_]b[%]%");
        // 2026-11-01 00:00 in Vietnam (UTC+7) is 2026-10-31 17:00 UTC; "to" is inclusive
        assertThat(c.getValue().createdFrom()).isEqualTo(LocalDateTime.of(2026, 10, 31, 17, 0));
        assertThat(c.getValue().createdTo()).isEqualTo(LocalDateTime.of(2026, 11, 10, 17, 0));
        verify(mapper, never()).pageUsers(any(), anyInt(), anyInt());   // count 0 → no page query
    }

    @Test
    void badFiltersAre400() {
        assertCode(() -> service.page("OWNER", null, null, null, null, null, null), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.page(null, "DELETED", null, null, null, null, null), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.page(null, null, "a", null, null, null, null), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.page(null, null, null, LocalDate.of(2026, 2, 2), LocalDate.of(2026, 2, 1), null, null),
                ErrorCode.VALIDATION_FAILED);
    }
}
