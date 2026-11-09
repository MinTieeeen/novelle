package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.util.List;

import com.novelle.config.LibraryProperties;
import com.novelle.dto.AddListItemRequest;
import com.novelle.dto.CreateReadingListRequest;
import com.novelle.dto.UpdateReadingListRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.ReadingHistoryMapper;
import com.novelle.mapper.ReadingListMapper;
import com.novelle.model.ListItemKey;
import com.novelle.model.ReadingList;
import com.novelle.model.ReadingListEntry;
import com.novelle.model.UserRef;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

class ReadingListServiceTest {

    private static final int USER = 120;
    private static final int LIST = 51;
    private static final int STORY = 3;

    private ReadingListMapper mapper;
    private ReadingHistoryMapper historyMapper;
    private ReadingListService service;

    @BeforeEach
    void setUp() {
        mapper = mock(ReadingListMapper.class);
        historyMapper = mock(ReadingHistoryMapper.class);
        service = new ReadingListService(mapper, historyMapper, new LibraryProperties(2, 3));
        when(mapper.lockOwned(LIST, USER)).thenReturn(list(LIST, 1));
        when(historyMapper.existsPublicStory(STORY)).thenReturn(true);
        ReadingListEntry entry = new ReadingListEntry();
        entry.setStoryId(STORY);
        entry.setOrderNo(2);
        when(mapper.findEntry(LIST, STORY)).thenReturn(entry);
    }

    private static ReadingList list(int id, int itemCount) {
        ReadingList l = new ReadingList();
        l.setListId(id);
        l.setUserId(USER);
        l.setName("Hè");
        l.setItemCount(itemCount);
        UserRef owner = new UserRef();
        owner.setUserId(USER);
        owner.setUsername("reader_120");
        l.setOwner(owner);
        return l;
    }

