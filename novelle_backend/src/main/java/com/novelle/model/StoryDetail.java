package com.novelle.model;

/**
 * Header of the story detail page: the card columns with the full description and the word count.
 * Genres, tags and the table of contents are read by separate statements (one query per list avoids a
 * cartesian product of genres × tags × chapters).
 */
public class StoryDetail extends StoryCard {

    private long wordCount;

    public long getWordCount() { return wordCount; }
    public void setWordCount(long wordCount) { this.wordCount = wordCount; }
}
