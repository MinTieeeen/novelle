package com.novelle.model;

/**
 * The light part of a published chapter, read from SQL on every GET /api/chapters/{id} (docs/module-reading.md
 * D3): the row exists only when the chapter and its story are public. Holds the story, the volume, the
 * neighbouring public chapters and the view count; the heavy part is {@link ChapterContent} (cached).
 */
public class ChapterNav {

    private long chapterId;
    private int chapterNo;
    private long viewCount;
    private int storyId;
    private String storySlug;
    private String storyTitle;
    private AuthorRef author;
    private VolumeRef volume;
    private Long prevChapterId;
    private Long nextChapterId;

    public long getChapterId() { return chapterId; }
    public void setChapterId(long chapterId) { this.chapterId = chapterId; }

    public int getChapterNo() { return chapterNo; }
    public void setChapterNo(int chapterNo) { this.chapterNo = chapterNo; }

    public long getViewCount() { return viewCount; }
    public void setViewCount(long viewCount) { this.viewCount = viewCount; }

    public int getStoryId() { return storyId; }
    public void setStoryId(int storyId) { this.storyId = storyId; }

    public String getStorySlug() { return storySlug; }
    public void setStorySlug(String storySlug) { this.storySlug = storySlug; }

    public String getStoryTitle() { return storyTitle; }
    public void setStoryTitle(String storyTitle) { this.storyTitle = storyTitle; }

    public AuthorRef getAuthor() { return author; }
    public void setAuthor(AuthorRef author) { this.author = author; }

    /** Null when the chapter is not in a volume. */
    public VolumeRef getVolume() { return volume; }
    public void setVolume(VolumeRef volume) { this.volume = volume; }

    /** Null at the first public chapter. */
    public Long getPrevChapterId() { return prevChapterId; }
    public void setPrevChapterId(Long prevChapterId) { this.prevChapterId = prevChapterId; }

    /** Null at the last public chapter. */
    public Long getNextChapterId() { return nextChapterId; }
    public void setNextChapterId(Long nextChapterId) { this.nextChapterId = nextChapterId; }
}