    private static ListItemKey key(int storyId, int orderNo, boolean isPublic) {
        ListItemKey k = new ListItemKey();
        k.setStoryId(storyId);
        k.setOrderNo(orderNo);
        k.setIsPublic(isPublic);
        return k;
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    /* ---------- lists ---------- */

    @Test
    void createTrimsAndDefaultsToPrivate() {
        doAnswer(inv -> {
            inv.<ReadingList>getArgument(0).setListId(LIST);
            return 1;
        }).when(mapper).insert(any());

        service.create(USER, new CreateReadingListRequest("  Hè  ", "   ", null));

        verify(mapper).insert(org.mockito.ArgumentMatchers.argThat(l ->
                l.getName().equals("Hè") && l.getDescription() == null && !l.isPublic() && l.getUserId() == USER));
    }

    @Test
    void createBeyondTheListLimitIsRejected() {
        when(mapper.countMine(USER)).thenReturn(2);

        assertCode(() -> service.create(USER, new CreateReadingListRequest("Hè", null, true)), ErrorCode.READING_LIST_LIMIT);
        verify(mapper, never()).insert(any());
    }

    @Test
    void duplicateNameIsNameTaken() {
        doThrow(new DuplicateKeyException("dup", new SQLException(
                "Violation of UNIQUE KEY constraint 'UQ_ReadingList_User_Name'."))).when(mapper).insert(any());

        assertCode(() -> service.create(USER, new CreateReadingListRequest("Hè", null, false)),
                ErrorCode.READING_LIST_NAME_TAKEN);
    }

    @Test
    void writesOnAListThatIsNotMineAreNotFound() {
        when(mapper.lockOwned(99, USER)).thenReturn(null);

        assertCode(() -> service.update(USER, 99, new UpdateReadingListRequest("x", null, null)),
                ErrorCode.READING_LIST_NOT_FOUND);
        assertCode(() -> service.delete(USER, 99), ErrorCode.READING_LIST_NOT_FOUND);
        assertCode(() -> service.addItem(USER, 99, new AddListItemRequest(STORY, null)), ErrorCode.READING_LIST_NOT_FOUND);
        assertCode(() -> service.removeItem(USER, 99, STORY), ErrorCode.READING_LIST_NOT_FOUND);
        assertCode(() -> service.reorder(USER, 99, List.of()), ErrorCode.READING_LIST_NOT_FOUND);
        verify(mapper, never()).deleteItems(anyInt());
        verify(mapper, never()).insertItem(anyInt(), anyInt(), any());
    }

    @Test
    void patchNullKeepsAndBlankDescriptionClears() {
        service.update(USER, LIST, new UpdateReadingListRequest(null, "  ", null));
        verify(mapper).update(org.mockito.ArgumentMatchers.eq(LIST), isNull(), org.mockito.ArgumentMatchers.eq(true),
                isNull(), isNull());

        service.update(USER, LIST, new UpdateReadingListRequest(" Mới ", null, false));
        verify(mapper).update(LIST, "Mới", false, null, false);
    }

    @Test
    void deleteRemovesItemsFirst() {
        service.delete(USER, LIST);

        var order = org.mockito.Mockito.inOrder(mapper);
        order.verify(mapper).lockOwned(LIST, USER);
        order.verify(mapper).deleteItems(LIST);
        order.verify(mapper).delete(LIST, USER);
    }

    @Test
    void detailOfAnInvisibleListIsNotFound() {
        when(mapper.findVisible(LIST, null)).thenReturn(null);

        assertCode(() -> service.detail(null, LIST, null, null), ErrorCode.READING_LIST_NOT_FOUND);
    }

    @Test
    void ownerFlagFollowsTheViewer() {
        when(mapper.findVisible(LIST, USER)).thenReturn(list(LIST, 0));
        when(mapper.findVisible(LIST, null)).thenReturn(list(LIST, 0));

        assertThat(service.detail(USER, LIST, null, null).isOwner()).isTrue();
        assertThat(service.detail(null, LIST, null, null).isOwner()).isFalse();
    }

    @Test
    void publicListsOfAnUnknownUserAreUserNotFound() {
        when(mapper.existsActiveUser("ghost")).thenReturn(false);

        assertCode(() -> service.publicOf("ghost"), ErrorCode.USER_NOT_FOUND);
    }

    /* ---------- items ---------- */

    @Test
    void addItemAppendsAndIncrementsTheCount() {
        var res = service.addItem(USER, LIST, new AddListItemRequest(STORY, "  đọc trước "));

        assertThat(res.orderNo()).isEqualTo(2);
        verify(mapper).insertItem(LIST, STORY, "đọc trước");
        verify(mapper).adjustItemCount(LIST, 1);
    }

    @Test
    void fullListIsRejectedBeforeAnyRead() {
        when(mapper.lockOwned(LIST, USER)).thenReturn(list(LIST, 3));

        assertCode(() -> service.addItem(USER, LIST, new AddListItemRequest(STORY, null)), ErrorCode.READING_LIST_LIMIT);
        verify(historyMapper, never()).existsPublicStory(anyInt());
    }

    @Test
    void addingAHiddenStoryIsStoryNotFound() {
        when(historyMapper.existsPublicStory(STORY)).thenReturn(false);

        assertCode(() -> service.addItem(USER, LIST, new AddListItemRequest(STORY, null)), ErrorCode.STORY_NOT_FOUND);
        verify(mapper, never()).insertItem(anyInt(), anyInt(), any());
    }

    @Test
    void addingTwiceIsAlreadyInList() {
        doThrow(new DuplicateKeyException("PK_ReadingListItem")).when(mapper).insertItem(LIST, STORY, null);

        assertCode(() -> service.addItem(USER, LIST, new AddListItemRequest(STORY, null)), ErrorCode.STORY_ALREADY_IN_LIST);
        verify(mapper, never()).adjustItemCount(anyInt(), anyInt());
    }

    @Test
    void removeItemDecrementsTheCount() {
        when(mapper.deleteItem(LIST, STORY)).thenReturn(1);

        service.removeItem(USER, LIST, STORY);

        verify(mapper).adjustItemCount(LIST, -1);
    }

    @Test
    void removingAStoryNotInTheListIsNotInList() {
        when(mapper.deleteItem(LIST, STORY)).thenReturn(0);

        assertCode(() -> service.removeItem(USER, LIST, STORY), ErrorCode.STORY_NOT_IN_LIST);
        verify(mapper, never()).adjustItemCount(anyInt(), anyInt());
    }

    /* ---------- reorder ---------- */

    @Test
    void reorderPutsHiddenStoriesLastInTheirOldOrder() {
        when(mapper.itemKeys(LIST)).thenReturn(List.of(key(7, 1, true), key(8, 2, false), key(3, 3, true),
                key(9, 4, false), key(12, 5, true)));

        service.reorder(USER, LIST, List.of(12, 7, 3));

        verify(mapper).reorder(LIST, List.of(12, 7, 3, 8, 9));
        verify(mapper).touch(LIST);
    }

    @Test
    void reorderRejectsMissingExtraOrDuplicateIds() {
        when(mapper.itemKeys(LIST)).thenReturn(List.of(key(7, 1, true), key(8, 2, false), key(3, 3, true)));

        assertCode(() -> service.reorder(USER, LIST, List.of(7)), ErrorCode.INVALID_ITEM_ORDER);          // missing 3
        assertCode(() -> service.reorder(USER, LIST, List.of(7, 3, 5)), ErrorCode.INVALID_ITEM_ORDER);    // 5 not in list
        assertCode(() -> service.reorder(USER, LIST, List.of(7, 3, 8)), ErrorCode.INVALID_ITEM_ORDER);    // 8 is hidden
        assertCode(() -> service.reorder(USER, LIST, List.of(7, 3, 3)), ErrorCode.INVALID_ITEM_ORDER);    // duplicate
        verify(mapper, never()).reorder(anyInt(), anyList());
    }

    @Test
    void reorderOfAnEmptyListOnlyTouchesIt() {
        when(mapper.itemKeys(LIST)).thenReturn(List.of());

        service.reorder(USER, LIST, List.of());

        verify(mapper, never()).reorder(anyInt(), anyList());
        verify(mapper).touch(LIST);
        verify(mapper, never()).update(anyInt(), any(), anyBoolean(), any(), any());
    }
}
