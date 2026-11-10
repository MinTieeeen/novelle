package com.novelle.exception;

import org.springframework.http.HttpStatus;

/**
 * Machine-readable error codes returned in {@link ApiError#code()}. Each code fixes its HTTP status, so a
 * service only picks the code. Feature-specific codes are added here next to the generic ones.
 */
public enum ErrorCode {

    // generic request errors
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Request validation failed."),
    MALFORMED_REQUEST(HttpStatus.BAD_REQUEST, "Request is missing or malformed."),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED, "Login is required."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "You are not allowed to do this."),
    CSRF_INVALID(HttpStatus.FORBIDDEN, "CSRF token is missing or invalid."),
    NOT_FOUND(HttpStatus.NOT_FOUND, "Resource not found."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "HTTP method not allowed."),
    NOT_ACCEPTABLE(HttpStatus.NOT_ACCEPTABLE, "Response format not acceptable."),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Content type not supported."),
    PAYLOAD_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "Request is too large."),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "Too many requests, try again later."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected server error."),

    // data conflicts (constraints, optimistic locking, stored procedure errors 50001/50003/50007)
    CONFLICT(HttpStatus.CONFLICT, "The request conflicts with the current data."),
    STALE_DATA(HttpStatus.CONFLICT, "The data was changed by someone else; reload and try again."),
    ALREADY_PROCESSED(HttpStatus.CONFLICT, "This item was already processed."),
    PEN_NAME_TAKEN(HttpStatus.CONFLICT, "Pen name is already in use."),

    // accounts
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "Wrong username, email or password."),
    ACCOUNT_BANNED(HttpStatus.FORBIDDEN, "This account is banned."),
    USERNAME_TAKEN(HttpStatus.CONFLICT, "Username is already in use."),
    EMAIL_TAKEN(HttpStatus.CONFLICT, "Email is already in use."),
    WRONG_PASSWORD(HttpStatus.BAD_REQUEST, "Current password is wrong."),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "User not found."),

    // catalog (public reading side)
    STORY_NOT_FOUND(HttpStatus.NOT_FOUND, "Story not found."),
    AUTHOR_NOT_FOUND(HttpStatus.NOT_FOUND, "Author not found."),

    // reading (chapters, reading progress)
    CHAPTER_NOT_FOUND(HttpStatus.NOT_FOUND, "Chapter not found."),
    CHAPTER_NOT_IN_STORY(HttpStatus.BAD_REQUEST, "The chapter does not belong to this story."),

    // library (follows, reading lists) and ratings
    CANNOT_FOLLOW_SELF(HttpStatus.BAD_REQUEST, "You cannot follow yourself."),
    INVALID_ITEM_ORDER(HttpStatus.BAD_REQUEST, "The new order must list every story of the reading list exactly once."),
    CANNOT_RATE_OWN_STORY(HttpStatus.FORBIDDEN, "Authors cannot rate their own stories."),
    ADMIN_CANNOT_RATE(HttpStatus.FORBIDDEN, "Administrators cannot rate stories."),
    READING_LIST_NOT_FOUND(HttpStatus.NOT_FOUND, "Reading list not found."),
    STORY_NOT_IN_LIST(HttpStatus.NOT_FOUND, "The story is not in this reading list."),
    READING_LIST_NAME_TAKEN(HttpStatus.CONFLICT, "You already have a reading list with this name."),
    READING_LIST_LIMIT(HttpStatus.CONFLICT, "Reading list limit reached."),
    STORY_ALREADY_IN_LIST(HttpStatus.CONFLICT, "The story is already in this reading list."),

    // author requests
    ONLY_READER_CAN_REQUEST(HttpStatus.FORBIDDEN, "Only readers can request to become an author."),
    AUTHOR_REQUEST_NOT_FOUND(HttpStatus.NOT_FOUND, "Author request not found."),
    REQUEST_ALREADY_PENDING(HttpStatus.CONFLICT, "You already have a pending author request."),
    REVIEW_IN_PROGRESS(HttpStatus.CONFLICT, "Another administrator is reviewing this request; try again shortly."),

    // studio (author side: stories, volumes, chapters, revisions)
    VOLUME_NOT_IN_STORY(HttpStatus.BAD_REQUEST, "The volume does not belong to this story."),
    VOLUME_NOT_FOUND(HttpStatus.NOT_FOUND, "Volume not found."),
    REVISION_NOT_FOUND(HttpStatus.NOT_FOUND, "Revision not found."),
    STORY_HIDDEN(HttpStatus.CONFLICT, "The story was hidden by an administrator; its status cannot be changed."),
    STORY_HAS_NO_CHAPTER(HttpStatus.CONFLICT, "Publish at least one chapter before publishing the story."),
    CHAPTER_EMPTY(HttpStatus.CONFLICT, "The chapter has no content yet."),
    CHAPTER_ALREADY_PUBLISHED(HttpStatus.CONFLICT, "The chapter is already published."),
    VOLUME_NOT_EMPTY(HttpStatus.CONFLICT, "The volume still has chapters."),

    // administration (users, content, catalog)
    CANNOT_BAN_ADMIN(HttpStatus.FORBIDDEN, "Administrator accounts cannot be banned."),
    GENRE_NOT_FOUND(HttpStatus.NOT_FOUND, "Genre not found."),
    TAG_NOT_FOUND(HttpStatus.NOT_FOUND, "Tag not found."),
    GENRE_NAME_TAKEN(HttpStatus.CONFLICT, "A genre with this name already exists."),
    TAG_NAME_TAKEN(HttpStatus.CONFLICT, "A tag with this name already exists."),
    GENRE_IN_USE(HttpStatus.CONFLICT, "The genre is still used by stories.");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus status() {
        return status;
    }

    public String defaultMessage() {
        return defaultMessage;
    }

    /** Generic code for a status produced by Spring MVC itself (unknown route, wrong method, …). */
    public static ErrorCode forStatus(int status) {
        return switch (status) {
            case 400 -> MALFORMED_REQUEST;
            case 401 -> UNAUTHENTICATED;
            case 403 -> FORBIDDEN;
            case 404 -> NOT_FOUND;
            case 405 -> METHOD_NOT_ALLOWED;
            case 406 -> NOT_ACCEPTABLE;
            case 409 -> CONFLICT;
            case 413 -> PAYLOAD_TOO_LARGE;
            case 415 -> UNSUPPORTED_MEDIA_TYPE;
            case 429 -> RATE_LIMITED;
            default -> INTERNAL_ERROR;
        };
    }
}
