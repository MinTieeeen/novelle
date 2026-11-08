package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;

import com.novelle.infrastructure.views.ViewCounterStore;
import com.novelle.infrastructure.views.ViewFlusher;
import com.novelle.infrastructure.views.ViewKeys;
import com.novelle.model.ViewDelta;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * View counting on Redis (D1, D4) and the write-behind flush through sp_FlushViews with a table-valued
 * parameter. The flush runs inside the test transaction (the procedure's own BEGIN/COMMIT only nest), so the
 * rollback removes every SQL change.
 */
class ViewCountingIntegrationTest extends ReadingIntegrationSupport {

    @Autowired private ViewFlusher flusher;
    @Autowired private ViewCounterStore store;

    private void readOk(Client client, long chapterId) throws Exception {
        read(client, chapterId).andExpect(status().isOk());
    }

    /** Vietnam day of the views, taken from the dirty member (the test does not compute "today" itself). */
    private LocalDate viewDay(long chapterId) {
        return dirtyMembers().stream()
                .filter(m -> m.startsWith("C:" + chapterId + ":"))
                .map(m -> ViewKeys.parseMember(m).orElseThrow().day())
                .findFirst().orElseThrow();
    }

    @Test
    void firstViewCountsChapterAndStory() throws Exception {
        Chap c = middleChapter();
        Client guest = newClient();

        readOk(guest, c.id());

        assertThat(counter('C', c.id())).isEqualTo(1);
        assertThat(counter('S', c.storyId())).isEqualTo(1);
        assertThat(dirtyMembers()).hasSize(2)
                .anyMatch(m -> m.startsWith("C:" + c.id() + ":"))
                .anyMatch(m -> m.startsWith("S:" + c.storyId() + ":"));
        Long seenTtl = redis.getExpire(VIEWS + "seen:" + c.id() + ":ip" + guest.ip);
        assertThat(seenTtl).isPositive().isLessThanOrEqualTo(1800L);
    }

    @Test
    void sameViewerCountsOnceInTheWindow() throws Exception {
        Chap c = middleChapter();
        Client guest = newClient();

        readOk(guest, c.id());
        readOk(guest, c.id());
        readOk(guest, c.id());

        assertThat(counter('C', c.id())).isEqualTo(1);
        assertThat(counter('S', c.storyId())).isEqualTo(1);
    }

    @Test
    void otherViewerCountsAgainAndStoryAddsUpOverChapters() throws Exception {
        Chap c = middleChapter();
        long next = chapterId(c.storyId(), c.no() + 1);

        readOk(newClient(), c.id());
        readOk(newClient(), c.id());
        Client third = newClient();
        readOk(third, next);

        assertThat(counter('C', c.id())).isEqualTo(2);
        assertThat(counter('C', next)).isEqualTo(1);
        assertThat(counter('S', c.storyId())).isEqualTo(3);
    }

    @Test
    void loggedInViewerIsCountedByUser() throws Exception {
        Chap c = middleChapter();
        Client reader = newClient();
        int userId = userId(registerReader(reader));

        readOk(reader, c.id());

        assertThat(redis.hasKey(VIEWS + "seen:" + c.id() + ":u" + userId)).isTrue();
        assertThat(redis.hasKey(VIEWS + "seen:" + c.id() + ":ip" + reader.ip)).isFalse();
    }

    @Test
    void flushAddsViewsToSqlAndClearsRedis() throws Exception {
        Chap c = middleChapter();
        long chapterBefore = count("SELECT ViewCount FROM dbo.Chapter WHERE ChapterId = ?", c.id());
        long storyBefore = count("SELECT ViewCount FROM dbo.Story WHERE StoryId = ?", c.storyId());
        readOk(newClient(), c.id());
        readOk(newClient(), c.id());
        LocalDate day = viewDay(c.id());
        long dailyBefore = count("SELECT COALESCE(SUM(Views), 0) FROM dbo.StoryViewDaily WHERE StoryId = ? AND ViewDate = ?",
                c.storyId(), day);

        int written = flusher.flush();

        assertThat(written).isEqualTo(2);
        assertThat(count("SELECT ViewCount FROM dbo.Chapter WHERE ChapterId = ?", c.id())).isEqualTo(chapterBefore + 2);
        assertThat(count("SELECT ViewCount FROM dbo.Story WHERE StoryId = ?", c.storyId())).isEqualTo(storyBefore + 2);
        assertThat(count("SELECT COALESCE(SUM(Views), 0) FROM dbo.StoryViewDaily WHERE StoryId = ? AND ViewDate = ?",
                c.storyId(), day)).isEqualTo(dailyBefore + 2);
        assertThat(counter('C', c.id())).isZero();
        assertThat(counter('S', c.storyId())).isZero();
        assertThat(dirtyMembers()).isEmpty();
        assertThat(flusher.flush()).as("nothing left to flush").isZero();
    }

    @Test
    void viewsAfterAFlushStartNewCounters() throws Exception {
        Chap c = middleChapter();
        readOk(newClient(), c.id());
        flusher.flush();

        readOk(newClient(), c.id());

        assertThat(counter('C', c.id())).isEqualTo(1);
        assertThat(dirtyMembers()).hasSize(2);
    }

    @Test
    void drainedCountersCanBePutBack() throws Exception {
        Chap c = middleChapter();
        readOk(newClient(), c.id());

        ViewCounterStore.Drained drained = store.drain(1000);
        assertThat(drained.taken()).isEqualTo(2);
        assertThat(drained.deltas()).extracting(ViewDelta::delta).containsOnly(1);
        assertThat(counter('C', c.id())).isZero();

        store.restore(drained.deltas());

        assertThat(counter('C', c.id())).isEqualTo(1);
        assertThat(counter('S', c.storyId())).isEqualTo(1);
        assertThat(dirtyMembers()).hasSize(2);
    }

    @Test
    void unknownIdsAreIgnoredByTheProcedure() {
        LocalDate day = LocalDate.of(2026, 11, 8);
        store.restore(List.of(new ViewDelta('S', Integer.MAX_VALUE, day, 4), new ViewDelta('C', Long.MAX_VALUE, day, 4)));

        assertThat(flusher.flush()).isEqualTo(2);
        assertThat(dirtyMembers()).isEmpty();
    }

    @Test
    void unreadableDirtyMemberIsDropped() {
        redis.opsForSet().add(VIEWS + "dirty", "bad-member");

        ViewCounterStore.Drained drained = store.drain(1000);

        assertThat(drained.taken()).isEqualTo(1);
        assertThat(drained.deltas()).isEmpty();
        assertThat(dirtyMembers()).isEmpty();
    }
}
