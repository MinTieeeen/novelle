package com.novelle.mapper;

import java.util.List;

import com.novelle.model.StudioVolume;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Volumes of my stories (F9). SQL: resources/mapper/VolumeMapper.xml. */
@Mapper
public interface VolumeMapper {

    /** Volumes of the story in order, each with its chapters that are not deleted (aggregate). */
    List<StudioVolume> listByStory(@Param("storyId") int storyId);

    /** The volume when its story is mine and not deleted, otherwise null. */
    StudioVolume findOwned(@Param("volumeId") int volumeId, @Param("authorId") int authorId);

    /** True when the volume belongs to the story (RB7, checked before trg_Chapter_VolumeSameStory). */
    boolean isInStory(@Param("volumeId") int volumeId, @Param("storyId") int storyId);

    /**
     * Inserts with VolumeNo = MAX + 1 read WITH (UPDLOCK, HOLDLOCK) (docs/module-studio.md D7); sets
     * {@code volume.volumeId}. Only {@code storyId} and {@code title} are read from the argument.
     */
    int insert(StudioVolume volume);

    int rename(@Param("volumeId") int volumeId, @Param("title") String title);

    /** True when any chapter row points at the volume, deleted chapters included (the FK would refuse a delete). */
    boolean hasAnyChapter(@Param("volumeId") int volumeId);

    int delete(@Param("volumeId") int volumeId);
}
