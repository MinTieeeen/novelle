package com.novelle.model;

import java.util.ArrayList;
import java.util.List;

/** A volume with its published chapters, filled by a {@code <collection>} result map (Volume ⋈ Chapter). */
public class VolumeToc {

    private int volumeId;
    private int volumeNo;
    private String title;
    private List<ChapterToc> chapters = new ArrayList<>();

    public int getVolumeId() { return volumeId; }
    public void setVolumeId(int volumeId) { this.volumeId = volumeId; }

    public int getVolumeNo() { return volumeNo; }
    public void setVolumeNo(int volumeNo) { this.volumeNo = volumeNo; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public List<ChapterToc> getChapters() { return chapters; }
    public void setChapters(List<ChapterToc> chapters) { this.chapters = chapters; }
}
