package com.novelle.infrastructure.security;

import java.util.Optional;

import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/** Reads the logged-in {@link SessionUser} from the security context of the current request. */
@Component
public class CurrentUser {

    /** The logged-in user, or empty for an anonymous request. */
    public Optional<SessionUser> find() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof SessionUser user) {
            return Optional.of(user);
        }
        return Optional.empty();
    }

    /** The logged-in user; 401 when the request is anonymous. */
    public SessionUser require() {
        return find().orElseThrow(() -> new ApiException(ErrorCode.UNAUTHENTICATED));
    }

    public int requireId() {
        return require().userId();
    }
}
