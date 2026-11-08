package com.novelle.mapper;

import com.novelle.model.ViewDeltaBatch;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Write-behind of view counters (G6). SQL: resources/mapper/ViewFlushMapper.xml. */
@Mapper
public interface ViewFlushMapper {

    /**
     * {@code sp_FlushViews}: adds the deltas to Story.ViewCount, Chapter.ViewCount and StoryViewDaily in one
     * transaction (rolled back and re-thrown on error). Ids that no longer exist are ignored by the procedure.
     */
    void flush(@Param("batch") ViewDeltaBatch batch);
}
