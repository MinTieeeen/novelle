package com.novelle.service;

import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.StudioChapterMapper;
import com.novelle.mapper.StudioStoryMapper;
import com.novelle.mapper.VolumeMapper;
import com.novelle.model.StudioChapter;
import com.novelle.model.StudioStory;
import com.novelle.model.StudioVolume;
import org.springframework.stereotype.Component;

/**
 * Ownership checks of the studio (RB1, RB2, docs/module-studio.md section 2): a story, volume or chapter that does
 * not exist, is deleted or belongs to another author is "not found", so the API never reveals that it exists.
 */
@Component
public class StudioOwnership {

    private final StudioStoryMapper storyMapper;
    private final VolumeMapper volumeMapper;
    private final StudioChapterMapper chapterMapper;

    public StudioOwnership(StudioStoryMapper storyMapper, VolumeMapper volumeMapper,
                           StudioChapterMapper chapterMapper) {
        this.storyMapper = storyMapper;
        this.volumeMapper = volumeMapper;
        this.chapterMapper = chapterMapper;
    }

    public StudioStory story(int storyId, int authorId) {
        StudioStory story = storyMapper.findOwned(storyId, authorId);
        if (story == null) {
            throw new ApiException(ErrorCode.STORY_NOT_FOUND);
        }
        return story;
    }

    public StudioVolume volume(int volumeId, int authorId) {
        StudioVolume volume = volumeMapper.findOwned(volumeId, authorId);
        if (volume == null) {
            throw new ApiException(ErrorCode.VOLUME_NOT_FOUND);
        }
        return volume;
    }

    /** {@code withContent} = also read the NVARCHAR(MAX) body. */
    public StudioChapter chapter(long chapterId, int authorId, boolean withContent) {
        StudioChapter chapter = chapterMapper.findOwned(chapterId, authorId, withContent);
        if (chapter == null) {
            throw new ApiException(ErrorCode.CHAPTER_NOT_FOUND);
        }
        return chapter;
    }

    /** RB7: a chapter may only point at a volume of its own story; null (no volume) is always allowed. */
    public void requireVolumeInStory(Integer volumeId, int storyId) {
        if (volumeId != null && !volumeMapper.isInStory(volumeId, storyId)) {
            throw new ApiException(ErrorCode.VOLUME_NOT_IN_STORY);
        }
    }
}
