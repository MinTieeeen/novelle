package com.novelle.service;

import java.util.Locale;
import java.util.Map;

import com.novelle.dto.LoginRequest;
import com.novelle.dto.RegisterRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.security.SessionUser;
import com.novelle.mapper.AuthMapper;
import com.novelle.model.NewUser;
import com.novelle.model.UserCredential;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registration and login (G2, RB12). Returns the {@link SessionUser} to store in the session;
 * the controller opens the session.
 */
@Service
public class AuthService {

    private static final String ROLE_READER = "READER";

    private final AuthMapper authMapper;
    private final PasswordEncoder passwordEncoder;
    /** Compared against when the login is unknown, so both failure cases take the same BCrypt time. */
    private final String dummyHash;

    public AuthService(AuthMapper authMapper, PasswordEncoder passwordEncoder) {
        this.authMapper = authMapper;
        this.passwordEncoder = passwordEncoder;
        this.dummyHash = passwordEncoder.encode("novelle-timing-dummy");
    }

    /** New accounts are always READER / ACTIVE (G2). */
    @Transactional
    public SessionUser register(RegisterRequest req) {
        PasswordRules.checkLength("password", req.password());
        String username = req.username();
        String email = req.email().trim().toLowerCase(Locale.ROOT);

        if (authMapper.existsUsername(username)) {
            throw new ApiException(ErrorCode.USERNAME_TAKEN);
        }
        if (authMapper.existsEmail(email)) {
            throw new ApiException(ErrorCode.EMAIL_TAKEN);
        }

        NewUser user = new NewUser(username, email, passwordEncoder.encode(req.password()), req.displayName().trim());
        try {
            authMapper.insertUser(user);
        } catch (DuplicateKeyException ex) {
            // two registrations raced past the checks above; the UNIQUE constraint decides
            String message = String.valueOf(ex.getMostSpecificCause().getMessage());
            throw new ApiException(message.contains("UQ_User_Email") ? ErrorCode.EMAIL_TAKEN : ErrorCode.USERNAME_TAKEN);
        }
        return new SessionUser(user.getUserId(), username, ROLE_READER);
    }

    /** The password is checked before the status, so a ban is only revealed to someone who knows the password. */
    @Transactional
    public SessionUser login(LoginRequest req) {
        String login = req.login().trim();
        if (login.contains("@")) {
            login = login.toLowerCase(Locale.ROOT);
        }
        UserCredential cred = authMapper.findCredential(login);

        if (cred == null) {
            passwordEncoder.matches(req.password(), dummyHash);
            throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
        }
        if (!passwordEncoder.matches(req.password(), cred.getPasswordHash())) {
            throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
        }
        if ("BANNED".equals(cred.getStatus())) {
            throw banned(cred.getBanReason());
        }

        authMapper.updateLastLogin(cred.getUserId());
        return new SessionUser(cred.getUserId(), cred.getUsername(), cred.getRole());
    }

    private static ApiException banned(String reason) {
        return new ApiException(ErrorCode.ACCOUNT_BANNED, ErrorCode.ACCOUNT_BANNED.defaultMessage(),
                reason == null ? null : Map.of("banReason", reason));
    }
}
