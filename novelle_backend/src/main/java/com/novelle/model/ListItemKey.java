package com.novelle.model;

/** Every row of a reading list, public or not, in its current order (used to validate and apply a reorder). */
public class ListItemKey {

    private int storyId;
    private int orderNo;
    private boolean isPublic;

    public int getStoryId() { return storyId; }
    public void setStoryId(int storyId) { this.storyId = storyId; }

    public int getOrderNo() { return orderNo; }
    public void setOrderNo(int orderNo) { this.orderNo = orderNo; }

    public boolean isPublic() { return isPublic; }
    public void setIsPublic(boolean isPublic) { this.isPublic = isPublic; }
}
