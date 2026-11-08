package com.novelle.model;

/** Author profile columns joined onto a user row; null when the user is not an AUTHOR. */
public class AuthorSummary {

    private int authorId;
    private String penName;
    private String bio;
    private boolean isVerified;
    private int followerCount;

    public int getAuthorId() { return authorId; }
    public void setAuthorId(int authorId) { this.authorId = authorId; }

    public String getPenName() { return penName; }
    public void setPenName(String penName) { this.penName = penName; }

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }

    public boolean isVerified() { return isVerified; }
    public void setIsVerified(boolean isVerified) { this.isVerified = isVerified; }

    public int getFollowerCount() { return followerCount; }
    public void setFollowerCount(int followerCount) { this.followerCount = followerCount; }
}
