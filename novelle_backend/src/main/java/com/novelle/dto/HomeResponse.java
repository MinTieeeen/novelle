package com.novelle.dto;

import java.util.List;

/** GET /api/home: five blocks of public stories (cached as one entry, {@code cache:home}). */
public record HomeResponse(
        List<StoryCardResponse> latestUpdated,
        List<StoryCardResponse> newest,
        List<StoryCardResponse> topRated,
        List<StoryCardResponse> mostViewed,
        List<StoryCardResponse> completed) {
}
