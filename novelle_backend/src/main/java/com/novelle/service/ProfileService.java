package com.novelle.service;

import com.novelle.dto.ChangePasswordRequest;
import com.novelle.dto.MeResponse;
import com.novelle.dto.PublicProfileResponse;
import com.novelle.dto.UpdateProfileRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.UserMapper;
import com.novelle.model.AppUser;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The user's own profile (/api/me) and public profiles (/api/users/{username}). */
@Service
public class ProfileService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public ProfileService(UserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public MeResponse getMe(int userId) {
        return MeResponse.from(findMe(userId));
    }

    /** Optimistic lock on User.RowVer: 0 rows updated means the profile changed since it was read. */
    @Transactional
    public MeResponse updateProfile(int userId, UpdateProfileRequest req) {
        String displayName = req.displayName() == null ? null : req.displayName().trim();
        boolean bioSet = req.bio() != null;
        String bio = bioSet && !req.bio().isBlank() ? req.bio().trim() : null;

        int updated = userMapper.updateProfile(userId, displayName, bioSet, bio, req.rowVersion());
        if (updated == 0) {
            throw new ApiException(ErrorCode.STALE_DATA);
        }
        return MeResponse.from(findMe(userId));
    }

    @Transactional
    public void changePassword(int userId, ChangePasswordRequest req) {
        PasswordRules.checkLength("newPassword", req.newPassword());
        String hash = userMapper.findPasswordHash(userId);
        if (hash == null) {
            throw new ApiException(ErrorCode.USER_NOT_FOUND);
        }
        if (!passwordEncoder.matches(req.currentPassword(), hash)) {
            throw new ApiException(ErrorCode.WRONG_PASSWORD);
        }
        userMapper.updatePasswordHash(userId, passwordEncoder.encode(req.newPassword()));
    }

    @Transactional(readOnly = true)
    public PublicProfileResponse getPublicProfile(String username) {
        AppUser user = userMapper.findPublicByUsername(username);
        if (user == null) {
            throw new ApiException(ErrorCode.USER_NOT_FOUND);
        }
        return PublicProfileResponse.from(user);
    }

    private AppUser findMe(int userId) {
        AppUser user = userMapper.findMe(userId);
        if (user == null) {
            throw new ApiException(ErrorCode.USER_NOT_FOUND);
        }
        return user;
    }
}
