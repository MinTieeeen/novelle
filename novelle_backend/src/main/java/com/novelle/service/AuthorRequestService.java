package com.novelle.service;

import java.util.List;

import com.novelle.dto.AuthorRequestResponse;
import com.novelle.dto.CreateAuthorRequestRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.AuthMapper;
import com.novelle.mapper.AuthorRequestMapper;
import com.novelle.model.AuthorRequest;
import com.novelle.model.UserState;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The applicant side of author requests (F7, RB14): submit, list my requests, cancel a pending one.
 * Reviewing is {@link AuthorRequestReviewService}.
 */
@Service
public class AuthorRequestService {

    static final int PEN_NAME_MIN = 2;
    static final int PEN_NAME_MAX = 100;
    static final int INTRODUCTION_MIN = 20;
    static final int INTRODUCTION_MAX = 2000;

    /** Filtered unique index: at most one PENDING request per user (RB14). */
    private static final String PENDING_INDEX = "UX_AuthorRequest_Pending";

    private final AuthorRequestMapper authorRequestMapper;
    private final AuthMapper authMapper;

    public AuthorRequestService(AuthorRequestMapper authorRequestMapper, AuthMapper authMapper) {
        this.authorRequestMapper = authorRequestMapper;
        this.authMapper = authMapper;
    }

    @Transactional(readOnly = true)
    public List<AuthorRequestResponse> mine(int userId) {
        return authorRequestMapper.findMine(userId).stream().map(AuthorRequestResponse::from).toList();
    }

    /**
     * Checks in this order, writing nothing on error: lengths after trimming → the user is an ACTIVE READER
     * (re-read from the database, not the session) → no pending request → pen name unused → INSERT.
     * Two submissions racing past the pending check are stopped by {@value #PENDING_INDEX}.
     */
    @Transactional
    public AuthorRequestResponse submit(int userId, CreateAuthorRequestRequest req) {
        String penName = req.proposedPenName().trim();
        String introduction = req.introduction().trim();
        requireLength("proposedPenName", penName, PEN_NAME_MIN, PEN_NAME_MAX);
        requireLength("introduction", introduction, INTRODUCTION_MIN, INTRODUCTION_MAX);

        UserState state = authMapper.findState(userId);
        if (state == null || !"READER".equals(state.getRole()) || !"ACTIVE".equals(state.getStatus())) {
            throw new ApiException(ErrorCode.ONLY_READER_CAN_REQUEST);
        }
        if (authorRequestMapper.hasPending(userId)) {
            throw new ApiException(ErrorCode.REQUEST_ALREADY_PENDING);
        }
        if (authorRequestMapper.penNameTaken(penName)) {
            throw new ApiException(ErrorCode.PEN_NAME_TAKEN);
        }

        AuthorRequest request = new AuthorRequest();
        request.setUserId(userId);
        request.setProposedPenName(penName);
        request.setIntroduction(introduction);
        try {
            authorRequestMapper.insert(request);
        } catch (DuplicateKeyException ex) {
            if (String.valueOf(ex.getMostSpecificCause().getMessage()).contains(PENDING_INDEX)) {
                throw new ApiException(ErrorCode.REQUEST_ALREADY_PENDING);
            }
            throw ex;
        }
        return AuthorRequestResponse.from(authorRequestMapper.findOwned(request.getRequestId(), userId));
    }

    /** PENDING → CANCELLED. Not mine or unknown → 404 (never reveal other users' requests); decided → 409. */
    @Transactional
    public AuthorRequestResponse cancel(int userId, int requestId) {
        int rows = authorRequestMapper.cancel(requestId, userId);
        AuthorRequest request = authorRequestMapper.findOwned(requestId, userId);
        if (request == null) {
            throw new ApiException(ErrorCode.AUTHOR_REQUEST_NOT_FOUND);
        }
        if (rows == 0) {
            throw new ApiException(ErrorCode.ALREADY_PROCESSED);
        }
        return AuthorRequestResponse.from(request);
    }

    private static void requireLength(String field, String value, int min, int max) {
        int length = value.codePointCount(0, value.length());
        if (length < min || length > max) {
            throw ApiException.invalidField(field, "length must be between " + min + " and " + max);
        }
    }
}
