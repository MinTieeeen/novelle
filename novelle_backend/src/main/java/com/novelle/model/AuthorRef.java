package com.novelle.model;

/** Author shown on a story; {@code isVerified} is only selected for the story detail. */
public class AuthorRef {

    private int authorId;
    private String penName;
    private boolean isVerified;

    public int getAuthorId() { return authorId; }
    public void setAuthorId(int authorId) { this.authorId = authorId; }

    public String getPenName() { return penName; }
    public void setPenName(String penName) { this.penName = penName; }

    public boolean isVerified() { return isVerified; }
    public void setIsVerified(boolean isVerified) { this.isVerified = isVerified; }
}
