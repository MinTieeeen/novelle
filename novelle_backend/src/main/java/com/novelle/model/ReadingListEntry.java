package com.novelle.model;

import java.time.LocalDateTime;

/** A public story in a reading list: the story card plus the list's own columns. */
public class ReadingListEntry extends StoryCard {

    private int orderNo;
    private String note;
    private LocalDateTime addedAt;

    public int getOrderNo() { return orderNo; }
    public void setOrderNo(int orderNo) { this.orderNo = orderNo; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public LocalDateTime getAddedAt() { return addedAt; }
    public void setAddedAt(LocalDateTime addedAt) { this.addedAt = addedAt; }
}
