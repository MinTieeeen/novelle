/*
 * 99_check_invariants.sql   [RDS OK, read-only]
 *
 * Recomputes every derived value (data-dictionary section 5) and checks the business rules that the
 * schema cannot express alone (section 6). It returns ONE ROW PER VIOLATION: zero rows means the
 * data is consistent. Run it after seeding and after every demo:
 *
 *   sqlcmd -S <rds-endpoint>,1433 -U novelle_readonly -P <password> -d NovelleDB -C -b -f 65001 -i 99_check_invariants.sql
 *
 * Columns: CheckName (which rule), KeyValue (offending row), Detail (stored vs expected).
 */
SET NOCOUNT ON;
GO

SELECT CheckName, KeyValue, Detail
FROM (

    /* ---- derived values ---- */

    SELECT 'Story.ChapterStats' AS CheckName,
           CAST(s.StoryId AS VARCHAR(40)) AS KeyValue,
           CONCAT('stored=', s.ChapterCount, '/', s.WordCount, '/', CONVERT(VARCHAR(30), s.LastChapterAt, 121),
                  ' expected=', x.ChapterCount, '/', x.WordCount, '/', CONVERT(VARCHAR(30), x.LastChapterAt, 121)) AS Detail
    FROM dbo.Story s
    CROSS APPLY (SELECT COUNT(*) AS ChapterCount,
                        COALESCE(SUM(CAST(c.WordCount AS BIGINT)), 0) AS WordCount,
                        MAX(c.PublishedAt) AS LastChapterAt
                 FROM dbo.Chapter c
                 WHERE c.StoryId = s.StoryId AND c.Status = 'PUBLISHED' AND c.IsDeleted = 0) x
    WHERE s.ChapterCount <> x.ChapterCount
       OR s.WordCount    <> x.WordCount
       OR COALESCE(s.LastChapterAt, '1900-01-01') <> COALESCE(x.LastChapterAt, '1900-01-01')

    UNION ALL
    SELECT 'Story.FollowCount', CAST(s.StoryId AS VARCHAR(40)),
           CONCAT('stored=', s.FollowCount, ' expected=', x.Cnt)
    FROM dbo.Story s
    CROSS APPLY (SELECT COUNT(*) AS Cnt FROM dbo.Follow f WHERE f.StoryId = s.StoryId) x
    WHERE s.FollowCount <> x.Cnt

    UNION ALL
    SELECT 'Story.Rating', CAST(s.StoryId AS VARCHAR(40)),
           CONCAT('stored=', s.RatingAvg, '/', s.RatingCount, ' expected=', COALESCE(x.AvgScore, 0), '/', x.Cnt)
    FROM dbo.Story s
    CROSS APPLY (SELECT CAST(AVG(CAST(r.Score AS DECIMAL(5,2))) AS DECIMAL(3,2)) AS AvgScore, COUNT(*) AS Cnt
                 FROM dbo.Rating r WHERE r.StoryId = s.StoryId) x
    WHERE s.RatingCount <> x.Cnt OR s.RatingAvg <> COALESCE(x.AvgScore, 0)

    UNION ALL
    SELECT 'Author.FollowerCount', CAST(a.UserId AS VARCHAR(40)),
           CONCAT('stored=', a.FollowerCount, ' expected=', x.Cnt)
    FROM dbo.Author a
    CROSS APPLY (SELECT COUNT(*) AS Cnt FROM dbo.AuthorFollow af WHERE af.AuthorId = a.UserId) x
    WHERE a.FollowerCount <> x.Cnt

    UNION ALL
    SELECT 'Tag.UsageCount', CAST(t.TagId AS VARCHAR(40)),
           CONCAT('stored=', t.UsageCount, ' expected=', x.Cnt)
    FROM dbo.Tag t
    CROSS APPLY (SELECT COUNT(*) AS Cnt FROM dbo.StoryTag st WHERE st.TagId = t.TagId) x
    WHERE t.UsageCount <> x.Cnt

    UNION ALL
    SELECT 'ReadingList.ItemCount', CAST(l.ListId AS VARCHAR(40)),
           CONCAT('stored=', l.ItemCount, ' expected=', x.Cnt)
    FROM dbo.ReadingList l
    CROSS APPLY (SELECT COUNT(*) AS Cnt FROM dbo.ReadingListItem i WHERE i.ListId = l.ListId) x
    WHERE l.ItemCount <> x.Cnt

    /* ---- RB13: role AUTHOR <=> Author row pointing to an APPROVED request of the same user ---- */

    UNION ALL
    SELECT 'RB13.AuthorRoleWithoutProfile', CAST(u.UserId AS VARCHAR(40)), 'Role=AUTHOR but no Author row'
    FROM dbo.[User] u
    WHERE u.Role = 'AUTHOR' AND NOT EXISTS (SELECT 1 FROM dbo.Author a WHERE a.UserId = u.UserId)

    UNION ALL
    SELECT 'RB13.ProfileWithoutAuthorRole', CAST(a.UserId AS VARCHAR(40)), CONCAT('Author row but Role=', u.Role)
    FROM dbo.Author a
    JOIN dbo.[User] u ON u.UserId = a.UserId
    WHERE u.Role <> 'AUTHOR'

    UNION ALL
    SELECT 'RB13.ProfileRequestMismatch', CAST(a.UserId AS VARCHAR(40)),
           CONCAT('ApprovedRequestId=', a.ApprovedRequestId, ' status=', r.Status, ' requestUser=', r.UserId)
    FROM dbo.Author a
    JOIN dbo.AuthorRequest r ON r.RequestId = a.ApprovedRequestId
    WHERE r.Status <> 'APPROVED' OR r.UserId <> a.UserId

    /* ---- RB7: chapter and volume belong to the same story ---- */

    UNION ALL
    SELECT 'RB7.VolumeOtherStory', CAST(c.ChapterId AS VARCHAR(40)),
           CONCAT('chapter story=', c.StoryId, ' volume story=', v.StoryId)
    FROM dbo.Chapter c
    JOIN dbo.Volume v ON v.VolumeId = c.VolumeId
    WHERE v.StoryId <> c.StoryId

    /* ---- RB5: the last-read chapter belongs to the story ---- */

    UNION ALL
    SELECT 'RB5.LastChapterOtherStory', CONCAT(h.UserId, '/', h.StoryId),
           CONCAT('chapter ', h.LastChapterId, ' belongs to story ', c.StoryId)
    FROM dbo.ReadingHistory h
    JOIN dbo.Chapter c ON c.ChapterId = h.LastChapterId
    WHERE c.StoryId <> h.StoryId

    /* ---- RB4: nobody rates his own story ---- */

    UNION ALL
    SELECT 'RB4.RatedOwnStory', CONCAT(r.UserId, '/', r.StoryId), 'author rated own story'
    FROM dbo.Rating r
    JOIN dbo.Story s ON s.StoryId = r.StoryId
    WHERE r.UserId = s.AuthorId

    /* ---- RB16: ADMIN does not rate, read-track, follow-rate or apply to become an author ---- */

    UNION ALL
    SELECT 'RB16.AdminRated', CONCAT(r.UserId, '/', r.StoryId), 'ADMIN has a rating'
    FROM dbo.Rating r JOIN dbo.[User] u ON u.UserId = r.UserId WHERE u.Role = 'ADMIN'

    UNION ALL
    SELECT 'RB16.AdminReadingHistory', CONCAT(h.UserId, '/', h.StoryId), 'ADMIN has reading history'
    FROM dbo.ReadingHistory h JOIN dbo.[User] u ON u.UserId = h.UserId WHERE u.Role = 'ADMIN'

    UNION ALL
    SELECT 'RB16.AdminAuthorRequest', CAST(r.RequestId AS VARCHAR(40)), 'ADMIN submitted an author request'
    FROM dbo.AuthorRequest r JOIN dbo.[User] u ON u.UserId = r.UserId WHERE u.Role = 'ADMIN'

    /* ---- RB6: 1-3 genres, exactly one primary, at most 10 tags ---- */

    UNION ALL
    SELECT 'RB6.Genres', CAST(s.StoryId AS VARCHAR(40)),
           CONCAT('genres=', x.GenreCnt, ' primary=', x.PrimaryCnt)
    FROM dbo.Story s
    CROSS APPLY (SELECT COUNT(*) AS GenreCnt, COALESCE(SUM(CAST(g.IsPrimary AS INT)), 0) AS PrimaryCnt
                 FROM dbo.StoryGenre g WHERE g.StoryId = s.StoryId) x
    WHERE x.GenreCnt NOT BETWEEN 1 AND 3 OR x.PrimaryCnt <> 1

    UNION ALL
    SELECT 'RB6.Tags', CAST(st.StoryId AS VARCHAR(40)), CONCAT('tags=', COUNT(*))
    FROM dbo.StoryTag st
    GROUP BY st.StoryId
    HAVING COUNT(*) > 10

) AS violations
ORDER BY CheckName, KeyValue;
GO
