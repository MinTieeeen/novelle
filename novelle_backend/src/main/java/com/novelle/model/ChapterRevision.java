package com.novelle.model;

import java.time.LocalDateTime;

/**
 * One saved earlier version of a chapter (dbo.ChapterRevision, append-only, RB10), written by trg_Chapter_Revision.
 * {@code content} is null in the revision list.
 */
public class ChapterRevision {

    private int revisionNo;
    private String title;
    private String content;
    private int wordCount;
    private int editedById;
    private String editedByPenName;
    private LocalDateTime createdAt;

    public int getRevisionNo() { return revisionNo; }
    public void setRevisionNo(int revisionNo) { this.revisionNo = revisionNo; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public int getWordCount() { return wordCount; }
    public void setWordCount(int wordCount) { this.wordCount = wordCount; }

    public int getEditedById() { return editedById; }
    public void setEditedById(int editedById) { this.editedById = editedById; }

    public String getEditedByPenName() { return editedByPenName; }
    public void setEditedByPenName(String editedByPenName) { this.editedByPenName = editedByPenName; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
