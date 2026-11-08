package com.novelle.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.novelle.config.LibraryProperties;
import com.novelle.dto.AddListItemRequest;
import com.novelle.dto.CreateReadingListRequest;
import com.novelle.dto.PageResponse;
import com.novelle.dto.ReadingListDetailResponse;
import com.novelle.dto.ReadingListItemResponse;
import com.novelle.dto.ReadingListSummaryResponse;
import com.novelle.dto.UpdateReadingListRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.ReadingHistoryMapper;
import com.novelle.mapper.ReadingListMapper;
import com.novelle.model.ListItemKey;
import com.novelle.model.ReadingList;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reading lists (F5, docs/module-library.md T1–T9).
 * <ul>
 *   <li>Every write starts with {@link ReadingListMapper#lockOwned}: ownership check (404 when not mine, D4) and an
 *       UPDLOCK on the list row, so concurrent writes on one list run one after another (D5).</li>
 *   <li>{@code ItemCount} is changed here, in the same transaction as the item insert / delete.</li>
 *   <li>Limits: {@link LibraryProperties} (D6).</li>
 * </ul>
 */
@Service
public class ReadingListService {

    /** UNIQUE (UserId, Name). */
    private static final String NAME_CONSTRAINT = "UQ_ReadingList_User_Name";

    private final ReadingListMapper readingListMapper;
    private final ReadingHistoryMapper readingHistoryMapper;
    private final LibraryProperties limits;

    public ReadingListService(ReadingListMapper readingListMapper, ReadingHistoryMapper readingHistoryMapper,
                              LibraryProperties limits) {
        this.readingListMapper = readingListMapper;
        this.readingHistoryMapper = readingHistoryMapper;
        this.limits = limits;
    }

    /* ---------- reading ---------- */

    @Transactional(readOnly = true)
    public List<ReadingListSummaryResponse> mine(int userId) {
        return readingListMapper.listMine(userId).stream().map(ReadingListSummaryResponse::from).toList();
    }

    /** Public lists of an ACTIVE user (shown on the public profile). */
    @Transactional(readOnly = true)
    public List<ReadingListSummaryResponse> publicOf(String username) {
        if (!readingListMapper.existsActiveUser(username)) {
            throw new ApiException(ErrorCode.USER_NOT_FOUND);
        }
        return readingListMapper.listPublicByUsername(username).stream().map(ReadingListSummaryResponse::from).toList();
    }

    /** {@code viewerId} null = anonymous. A private list of someone else is "not found" (D4). */
    @Transactional(readOnly = true)
    public ReadingListDetailResponse detail(Integer viewerId, int listId, Integer page, Integer size) {
        PageQuery q = PageQuery.of(page, size);
        ReadingList list = readingListMapper.findVisible(listId, viewerId);
        if (list == null) {
            throw new ApiException(ErrorCode.READING_LIST_NOT_FOUND);
        }
        long total = readingListMapper.countEntries(listId);
        List<ReadingListItemResponse> items = total == 0 ? List.of()
                : readingListMapper.pageEntries(listId, q.offset(), q.size()).stream()
                        .map(ReadingListItemResponse::from).toList();
        boolean isOwner = viewerId != null && viewerId == list.getUserId();
        return ReadingListDetailResponse.from(list, isOwner, PageResponse.of(items, q.page(), q.size(), total));
    }

    /* ---------- lists ---------- */

    @Transactional
    public ReadingListSummaryResponse create(int userId, CreateReadingListRequest req) {
        if (readingListMapper.countMine(userId) >= limits.maxLists()) {
            throw new ApiException(ErrorCode.READING_LIST_LIMIT,
                    "You can have at most " + limits.maxLists() + " reading lists.");
        }
        ReadingList list = new ReadingList();
        list.setUserId(userId);
        list.setName(req.name().trim());
        list.setDescription(blankToNull(req.description()));
        list.setIsPublic(Boolean.TRUE.equals(req.isPublic()));
        try {
            readingListMapper.insert(list);
        } catch (DuplicateKeyException ex) {
            throw nameConflictOr(ex);
        }
        return ReadingListSummaryResponse.from(readingListMapper.lockOwned(list.getListId(), userId));
    }

    /** null = unchanged; a blank description clears it. */
    @Transactional
    public ReadingListSummaryResponse update(int userId, int listId, UpdateReadingListRequest req) {
        requireOwned(listId, userId);
        String name = req.name() == null ? null : req.name().trim();
        boolean descriptionSet = req.description() != null;
        try {
            readingListMapper.update(listId, name, descriptionSet, blankToNull(req.description()), req.isPublic());
        } catch (DuplicateKeyException ex) {
            throw nameConflictOr(ex);
        }
        return ReadingListSummaryResponse.from(readingListMapper.lockOwned(listId, userId));
    }

    @Transactional
    public void delete(int userId, int listId) {
        requireOwned(listId, userId);
        readingListMapper.deleteItems(listId);
        readingListMapper.delete(listId, userId);
    }

    /* ---------- items ---------- */

    /** Order of checks: list mine (404) → not full (409) → story public (404) → not already in it (409). */
    @Transactional
    public ReadingListItemResponse addItem(int userId, int listId, AddListItemRequest req) {
        ReadingList list = requireOwned(listId, userId);
        if (list.getItemCount() >= limits.maxItems()) {
            throw new ApiException(ErrorCode.READING_LIST_LIMIT,
                    "A reading list can hold at most " + limits.maxItems() + " stories.");
        }
        int storyId = req.storyId();
        if (!readingHistoryMapper.existsPublicStory(storyId)) {
            throw new ApiException(ErrorCode.STORY_NOT_FOUND);
        }
        try {
            readingListMapper.insertItem(listId, storyId, blankToNull(req.note()));
        } catch (DuplicateKeyException ex) {
            throw new ApiException(ErrorCode.STORY_ALREADY_IN_LIST);
        }
        readingListMapper.adjustItemCount(listId, 1);
        return ReadingListItemResponse.from(readingListMapper.findEntry(listId, storyId));
    }

    /** Also for a story that is no longer public (D2). */
    @Transactional
    public void removeItem(int userId, int listId, int storyId) {
        requireOwned(listId, userId);
        if (readingListMapper.deleteItem(listId, storyId) == 0) {
            throw new ApiException(ErrorCode.STORY_NOT_IN_LIST);
        }
        readingListMapper.adjustItemCount(listId, -1);
    }

    /**
     * {@code storyIds} must be exactly the public stories of the list, without duplicates (T8). Hidden stories keep
     * their relative order and go last; OrderNo becomes 1..n.
     */
    @Transactional
    public void reorder(int userId, int listId, List<Integer> storyIds) {
        requireOwned(listId, userId);
        List<ListItemKey> keys = readingListMapper.itemKeys(listId);

        Set<Integer> publicIds = new HashSet<>();
        List<Integer> hiddenInOrder = new ArrayList<>();
        for (ListItemKey k : keys) {
            if (k.isPublic()) {
                publicIds.add(k.getStoryId());
            } else {
                hiddenInOrder.add(k.getStoryId());
            }
        }
        Set<Integer> requested = new HashSet<>(storyIds);
        if (requested.size() != storyIds.size() || !requested.equals(publicIds)) {
            throw new ApiException(ErrorCode.INVALID_ITEM_ORDER);
        }

        List<Integer> finalOrder = new ArrayList<>(storyIds);
        finalOrder.addAll(hiddenInOrder);
        if (!finalOrder.isEmpty()) {
            readingListMapper.reorder(listId, finalOrder);
        }
        readingListMapper.touch(listId);
    }

    /* ---------- helpers ---------- */

    private ReadingList requireOwned(int listId, int userId) {
        ReadingList list = readingListMapper.lockOwned(listId, userId);
        if (list == null) {
            throw new ApiException(ErrorCode.READING_LIST_NOT_FOUND);
        }
        return list;
    }

    private static RuntimeException nameConflictOr(DuplicateKeyException ex) {
        return String.valueOf(ex.getMostSpecificCause().getMessage()).contains(NAME_CONSTRAINT)
                ? new ApiException(ErrorCode.READING_LIST_NAME_TAKEN) : ex;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
