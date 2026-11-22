package com.novelle.service;

import java.util.ArrayList;
import java.util.List;

import com.novelle.dto.AuthorProfileStudioResponse;
import com.novelle.dto.UpdateAuthorProfileRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.mapper.StudioProfileMapper;
import com.novelle.mapper.StudioStoryMapper;
import com.novelle.model.StudioAuthorProfile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * My author profile (S10, S11, FR-M6-11). The pen name is shown on every story card and detail page, so changing it
 * evicts {@code cache:story:{id}} of all my stories and {@code cache:home}.
 */
@Service
public class AuthorProfileService {

    private final StudioProfileMapper profileMapper;
    private final StudioStoryMapper storyMapper;
    private final CacheService cache;

    public AuthorProfileService(StudioProfileMapper profileMapper, StudioStoryMapper storyMapper,
                                CacheService cache) {
        this.profileMapper = profileMapper;
        this.storyMapper = storyMapper;
        this.cache = cache;
    }

    @Transactional(readOnly = true)
    public AuthorProfileStudioResponse get(int authorId) {
        return AuthorProfileStudioResponse.from(require(authorId));
    }

    /** A null field is unchanged; an empty bio clears it. Same pen name as another author → 409 (UQ_Author_PenName). */
    @Transactional
    public AuthorProfileStudioResponse update(int authorId, UpdateAuthorProfileRequest req) {
        if (req.penName() == null && req.bio() == null) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "Send at least one field to change.");
        }
        StudioAuthorProfile before = require(authorId);
        String penName = req.penName() == null ? null : req.penName().strip();
        if (penName != null && profileMapper.penNameTakenByOther(penName, authorId)) {
            throw new ApiException(ErrorCode.PEN_NAME_TAKEN);
        }
        boolean bioSet = req.bio() != null;
        String bio = bioSet && !req.bio().isBlank() ? req.bio().strip() : null;
        try {
            profileMapper.updateProfile(authorId, penName, bioSet, bio);
        } catch (DuplicateKeyException ex) {
            // another author took the pen name between the check and the update
            throw new ApiException(ErrorCode.PEN_NAME_TAKEN);
        }
        if (penName != null && !penName.equals(before.getPenName())) {
            List<String> keys = new ArrayList<>();
            for (int storyId : storyMapper.storyIdsOfAuthor(authorId)) {
                keys.add(CacheKeys.story(storyId));
            }
            keys.add(CacheKeys.HOME);
            cache.evict(keys.toArray(String[]::new));
        }
        return AuthorProfileStudioResponse.from(require(authorId));
    }

    private StudioAuthorProfile require(int authorId) {
        StudioAuthorProfile profile = profileMapper.findProfile(authorId);
        if (profile == null) {
            throw new ApiException(ErrorCode.AUTHOR_NOT_FOUND);
        }
        return profile;
    }
}
