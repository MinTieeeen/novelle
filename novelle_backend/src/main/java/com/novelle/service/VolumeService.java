package com.novelle.service;

import java.util.List;

import com.novelle.dto.VolumeResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.mapper.VolumeMapper;
import com.novelle.model.StudioVolume;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Volumes of my stories (V1–V4, FR-M6-21..23). VolumeNo = MAX + 1 under a key-range lock (D7). A volume can only be
 * deleted when no chapter row points at it, deleted chapters included (FK_Chapter_Volume).
 */
@Service
public class VolumeService {

    private final VolumeMapper volumeMapper;
    private final StudioOwnership ownership;
    private final CacheService cache;

    public VolumeService(VolumeMapper volumeMapper, StudioOwnership ownership, CacheService cache) {
        this.volumeMapper = volumeMapper;
        this.ownership = ownership;
        this.cache = cache;
    }

    @Transactional(readOnly = true)
    public List<VolumeResponse> list(int authorId, int storyId) {
        ownership.story(storyId, authorId);
        return volumeMapper.listByStory(storyId).stream().map(VolumeResponse::from).toList();
    }

    @Transactional
    public VolumeResponse create(int authorId, int storyId, String title) {
        ownership.story(storyId, authorId);
        StudioVolume volume = new StudioVolume();
        volume.setStoryId(storyId);
        volume.setTitle(title.strip());
        volumeMapper.insert(volume);
        return VolumeResponse.from(ownership.volume(volume.getVolumeId(), authorId));
    }

    /** The public table of contents shows volume titles, so the story cache is evicted. */
    @Transactional
    public VolumeResponse rename(int authorId, int volumeId, String title) {
        StudioVolume volume = ownership.volume(volumeId, authorId);
        volumeMapper.rename(volumeId, title.strip());
        cache.evict(CacheKeys.story(volume.getStoryId()));
        return VolumeResponse.from(ownership.volume(volumeId, authorId));
    }

    /** An empty volume is never shown publicly (the table of contents joins published chapters): no eviction. */
    @Transactional
    public void delete(int authorId, int volumeId) {
        ownership.volume(volumeId, authorId);
        if (volumeMapper.hasAnyChapter(volumeId)) {
            throw new ApiException(ErrorCode.VOLUME_NOT_EMPTY);
        }
        volumeMapper.delete(volumeId);
    }
}
