-- Summary of {story}; the same numbers as copies.fingerprint() computes on the client.
SELECT COUNT(*)                                                                     AS [rows],
       SUM(CASE WHEN PublishStatus = 'PUBLISHED' AND IsDeleted = 0 THEN 1 ELSE 0 END) AS public_rows,
       SUM(CAST(StoryId AS BIGINT))                                                 AS id_sum,
       SUM(CAST(AuthorId AS BIGINT))                                                AS author_sum,
       SUM(CAST(ChapterCount AS BIGINT))                                            AS chapter_sum,
       SUM(CAST(RatingAvg * 100 AS BIGINT))                                         AS rating_cents_sum,
       SUM(CAST(DATALENGTH(Title) / 2 AS BIGINT))                                   AS title_len_sum,
       SUM(CAST(DATALENGTH(Slug) AS BIGINT))                                        AS slug_len_sum,
       ISNULL(SUM(DATEDIFF_BIG(MILLISECOND, '1970-01-01', LastChapterAt)), 0)       AS last_ms_sum
FROM {story};
