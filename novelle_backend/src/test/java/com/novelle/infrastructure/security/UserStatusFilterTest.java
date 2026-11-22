package com.novelle.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.novelle.exception.ApiErrorWriter;
import com.novelle.mapper.AuthMapper;
import com.novelle.model.UserState;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContextHolder;

class UserStatusFilterTest {

    private AuthMapper authMapper;
    private SessionAuthenticator authenticator;
    private UserStatusFilter filter;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;
    private MockHttpSession session;
    private FilterChain chain;

    @BeforeEach
    void setUp() {
        authMapper = mock(AuthMapper.class);
        authenticator = mock(SessionAuthenticator.class);
        filter = new UserStatusFilter(authMapper, authenticator, new ApiErrorWriter(new ObjectMapper()));
        request = new MockHttpServletRequest("GET", "/api/me");
        session = new MockHttpSession();
        request.setSession(session);
        response = new MockHttpServletResponse();
        chain = mock(FilterChain.class);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void anonymousRequestPassesWithoutQuery() throws Exception {
        filter.doFilter(request, response, chain);
        verify(chain).doFilter(request, response);
        verifyNoInteractions(authMapper);
    }

    @Test
    void activeUserWithSameRolePasses() throws Exception {
        login(new SessionUser(1, "u", "READER"));
        when(authMapper.findState(1)).thenReturn(state("READER", "ACTIVE", null));

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        verify(authenticator, never()).save(any(), any(), any());
    }

    @Test
    void roleChangeIsWrittenBackToTheSession() throws Exception {
        login(new SessionUser(1, "u", "READER"));
        when(authMapper.findState(1)).thenReturn(state("AUTHOR", "ACTIVE", null));

        filter.doFilter(request, response, chain);

        verify(authenticator).save(new SessionUser(1, "u", "AUTHOR"), request, response);
        verify(chain).doFilter(request, response);
    }

    @Test
    void bannedUserIsLoggedOutWith403() throws Exception {
        login(new SessionUser(1, "u", "READER"));
        when(authMapper.findState(1)).thenReturn(state("READER", "BANNED", "Spam"));

        filter.doFilter(request, response, chain);

        verify(chain, never()).doFilter(any(), any());
        assertThat(session.isInvalid()).isTrue();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString())
                .contains("\"code\":\"ACCOUNT_BANNED\"")
                .contains("\"banReason\":\"Spam\"");
    }

    @Test
    void deletedUserIsLoggedOutWithoutDetails() throws Exception {
        login(new SessionUser(1, "u", "READER"));

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("ACCOUNT_BANNED").doesNotContain("banReason");
        assertThat(session.isInvalid()).isTrue();
    }

    private static void login(SessionUser user) {
        SecurityContextHolder.getContext().setAuthentication(user.toAuthentication());
    }

    private static UserState state(String role, String status, String reason) {
        UserState s = new UserState();
        s.setUserId(1);
        s.setRole(role);
        s.setStatus(status);
        s.setBanReason(reason);
        return s;
    }
}
