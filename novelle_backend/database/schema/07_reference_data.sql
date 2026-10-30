/*
 * 07_reference_data.sql   [RDS OK]
 *
 * The 20 fixed genres (docs/data-dictionary.md section 9.3). Users, stories and everything else
 * are produced by the seeder, not here.
 *
 * The file contains Vietnamese text: run sqlcmd with `-f 65001` (UTF-8). Re-running is safe (MERGE on Slug).
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

MERGE dbo.Genre AS t
USING (VALUES
    (N'Tiên hiệp',          'tien-hiep',           1),
    (N'Huyền huyễn',        'huyen-huyen',         2),
    (N'Kiếm hiệp',          'kiem-hiep',           3),
    (N'Ngôn tình',          'ngon-tinh',           4),
    (N'Đô thị',             'do-thi',              5),
    (N'Xuyên không',        'xuyen-khong',         6),
    (N'Trọng sinh',         'trong-sinh',          7),
    (N'Khoa học viễn tưởng','khoa-hoc-vien-tuong', 8),
    (N'Trinh thám',         'trinh-tham',          9),
    (N'Kinh dị',            'kinh-di',            10),
    (N'Hài hước',           'hai-huoc',           11),
    (N'Học đường',          'hoc-duong',          12),
    (N'Lịch sử',            'lich-su',            13),
    (N'Quân sự',            'quan-su',            14),
    (N'Võng du',            'vong-du',            15),
    (N'Đồng nhân',          'dong-nhan',          16),
    (N'Light novel',        'light-novel',        17),
    (N'Điền văn',           'dien-van',           18),
    (N'Cung đấu',           'cung-dau',           19),
    (N'Phiêu lưu',          'phieu-luu',          20)
) AS s (Name, Slug, SortOrder)
   ON t.Slug = s.Slug
WHEN MATCHED AND (t.Name COLLATE Latin1_General_100_BIN2 <> s.Name COLLATE Latin1_General_100_BIN2
                  OR t.SortOrder <> s.SortOrder) THEN
    UPDATE SET Name = s.Name, SortOrder = s.SortOrder
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Name, Slug, SortOrder) VALUES (s.Name, s.Slug, s.SortOrder);
GO

SELECT COUNT(*) AS GenreCount FROM dbo.Genre;   -- expect 20
GO
