package com.novelle.dto;

import java.time.Instant;

import com.novelle.model.StudioVolume;

/** A volume of one of my stories (V1–V3); {@code chapterCount} = chapters of the volume that are not deleted. */
public record VolumeResponse(int volumeId, int volumeNo, String title, int chapterCount, Instant createdAt) {

    public static VolumeResponse from(StudioVolume v) {
        return new VolumeResponse(v.getVolumeId(), v.getVolumeNo(), v.getTitle(), v.getChapterCount(),
                Times.utc(v.getCreatedAt()));
    }
}
