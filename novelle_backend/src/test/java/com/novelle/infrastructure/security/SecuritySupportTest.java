package com.novelle.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.novelle.exception.ApiErrorWriter;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.MissingCsrfTokenException;

/** SessionUser, CurrentUser, SessionAuthenticator and the JSON 401/403 handlers. */
class SecuritySupportTest {

    private final ApiErrorWriter writer = new ApiErrorWriter(new ObjectMapper());

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void sessionUserHasOneRoleAuthority() {
        SessionUser user = new SessionUser(1, "u", "AUTHOR");
        assertThat(user.toAuthentication().getAuthorities()).extracting(Object::toString).containsExactly("ROLE_AUTHOR");
        assertThat(user.toAuthentication().isAuthenticated()).isTrue();
        assertThat(user.withRole("ADMIN")).isEqualTo(new SessionUser(1, "u", "ADMIN"));
    }

    @Test
    void currentUserIsEmptyForAnonymous() {
        CurrentUser current = new CurrentUser();
        assertThat(current.find()).isEmpty();
        SecurityContextHolder.getContext().setAuthentication(new AnonymousAuthenticationToken(
                "k", "anonymousUser", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));
        assertThat(current.find()).isEmpty();
        assertThatThrownBy(current::require).isInstanceOfSatisfying(ApiException.class,
                ex -> assertThat(ex.code()).isEqualTo(ErrorCode.UNAUTHENTICATED));
    }

    @Test
    void currentUserReturnsSessionUser() {
        SecurityContextHolder.getContext().setAuthentication(new SessionUser(3, "u", "READER").toAuthentication());
        assertThat(new CurrentUser().requireId()).isEqualTo(3);
    }

    @Test
    void signInRotatesSessionIdAndSavesContext() {
        SecurityContextRepository repo = mock(SecurityContextRepository.class);
        SessionAuthenticator authenticator = new SessionAuthenticator(repo);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setSession(new MockHttpSession());
        String before = request.getSession().getId();
        MockHttpServletResponse response = new MockHttpServletResponse();

        authenticator.signIn(new SessionUser(3, "u", "READER"), request, response);

        assertThat(request.getSession().getId()).isNotEqualTo(before);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
                .isEqualTo(new SessionUser(3, "u", "READER"));
        verify(repo).saveContext(any(), eq(request), eq(response));
    }

    @Test
    void rotateWithoutSessionDoesNothing() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        new SessionAuthenticator(mock(SecurityContextRepository.class)).rotateSessionId(request);
        assertThat(request.getSession(false)).isNull();
    }

    @Test
    void entryPointWritesUnauthenticatedJson() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        new JsonAuthEntryPoint(writer).commence(new MockHttpServletRequest(), response, new BadCredentialsException("x"));
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getContentAsString()).contains("\"code\":\"UNAUTHENTICATED\"");
    }

    @Test
    void accessDeniedSeparatesCsrfFromRoleErrors() throws Exception {
        JsonAccessDeniedHandler handler = new JsonAccessDeniedHandler(writer);

        MockHttpServletResponse csrf = new MockHttpServletResponse();
        handler.handle(new MockHttpServletRequest(), csrf, new MissingCsrfTokenException(null));
        assertThat(csrf.getStatus()).isEqualTo(403);
        assertThat(csrf.getContentAsString()).contains("CSRF_INVALID");

        MockHttpServletResponse role = new MockHttpServletResponse();
        handler.handle(new MockHttpServletRequest(), role, new AccessDeniedException("no"));
        assertThat(role.getContentAsString()).contains("\"code\":\"FORBIDDEN\"");
    }
}
