package com.novelle.service;

import java.util.List;

import com.novelle.dto.HistoryItemResponse;
import com.novelle.dto.PageResponse;
import com.novelle.mapper.ReadingHistoryMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** My reading history (F5, H1–H2). The position itself is written by M3 (ReadingProgressService, ChapterReadService). */
@Service
public class LibraryService {

    private final ReadingHistoryMapper readingHistoryMapper;

    public LibraryService(ReadingHistoryMapper readingHistoryMapper) {
        this.readingHistoryMapper = readingHistoryMapper;
    }

    /** Public stories only (docs/module-library.md D3), most recently read first. */
    @Transactional(readOnly = true)
    public PageResponse<HistoryItemResponse> history(int userId, Integer page, Integer size) {
        PageQuery q = PageQuery.of(page, size);
        long total = readingHistoryMapper.countHistory(userId);
        List<HistoryItemResponse> items = total == 0 ? List.of()
                : readingHistoryMapper.pageHistory(userId, q.offset(), q.size()).stream()
                        .map(HistoryItemResponse::from).toList();
        return PageResponse.of(items, q.page(), q.size(), total);
    }

    /** Idempotent, also for a story that is no longer public (D1, D2). */
    @Transactional
    public void deleteHistory(int userId, int storyId) {
        readingHistoryMapper.deleteHistory(userId, storyId);
    }
}
