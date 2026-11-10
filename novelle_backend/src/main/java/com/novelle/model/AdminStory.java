package com.novelle.model;

/** A story of any author as an administrator sees it (C1–C3): the studio card plus its author and hide reason. */
public class AdminStory extends StudioStoryCard {

    private String hiddenReason;
    private AuthorRef author;

    public String getHiddenReason() { return hiddenReason; }
    public void setHiddenReason(String hiddenReason) { this.hiddenReason = hiddenReason; }

    public AuthorRef getAuthor() { return author; }
    public void setAuthor(AuthorRef author) { this.author = author; }
}
