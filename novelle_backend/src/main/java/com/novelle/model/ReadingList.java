package com.novelle.model;

import java.time.LocalDateTime;

/** One row of {@code dbo.ReadingList}; {@code owner} is filled only by the queries that join the user. */
public class ReadingList {

    private int listId;
    private int userId;
    private String name;
    private String description;
    private boolean isPublic;
    private int itemCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private UserRef owner;

    public int getListId() { return listId; }
    public void setListId(int listId) { this.listId = listId; }

    public int getUserId() { return userId; }
    public void setUserId(int userId) { this.userId = userId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public boolean isPublic() { return isPublic; }
    /** Property {@code isPublic} for MyBatis ({@code #{isPublic}}); {@link #isPublic()} alone would expose "public". */
    public boolean getIsPublic() { return isPublic; }
    public void setIsPublic(boolean isPublic) { this.isPublic = isPublic; }

    public int getItemCount() { return itemCount; }
    public void setItemCount(int itemCount) { this.itemCount = itemCount; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public UserRef getOwner() { return owner; }
    public void setOwner(UserRef owner) { this.owner = owner; }
}
