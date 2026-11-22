package com.novelle.service;

import com.novelle.dto.AuthorProfileResponse;
import com.novelle.dto.PageResponse;
import com.novelle.dto.StoryCardResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.AuthorMapper;
import com.novelle.model.AuthorProfile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Public author pages (F3). A banned author's page stays visible (decision D3); statistics count public
 * stories only (decision D4). Not cached: one indexed aggregate per request.
 */
@Service
public class AuthorService {

    private final AuthorMapper authorMapper;
    private final StorySearchService storySearchService;

    public AuthorService(AuthorMapper authorMapper, StorySearchService storySearchService) {
        this.authorMapper = authorMapper;
        this.storySearchService = storySearchService;
    }

    @Transactional(readOnly = true)
    public AuthorProfileResponse getProfile(int authorId) {
        AuthorProfile profile = authorMapper.findPublicProfile(authorId);
        if (profile == null) {
            throw new ApiException(ErrorCode.AUTHOR_NOT_FOUND);
        }
        return AuthorProfileResponse.from(profile);
    }

    @Transactional(readOnly = true)
    public PageResponse<StoryCardResponse> getStories(int authorId, String sort, Integer page, Integer size) {
        if (!authorMapper.existsAuthor(authorId)) {
            throw new ApiException(ErrorCode.AUTHOR_NOT_FOUND);
        }
        return storySearchService.listByAuthor(authorId, sort, page, size);
    }
}
