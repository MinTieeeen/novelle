package com.novelle.infrastructure.security;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/**
 * Principal stored in the Redis session after login. It is kept small (no hash, no profile data):
 * UserStatusFilter re-reads Role and Status from SQL Server on every request, so {@code role} here is
 * only the value from the last check.
 *
 * @param role READER, AUTHOR or ADMIN (column User.Role)
 */
public record SessionUser(int userId, String username, String role) implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    /** Authenticated token with the single authority ROLE_{role}, used by the URL rules in SecurityConfig. */
    public Authentication toAuthentication() {
        return UsernamePasswordAuthenticationToken.authenticated(
                this, null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    public SessionUser withRole(String newRole) {
        return new SessionUser(userId, username, newRole);
    }
}
