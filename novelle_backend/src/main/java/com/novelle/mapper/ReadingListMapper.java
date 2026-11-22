package com.novelle.mapper;

import java.util.List;

import com.novelle.model.ListItemKey;
import com.novelle.model.ReadingList;
import com.novelle.model.ReadingListEntry;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Reading lists and their stories (F5). {@code ReadingList.ItemCount} is kept by the service in the same
 * transaction as the item insert / delete. SQL: resources/mapper/ReadingListMapper.xml.
 */
@Mapper
public interface ReadingListMapper {

    /* ---------- lists ---------- */

    /**
     * The list when it belongs to the user, read WITH (UPDLOCK): every write on a list starts here, so writes on
     * the same list run one after another until commit (docs/module-library.md D5). Null when not the owner's.
     */
    ReadingList lockOwned(@Param("listId") int listId, @Param("userId") int userId);

    /** The list with its owner when it is public or {@code viewerId} owns it; {@code viewerId} null = anonymous. */
    ReadingList findVisible(@Param("listId") int listId, @Param("viewerId") Integer viewerId);

    List<ReadingList> listMine(@Param("userId") int userId);

    boolean existsActiveUser(@Param("username") String username);

    /** Public lists of an ACTIVE user, most recently updated first. */
    List<ReadingList> listPublicByUsername(@Param("username") String username);

    int countMine(@Param("userId") int userId);

    /** Sets {@code list.listId}; UQ_ReadingList_User_Name rejects a duplicate name. */
    int insert(ReadingList list);

    /** {@code name} / {@code isPublic} null = unchanged; {@code descriptionSet} writes {@code description} (may be null). */
    int update(@Param("listId") int listId, @Param("name") String name,
               @Param("descriptionSet") boolean descriptionSet, @Param("description") String description,
               @Param("isPublic") Boolean isPublic);

    int delete(@Param("listId") int listId, @Param("userId") int userId);

    /* ---------- items ---------- */

    int deleteItems(@Param("listId") int listId);

    /** Appends the story with OrderNo = MAX + 1; the PK (ListId, StoryId) rejects a duplicate. */
    int insertItem(@Param("listId") int listId, @Param("storyId") int storyId, @Param("note") String note);

    int deleteItem(@Param("listId") int listId, @Param("storyId") int storyId);

    /** ItemCount += delta and UpdatedAt = now. */
    int adjustItemCount(@Param("listId") int listId, @Param("delta") int delta);

    int touch(@Param("listId") int listId);

    /** One public story of the list with the list's columns, or null. */
    ReadingListEntry findEntry(@Param("listId") int listId, @Param("storyId") int storyId);

    /** Public stories of the list in order (D3). */
    List<ReadingListEntry> pageEntries(@Param("listId") int listId,
                                       @Param("offset") int offset, @Param("size") int size);

    long countEntries(@Param("listId") int listId);

    /** Every row of the list, public or not, in the current order. */
    List<ListItemKey> itemKeys(@Param("listId") int listId);

    /** Sets OrderNo = position + 1 for each story of {@code storyIds} (which must list every row of the list). */
    int reorder(@Param("listId") int listId, @Param("storyIds") List<Integer> storyIds);
}
