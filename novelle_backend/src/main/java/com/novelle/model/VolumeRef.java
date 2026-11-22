package com.novelle.model;

/** Volume a chapter belongs to, shown in the reader header. */
public class VolumeRef {

    private int volumeId;
    private int volumeNo;
    private String title;

    public int getVolumeId() { return volumeId; }
    public void setVolumeId(int volumeId) { this.volumeId = volumeId; }

    public int getVolumeNo() { return volumeNo; }
    public void setVolumeNo(int volumeNo) { this.volumeNo = volumeNo; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
}
