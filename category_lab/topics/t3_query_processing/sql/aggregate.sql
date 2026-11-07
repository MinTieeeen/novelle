-- Query type (h): aggregate functions. F13 admin statistics: site-wide views per day over the last
-- 30 days (the chart on the admin dashboard): total views, number of stories viewed, busiest story.
-- {view_daily} is replaced by the scenario (a 150 / 1k / 10k-story copy of dbo.StoryViewDaily with the
-- web's indexes); the two parameters are the first day and the day after the last day.
SELECT v.ViewDate,
       SUM(v.Views)  AS TotalViews,
       COUNT(*)      AS StoriesViewed,
       MAX(v.Views)  AS MaxViewsOneStory
FROM {view_daily} v
WHERE v.ViewDate >= ? AND v.ViewDate < ?
GROUP BY v.ViewDate
ORDER BY v.ViewDate
