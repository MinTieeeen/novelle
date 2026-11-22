package com.novelle.infrastructure.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * Opens and refreshes the login session (Spring Session in Redis). Used by the auth controller after
 * AuthService has checked the password, since there is no Spring Security login filter.
 */
@Component
public class SessionAuthenticator {

    private final SecurityContextRepository securityContextRepository;

    public SessionAuthenticator(SecurityContextRepository securityContextRepository) {
        this.securityContextRepository = securityContextRepository;
    }

    /** Stores {@code user} in the session; an existing session gets a new id (session fixation). */
    public void signIn(SessionUser user, HttpServletRequest request, HttpServletResponse response) {
        rotateSessionId(request);
        save(user, request, response);
    }

    /** Replaces the principal of the current session, e.g. after the user's role changed. */
    public void save(SessionUser user, HttpServletRequest request, HttpServletResponse response) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(user.toAuthentication());
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);
    }

    /** New session id, same session data (after login and password change). */
    public void rotateSessionId(HttpServletRequest request) {
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }
    }
}
