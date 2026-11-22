package com.novelle.dto;

import com.novelle.model.UserRef;

/** A user shown next to something they did: {@code { userId, username, avatarUrl? }}. */
public record UserRefResponse(int userId, String username, String avatarUrl) {

    /** Null in, null out (an outer-joined user that does not exist). */
    public static UserRefResponse from(UserRef u) {
        return u == null ? null : new UserRefResponse(u.getUserId(), u.getUsername(), u.getAvatarUrl());
    }
}
