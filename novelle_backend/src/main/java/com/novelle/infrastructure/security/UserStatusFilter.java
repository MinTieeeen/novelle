package com.novelle.infrastructure.security;

import java.io.IOException;
import java.util.Map;

import com.novelle.exception.ApiError;
import com.novelle.exception.ApiErrorWriter;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.AuthMapper;
import com.novelle.model.UserState;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Re-reads Role and Status of the logged-in user on every request (one primary-key seek):
 * <ul>
 *   <li>user deleted or BANNED: the session is destroyed and the request ends with 403 ACCOUNT_BANNED (RB12);</li>
 *   <li>role changed (READER to AUTHOR after an approved request): the session principal is updated at once.</li>
 * </ul>
 * Created in SecurityConfig (not a @Component), so it runs only inside the security chain.
 */
public class UserStatusFilter extends OncePerRequestFilter {

    private final AuthMapper authMapper;
    private final SessionAuthenticator sessionAuthenticator;
    private final ApiErrorWriter errorWriter;

    public UserStatusFilter(AuthMapper authMapper, SessionAuthenticator sessionAuthenticator,
            ApiErrorWriter errorWriter) {
        this.authMapper = authMapper;
        this.sessionAuthenticator = sessionAuthenticator;
        this.errorWriter = errorWriter;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof SessionUser user) {
            UserState state = authMapper.findState(user.userId());

            if (state == null || state.isBanned()) {
                HttpSession session = request.getSession(false);
                if (session != null) {
                    session.invalidate();
                }
                SecurityContextHolder.clearContext();
                Object details = state != null && state.getBanReason() != null
                        ? Map.of("banReason", state.getBanReason()) : null;
                errorWriter.write(response, ApiError.of(ErrorCode.ACCOUNT_BANNED,
                        ErrorCode.ACCOUNT_BANNED.defaultMessage(), details));
                return;
            }
            if (!state.getRole().equals(user.role())) {
                sessionAuthenticator.save(user.withRole(state.getRole()), request, response);
            }
        }
        chain.doFilter(request, response);
    }
}
