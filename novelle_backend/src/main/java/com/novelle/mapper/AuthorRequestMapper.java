package com.novelle.mapper;

import java.util.List;

import com.novelle.model.AuthorRequest;
import com.novelle.model.AuthorRequestAdminRow;
import com.novelle.model.AuthorRequestDetail;
import com.novelle.model.StatusCount;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Author requests (F7) and their review (F11). SQL: resources/mapper/AuthorRequestMapper.xml. */
@Mapper
public interface AuthorRequestMapper {

    /* ---------- applicant ---------- */

    /** Inserts a PENDING request (column default) and sets {@code request.requestId}. */
    int insert(AuthorRequest request);

    /** All requests of the user, newest first. */
    List<AuthorRequest> findMine(@Param("userId") int userId);

    /** The request when it belongs to the user, otherwise null. */
    AuthorRequest findOwned(@Param("requestId") int requestId, @Param("userId") int userId);

    boolean hasPending(@Param("userId") int userId);

    /** True when an author already uses this pen name (column collation, like UQ_Author_PenName). */
    boolean penNameTaken(@Param("penName") String penName);

    /** PENDING → CANCELLED for the owner; 0 rows when not theirs or no longer pending. */
    int cancel(@Param("requestId") int requestId, @Param("userId") int userId);

    /* ---------- admin ---------- */

    /** Status of any request, or null when it does not exist (pre-check before the procedures). */
    String findStatus(@Param("requestId") int requestId);

    /** Review queue; {@code status} null = every status. */
    List<AuthorRequestAdminRow> adminPage(@Param("status") String status,
                                          @Param("offset") int offset, @Param("size") int size);

    long adminCount(@Param("status") String status);

    AuthorRequestDetail adminDetail(@Param("requestId") int requestId);

    /** The applicant's <b>other</b> requests grouped by status (statuses with no row are absent). */
    List<StatusCount> countOtherByStatus(@Param("requestId") int requestId);

    /** {@code sp_ApproveAuthorRequest}: THROW 50001–50004 on failure (mapped in GlobalExceptionHandler). */
    void approve(@Param("requestId") int requestId, @Param("adminId") int adminId);

    /** {@code sp_RejectAuthorRequest}: THROW 50001, 50002, 50004 on failure. */
    void reject(@Param("requestId") int requestId, @Param("adminId") int adminId, @Param("note") String note);
}
