/*
 * 10_corpus.sql   [RDS OK]   Seed step 1 of 5 (then 20, 30, 40, 50, 90).
 *
 * Creates the helper schema `seed` (dropped again by 90_finalize.sql):
 *   seed.Nums      numbers 1..100000
 *   seed.Param     the reference "now" (UTC midnight today) so every generated timestamp is <= now
 *   seed.fn_Rnd    deterministic pseudo-random number in [0,1) from (row number, salt): same data on every run
 *   seed.fn_Slug   Vietnamese text -> ascii slug
 *   seed.Lex       the Vietnamese text corpus (sentences, names, titles, tags, reviews ...)
 *
 * Run as novelle_migrator with `-f 65001` (UTF-8). Safe to re-run: it rebuilds the `seed` objects.
 * Salt ranges used by the later steps: users 100-199, requests 200-299, stories 300-399,
 * chapters 400-499, activity 500-699.
 */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF SCHEMA_ID(N'seed') IS NULL EXEC (N'CREATE SCHEMA seed');
GO

/* ---------- numbers 1..100000 ---------- */
DROP TABLE IF EXISTS seed.Nums;
CREATE TABLE seed.Nums (n INT NOT NULL PRIMARY KEY);
;WITH dg AS (SELECT v FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) t (v))
INSERT seed.Nums (n)
SELECT 1 + a.v + 10 * b.v + 100 * c.v + 1000 * d.v + 10000 * e.v
FROM dg a, dg b, dg c, dg d, dg e;
GO

/* ---------- reference time: today 00:00 UTC (re-runs on the same UTC day give identical data) ---------- */
DROP TABLE IF EXISTS seed.Param;
CREATE TABLE seed.Param (RefNow DATETIME2(3) NOT NULL);
INSERT seed.Param (RefNow) VALUES (CAST(CAST(SYSUTCDATETIME() AS DATE) AS DATETIME2(3)));
GO

/* ---------- deterministic random: xorshift/LCG mix on BIGINT, result in [0,1) ---------- */
CREATE OR ALTER FUNCTION seed.fn_Rnd (@n BIGINT, @salt BIGINT)
RETURNS TABLE
AS RETURN
SELECT r = CAST(d AS FLOAT) / 2147483648.0
FROM (SELECT d = c ^ (c / 4096)
      FROM (SELECT c = (((b ^ (b / 32768)) * 22695477) + 1) % CAST(2147483648 AS BIGINT)
            FROM (SELECT b = (((a ^ (a / 65536)) * 1103515245) % CAST(2147483648 AS BIGINT))
                  FROM (SELECT a = (((@n + 1) * CAST(2654435761 AS BIGINT)) + (@salt * 1013904223)) % CAST(2147483648 AS BIGINT)) t1) t2) t3) t4;
GO

/* ---------- slug: lower case, no Vietnamese diacritics, spaces -> hyphens ---------- */
CREATE OR ALTER FUNCTION seed.fn_Slug (@s NVARCHAR(400))
RETURNS TABLE
AS RETURN
SELECT slug = LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(
         TRANSLATE(LOWER(@s),
                   N'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
                   REPLICATE(N'a', 17) + REPLICATE(N'e', 11) + REPLICATE(N'i', 5) + REPLICATE(N'o', 17)
                   + REPLICATE(N'u', 11) + REPLICATE(N'y', 5) + N'd'),
         N' ', N'-'), N'--', N'-'), N'--', N'-')));
GO

IF (SELECT slug FROM seed.fn_Slug(N'Đây là Thử Nghiệm Ngôn Tình Ưu Việt')) <> N'day-la-thu-nghiem-ngon-tinh-uu-viet'
    THROW 50110, N'seed.fn_Slug self-test failed: check that sqlcmd runs with -f 65001', 1;
GO

/* ---------- corpus ---------- */
DROP TABLE IF EXISTS seed.Lex;
CREATE TABLE seed.Lex (
    Kind  VARCHAR(8)      NOT NULL,
    Slug  VARCHAR(40)     NOT NULL,      -- genre slug for genre-specific kinds, '' otherwise
    Idx   INT             NOT NULL,      -- 1..n inside (Kind, Slug), assigned by binary order of Body
    Body  NVARCHAR(1000)  NOT NULL,
    CONSTRAINT PK_seed_Lex PRIMARY KEY (Kind, Slug, Idx)
);
GO

DROP TABLE IF EXISTS #lex;
CREATE TABLE #lex (Kind VARCHAR(8) NOT NULL, Slug VARCHAR(40) NOT NULL, Body NVARCHAR(1000) NOT NULL);
GO

/* SENT: neutral narrative sentences used to build chapter text */
INSERT #lex (Kind, Slug, Body) SELECT 'SENT', '', Body FROM (VALUES
 (N'Sương sớm còn phủ trắng những mái nhà thấp, tiếng gà gáy từ xa vọng lại làm con phố nhỏ dần thức giấc.'),
 (N'Hắn đứng lặng bên cửa sổ, nhìn những giọt mưa chảy dài trên khung kính và nghĩ về quãng đường đã qua.'),
 (N'Gió từ phía núi thổi xuống mang theo hơi lạnh, khiến ngọn đèn dầu trên bàn chập chờn như sắp tắt.'),
 (N'Cô gái ngẩng đầu lên, đôi mắt sáng lên một tia hy vọng mà suốt nhiều ngày qua chưa từng xuất hiện.'),
 (N'Không ai trong căn phòng dám lên tiếng, chỉ có tiếng đồng hồ gõ nhịp đều đặn trên bức tường cũ.'),
 (N'Con đường đất đỏ uốn lượn giữa hai hàng cây cao, cuối đường là một ngôi nhà gỗ nhỏ có mái ngói rêu phong.'),
 (N'Hắn siết chặt thanh kiếm cũ, trong lòng hiểu rằng trận chiến sắp tới sẽ quyết định tất cả.'),
 (N'Ánh trăng tròn treo cao trên đỉnh núi, rải một lớp bạc mỏng lên mặt hồ yên ả.'),
 (N'— Ngươi thật sự muốn đi sao? — nàng khẽ hỏi, giọng nhỏ đến mức gần như hòa vào tiếng gió.'),
 (N'— Ta đã quyết rồi, — hắn đáp, không quay đầu lại, — có những việc nếu không làm thì cả đời sẽ hối hận.'),
 (N'Tiếng bước chân vang lên trên hành lang dài, mỗi lúc một gần hơn, khiến tim cô đập nhanh hơn bình thường.'),
 (N'Anh mở cuốn sổ cũ ra, những dòng chữ nghiêng nghiêng của người đã khuất hiện lên như một lời nhắn nhủ.'),
 (N'Buổi chiều hôm ấy trời đổ nắng vàng rực, những chiếc lá khô xoay tròn rồi rơi xuống mặt sân vắng.'),
 (N'Người đàn ông lạ mặt đặt chén trà xuống bàn, nhìn thẳng vào mắt hắn và mỉm cười đầy ẩn ý.'),
 (N'Phía chân trời, những đám mây đen kéo đến nặng nề, báo hiệu một cơn bão lớn sắp ập tới.'),
 (N'Cô ôm chặt chiếc túi nhỏ trước ngực, bước từng bước thận trọng trên con dốc trơn trượt sau cơn mưa.'),
 (N'Những ngọn đèn lồng đỏ được treo dọc theo con phố, soi sáng gương mặt háo hức của lũ trẻ chạy tung tăng.'),
 (N'Hắn hít một hơi thật sâu, cố gắng giữ cho giọng nói không run rẩy khi bước lên phía trước.'),
 (N'— Chuyện này không đơn giản như chúng ta nghĩ, — ông cụ chậm rãi nói, mắt nhìn xa xăm về phía rặng núi.'),
 (N'Trong góc phòng, ngọn nến cháy nốt đoạn cuối cùng, để lại một vệt khói mảnh bay lên rồi tan vào bóng tối.'),
 (N'Tiếng sóng vỗ vào bờ đá đều đặn như nhịp thở của biển cả, đưa anh trở về những ngày thơ ấu.'),
 (N'Cô nhớ rất rõ lời hứa năm xưa, dù thời gian đã trôi qua lâu đến mức mọi thứ xung quanh đều đã đổi thay.'),
 (N'Hắn quay lại nhìn đoàn người phía sau, ai nấy đều mệt mỏi nhưng ánh mắt vẫn ánh lên sự kiên định.'),
 (N'Bầu trời đêm đầy sao, từng vì sao lấp lánh như những hạt cát rải trên tấm vải nhung đen thẫm.'),
 (N'Chiếc xe cũ chậm rãi lăn bánh trên con đường quê, để lại sau lưng một vệt bụi mờ dài.'),
 (N'Anh bước vào quán cà phê quen thuộc, chọn chiếc bàn cạnh cửa sổ như mọi buổi sáng suốt mấy năm nay.'),
 (N'Lời nói của hắn như một viên đá ném xuống mặt hồ phẳng lặng, khiến cả đại sảnh xôn xao.'),
 (N'Cô mỉm cười, nhưng nụ cười ấy không chạm tới đôi mắt, thứ vẫn còn vương lại nỗi buồn chưa kịp nguôi.'),
 (N'Cánh cổng gỗ nặng nề mở ra với tiếng kẽo kẹt dài, để lộ khoảng sân rộng phủ đầy rêu xanh.'),
 (N'Hắn nhìn bàn tay mình đang run lên, chợt nhận ra sức mạnh này còn lớn hơn những gì hắn từng tưởng tượng.'),
 (N'— Em có tin vào số phận không? — anh hỏi khi hai người ngồi bên nhau trên bậc thềm trước nhà.'),
 (N'— Tin hay không cũng vậy thôi, — cô đáp khẽ, — quan trọng là mình dám bước tiếp.'),
 (N'Mùi hương hoa sữa thoang thoảng trong gió đêm, gợi lại trong lòng anh biết bao kỷ niệm đã ngủ yên từ lâu.'),
 (N'Đoàn thương nhân dừng chân bên suối, nhóm lửa nấu cơm trong tiếng cười nói rôm rả sau một ngày dài.'),
 (N'Hắn lặng lẽ lau sạch vết máu trên lưỡi kiếm, ánh mắt lạnh lẽo không để lộ chút cảm xúc nào.'),
 (N'Trên tường treo một bức tranh cũ, người trong tranh có đôi mắt buồn như đang dõi theo từng bước chân của khách.'),
 (N'Những đứa trẻ ngồi quanh bếp lửa, chăm chú nghe bà kể về vùng đất xa xôi nằm sau dãy núi phía tây.'),
 (N'Cô mở cửa sổ, để gió sớm lùa vào căn phòng nhỏ mang theo mùi đất ẩm và tiếng chim hót líu lo.'),
 (N'Anh hiểu rằng mỗi lựa chọn hôm nay sẽ để lại hệ quả mà mình phải gánh chịu trong nhiều năm sau.'),
 (N'Ngọn lửa trong lò bập bùng, hắt những cái bóng dài lên vách đá lạnh lẽo của hang động.'),
 (N'Hắn không nói gì, chỉ gật đầu thật nhẹ rồi quay người bước về phía cánh rừng tối om trước mặt.'),
 (N'Tiếng chuông nhà thờ ngân vang giữa thung lũng, báo hiệu một ngày mới vừa bắt đầu.'),
 (N'Cô lật từng trang thư cũ, những nét chữ quen thuộc khiến lòng cô dâng lên một nỗi nhớ da diết.'),
 (N'Cả đoàn người im lặng đi qua cây cầu treo cũ kỹ, chỉ nghe tiếng ván gỗ kêu cọt kẹt dưới chân.'),
 (N'Trời vừa tạnh mưa, mặt đường loang loáng ánh đèn, những vũng nước nhỏ phản chiếu bầu trời xám nhạt.'),
 (N'Hắn biết rõ phía trước là con đường không có lối quay lại, nhưng vẫn bước đi với đôi chân vững vàng.'),
 (N'Bà cụ ngồi trước hiên nhà, đôi tay gầy guộc thoăn thoắt đan chiếc khăn len cho đứa cháu nhỏ.'),
 (N'Tin tức lan nhanh như lửa cháy trên đồng khô, chỉ trong chốc lát cả thị trấn đã bàn tán xôn xao.'),
 (N'Cô tựa đầu vào vai anh, cảm nhận hơi ấm quen thuộc làm dịu đi mọi lo âu của cả một ngày dài.'),
 (N'Dòng sông lặng lẽ trôi qua những bãi bồi xanh mướt, mang theo bao câu chuyện của những người đã đi xa.'),
 (N'Hắn nhận ra mình đã đánh giá thấp đối thủ, và cái giá của sự chủ quan ấy có thể rất đắt.'),
 (N'Trước sân đình, dân làng tụ họp đông đủ, ai cũng muốn nghe người trưởng thôn công bố quyết định quan trọng.'),
 (N'Anh khẽ khàng đóng cửa lại, không muốn làm kinh động giấc ngủ của người đã vất vả suốt cả tuần.'),
 (N'Từ trên đồi nhìn xuống, cả thung lũng hiện ra như một bức tranh với những thửa ruộng bậc thang xếp lớp.'),
 (N'— Đừng lo, mọi chuyện rồi sẽ ổn thôi, — hắn nói, dù chính hắn cũng không chắc về lời mình vừa nói.'),
 (N'Tiếng cười của lũ trẻ vang lên từ phía bãi cỏ, xua tan phần nào bầu không khí nặng nề trong buổi chiều.'),
 (N'Cô xếp gọn những bức thư vào chiếc hộp gỗ nhỏ, như thể cất đi cả một quãng thanh xuân đã xa.'),
 (N'Sau bao nhiêu năm lưu lạc, cuối cùng hắn cũng đặt chân trở lại mảnh đất đã nuôi hắn lớn lên.'),
 (N'Người lái đò im lặng chèo qua khúc sông vắng, chỉ có tiếng mái chèo khua nước đều đều trong màn sương.'),
 (N'Hắn vung tay, một luồng sáng xanh nhạt lan ra, quét sạch lớp sương mù dày đặc trước mặt.'),
 (N'Ánh mắt hai người chạm nhau trong thoáng chốc, rồi cùng lúc quay đi như chưa từng có chuyện gì xảy ra.'),
 (N'Chợ sớm đã nhộn nhịp từ lúc trời còn tờ mờ, tiếng người mua kẻ bán hòa lẫn mùi bánh nóng thơm lừng.'),
 (N'Anh nhìn tấm bản đồ đã ngả màu, những đường nét mờ nhạt chỉ về một nơi mà chưa ai từng trở về.'),
 (N'Trong sự yên tĩnh của đêm khuya, cô nghe rõ cả tiếng tim mình đập và tiếng gió luồn qua khe cửa.'),
 (N'Hắn đã quen với cô độc, nhưng đêm nay sự im lặng lại trở nên nặng nề hơn bao giờ hết.'),
 (N'Cả đội ngũ dừng lại bên bìa rừng, quan sát những dấu chân lạ in sâu trên nền đất ẩm.'),
 (N'Cô cầm chiếc ô cũ bước ra khỏi cửa, mưa rơi lộp độp trên mặt vải và trên cả những suy nghĩ rối bời.'),
 (N'Khi mặt trời lặn, bầu trời nhuộm một màu cam đỏ rực rỡ, như thể ai đó vừa đổ cả bình màu lên nền trời.'),
 (N'Hắn hiểu rằng chỉ cần chậm một nhịp thôi, tất cả những gì đã gây dựng suốt bao năm sẽ tan thành mây khói.'),
 (N'Giọng hát trầm ấm của người nghệ sĩ già vang lên giữa quảng trường, khiến đám đông bất giác lặng đi.'),
 (N'Anh gấp lá thư lại, nhét vào túi áo rồi bước nhanh ra phía cổng khi tiếng còi tàu vang lên dồn dập.'),
 (N'Con ngựa hí vang rồi phi nước đại, bụi đỏ cuốn lên mù mịt phía sau lưng người cưỡi.'),
 (N'Cô nhìn mình trong gương, gương mặt quen thuộc mà bỗng dưng thấy xa lạ như của một người nào khác.'),
 (N'Dưới ánh đèn vàng mờ, những quyển sách xếp chồng cao trong thư viện cũ tỏa ra mùi giấy ẩm quen thuộc.'),
 (N'Hắn bước qua ngưỡng cửa, và lần đầu tiên sau nhiều năm, cảm thấy mình thực sự đã về nhà.'),
 (N'Chiến thuyền rẽ sóng lao về phía chân trời, cánh buồm căng gió trắng xóa dưới nắng sớm.'),
 (N'— Cẩn thận, phía trước có người, — cô thì thầm, kéo tay anh nấp vào sau bức tường đổ nát.'),
 (N'Mùa thu đến lặng lẽ, những chiếc lá vàng phủ kín lối đi, và hơi lạnh đầu mùa len vào từng góc phố.'),
 (N'Hắn không còn là cậu thiếu niên nhút nhát ngày nào, bàn tay chai sạn và ánh mắt đã mang dấu vết của thời gian.'),
 (N'Tiếng trống hội vang rền khắp làng, dân chúng kéo nhau ra đình, ai nấy đều rạng rỡ trong bộ áo mới.'),
 (N'Anh kiên nhẫn chờ đợi, vì anh hiểu có những điều chỉ đến với người biết đợi đúng lúc.'),
 (N'Đêm xuống, thành phố lên đèn, hàng ngàn ô cửa sổ sáng lên như những vì sao nhỏ trong lòng đất.'),
 (N'Cô thở dài, đặt cây bút xuống bàn rồi nhìn ra ngoài khoảng sân nhỏ đang ngập trong ánh nắng cuối ngày.'),
 (N'Con thuyền nhỏ chòng chành trên sóng, người ngồi trên thuyền vẫn bình thản như chưa từng biết sợ hãi.'),
 (N'Hắn đưa tay lên che mắt, rồi nhìn ra khoảng trời rộng mở vừa hiện ra sau cánh rừng rậm rạp.'),
 (N'Bàn tay anh run run khi mở bức thư, vì anh biết nội dung bên trong sẽ thay đổi tất cả.'),
 (N'Quán trọ ven đường đông nghịt khách, tiếng nói cười, tiếng chén bát hòa lẫn khói bếp nghi ngút.'),
 (N'Cô bước đi giữa cánh đồng hoa dại, váy áo bay phấp phới trong gió và mái tóc đẫm nắng chiều.'),
 (N'Lời cảnh báo của người lữ khách văng vẳng bên tai hắn suốt đêm, khiến giấc ngủ chập chờn không yên.'),
 (N'Anh hiểu rằng sự tha thứ không phải là quên đi, mà là học cách sống cùng những điều đã xảy ra.'),
 (N'Dưới gốc cây đa đầu làng, những người già ngồi nhâm nhi trà, kể cho nhau nghe chuyện của nhiều năm trước.'),
 (N'Hắn đi một vòng quanh căn phòng, mắt lướt qua từng món đồ cũ như muốn tìm một dấu vết bị bỏ sót.'),
 (N'Tiếng mưa rơi trên mái tôn đều đặn như một khúc nhạc ru, đưa cô chìm vào giấc ngủ lúc nào không hay.'),
 (N'Cả hai cùng bước đi trên con đường làng quen thuộc, im lặng nhưng không hề cảm thấy xa cách.'),
 (N'Bóng tối dần buông xuống, những ngọn đuốc lần lượt được thắp lên dọc theo con đường dẫn vào thành.'),
 (N'Anh cười khẽ, nhớ lại lần đầu hai người gặp nhau cũng vào một buổi chiều mưa như thế này.'),
 (N'Nước mắt cô rơi xuống nhưng cô nhanh chóng lau đi, không muốn người khác thấy mình yếu đuối.'),
 (N'Dưới chân núi, một dòng suối trong vắt chảy qua những tảng đá phủ rêu, mát lạnh và rì rào suốt ngày đêm.'),
 (N'Hắn hiểu rằng sức mạnh thật sự không nằm ở thanh kiếm trong tay mà ở lòng kiên định trong tim.'),
 (N'Ngoài hiên, gió lùa qua tán lá chuối khiến chúng đập vào nhau xào xạc như tiếng người thì thầm.'),
 (N'Cô lặng lẽ đứng nhìn theo bóng anh khuất dần sau khúc quanh, lòng nặng trĩu một điều chưa kịp nói.'),
 (N'Cả thị trấn chìm trong tĩnh lặng, chỉ còn tiếng chó sủa xa xa và ánh đèn leo lét nơi đầu ngõ.'),
 (N'Hắn rút từ trong áo ra một mảnh ngọc cũ, đặt lên bàn rồi chậm rãi kể lại toàn bộ câu chuyện.'),
 (N'Đoàn tàu rời ga trong tiếng còi dài, để lại sân ga lặng lẽ với những cái vẫy tay vội vã.'),
 (N'Cơn gió lạnh thổi qua mang theo những cánh hoa đào cuối mùa, rải đầy mặt đường đá cổ kính.'),
 (N'Mọi người lần lượt rời khỏi đại sảnh, chỉ còn lại hắn ngồi một mình giữa ánh nến chập chờn.'),
 (N'Cô tin rằng mỗi người đều có một lý do để tồn tại, dù đôi khi lý do ấy phải mất rất lâu mới tìm thấy.')
) v (Body);
GO

/* TN / TA: title nouns and adjectives per genre (3 each) */
INSERT #lex (Kind, Slug, Body) SELECT Kind, Slug, Body FROM (VALUES
 ('TN','tien-hiep',N'Kiếm Tiên'),('TN','tien-hiep',N'Đạo Tôn'),('TN','tien-hiep',N'Thiên Môn'),
 ('TA','tien-hiep',N'Vô Song'),('TA','tien-hiep',N'Bất Diệt'),('TA','tien-hiep',N'Độc Tôn'),
 ('TN','huyen-huyen',N'Long Hồn'),('TN','huyen-huyen',N'Thần Ấn'),('TN','huyen-huyen',N'Linh Giới'),
 ('TA','huyen-huyen',N'Chí Tôn'),('TA','huyen-huyen',N'Vĩnh Hằng'),('TA','huyen-huyen',N'Phong Ma'),
 ('TN','kiem-hiep',N'Thanh Kiếm'),('TN','kiem-hiep',N'Giang Hồ'),('TN','kiem-hiep',N'Hiệp Khách'),
 ('TA','kiem-hiep',N'Lãng Du'),('TA','kiem-hiep',N'Nghĩa Bạc'),('TA','kiem-hiep',N'Vô Danh'),
 ('TN','ngon-tinh',N'Tình Yêu'),('TN','ngon-tinh',N'Mùa Thu'),('TN','ngon-tinh',N'Hoa Nở'),
 ('TA','ngon-tinh',N'Dịu Dàng'),('TA','ngon-tinh',N'Ngọt Ngào'),('TA','ngon-tinh',N'Muộn Màng'),
 ('TN','do-thi',N'Tổng Giám Đốc'),('TN','do-thi',N'Thiếu Gia'),('TN','do-thi',N'Bác Sĩ'),
 ('TA','do-thi',N'Trở Lại'),('TA','do-thi',N'Ẩn Giấu'),('TA','do-thi',N'Số Một'),
 ('TN','xuyen-khong',N'Nữ Phụ'),('TN','xuyen-khong',N'Công Chúa'),('TN','xuyen-khong',N'Tiểu Thư'),
 ('TA','xuyen-khong',N'Khuynh Thành'),('TA','xuyen-khong',N'Kiêu Ngạo'),('TA','xuyen-khong',N'Thông Minh'),
 ('TN','trong-sinh',N'Đại Tiểu Thư'),('TN','trong-sinh',N'Chủ Tịch'),('TN','trong-sinh',N'Võ Sư'),
 ('TA','trong-sinh',N'Sống Lại'),('TA','trong-sinh',N'Báo Thù'),('TA','trong-sinh',N'Vươn Lên'),
 ('TN','khoa-hoc-vien-tuong',N'Hành Tinh'),('TN','khoa-hoc-vien-tuong',N'Phi Thuyền'),('TN','khoa-hoc-vien-tuong',N'Cỗ Máy'),
 ('TA','khoa-hoc-vien-tuong',N'Cuối Cùng'),('TA','khoa-hoc-vien-tuong',N'Bị Lãng Quên'),('TA','khoa-hoc-vien-tuong',N'Thứ Hai'),
 ('TN','trinh-tham',N'Vụ Án'),('TN','trinh-tham',N'Thám Tử'),('TN','trinh-tham',N'Hồ Sơ'),
 ('TA','trinh-tham',N'Bí Ẩn'),('TA','trinh-tham',N'Mất Tích'),('TA','trinh-tham',N'Chưa Giải'),
 ('TN','kinh-di',N'Ngôi Nhà'),('TN','kinh-di',N'Đêm Tối'),('TN','kinh-di',N'Lời Nguyền'),
 ('TA','kinh-di',N'Bỏ Hoang'),('TA','kinh-di',N'Không Tên'),('TA','kinh-di',N'Đỏ Thẫm'),
 ('TN','hai-huoc',N'Anh Chàng'),('TN','hai-huoc',N'Cô Nàng'),('TN','hai-huoc',N'Hội Bạn'),
 ('TA','hai-huoc',N'Hậu Đậu'),('TA','hai-huoc',N'Lầy Lội'),('TA','hai-huoc',N'Dở Hơi'),
 ('TN','hoc-duong',N'Lớp Học'),('TN','hoc-duong',N'Mùa Hè'),('TN','hoc-duong',N'Cậu Bạn'),
 ('TA','hoc-duong',N'Cùng Bàn'),('TA','hoc-duong',N'Năm Ấy'),('TA','hoc-duong',N'Ồn Ào'),
 ('TN','lich-su',N'Thành Cổ'),('TN','lich-su',N'Đế Vương'),('TN','lich-su',N'Tướng Quân'),
 ('TA','lich-su',N'Bất Bại'),('TA','lich-su',N'Hào Hùng'),('TA','lich-su',N'Vong Quốc'),
 ('TN','quan-su',N'Đội Đặc Nhiệm'),('TN','quan-su',N'Tiểu Đoàn'),('TN','quan-su',N'Chiến Hạm'),
 ('TA','quan-su',N'Thép'),('TA','quan-su',N'Bất Khuất'),('TA','quan-su',N'Tối Mật'),
 ('TN','vong-du',N'Game Thủ'),('TN','vong-du',N'Bang Hội'),('TN','vong-du',N'Tân Thủ'),
 ('TA','vong-du',N'Vô Địch'),('TA','vong-du',N'Đỉnh Cao'),('TA','vong-du',N'Ẩn Danh'),
 ('TN','dong-nhan',N'Hậu Truyện'),('TN','dong-nhan',N'Thế Giới Song Song'),('TN','dong-nhan',N'Người Kế Thừa'),
 ('TA','dong-nhan',N'Khác Biệt'),('TA','dong-nhan',N'Khởi Nguyên'),('TA','dong-nhan',N'Mới'),
 ('TN','light-novel',N'Cô Bạn Thơ Ấu'),('TN','light-novel',N'Thiếu Nữ'),('TN','light-novel',N'Anh Hùng'),
 ('TA','light-novel',N'Kỳ Lạ'),('TA','light-novel',N'Mùa Xuân'),('TA','light-novel',N'Nhỏ Bé'),
 ('TN','dien-van',N'Nông Trại'),('TN','dien-van',N'Cô Vợ Nhỏ'),('TN','dien-van',N'Ruộng Vườn'),
 ('TA','dien-van',N'Hạnh Phúc'),('TA','dien-van',N'Bình Yên'),('TA','dien-van',N'Giàu Có'),
 ('TN','cung-dau',N'Hậu Cung'),('TN','cung-dau',N'Phi Tần'),('TN','cung-dau',N'Hoàng Hậu'),
 ('TA','cung-dau',N'Mưu Kế'),('TA','cung-dau',N'Lạnh Lùng'),('TA','cung-dau',N'Đa Tình'),
 ('TN','phieu-luu',N'Hành Trình'),('TN','phieu-luu',N'Kho Báu'),('TN','phieu-luu',N'Thợ Săn'),
 ('TA','phieu-luu',N'Bí Mật'),('TA','phieu-luu',N'Cuối Trời'),('TA','phieu-luu',N'Huyền Thoại')
) v (Kind, Slug, Body);
GO

/* DS: description sentences per genre (3 each) */
INSERT #lex (Kind, Slug, Body) SELECT 'DS', Slug, Body FROM (VALUES
 ('tien-hiep',N'Một thiếu niên bình thường vô tình bước chân vào con đường tu tiên đầy gian nan.'),
 ('tien-hiep',N'Giữa các tông môn tranh đấu, hắn phải vượt thiên kiếp để tìm ra chân lý của đại đạo.'),
 ('tien-hiep',N'Mỗi cảnh giới mới là một lần đánh cược cả sinh mệnh.'),
 ('huyen-huyen',N'Trên đại lục rộng lớn, sức mạnh quyết định tất cả và huyết mạch cổ xưa đang dần thức tỉnh.'),
 ('huyen-huyen',N'Một thiên tài bị coi là phế vật bất ngờ nhận được di sản của một cường giả thượng cổ.'),
 ('huyen-huyen',N'Hành trình từ kẻ yếu nhất đến đỉnh cao của thế giới bắt đầu từ đây.'),
 ('kiem-hiep',N'Giang hồ nổi sóng khi bí kíp thất truyền bỗng nhiên xuất hiện.'),
 ('kiem-hiep',N'Một kiếm khách vô danh lặng lẽ rong ruổi, mang theo thanh kiếm cũ và một món nợ chưa trả.'),
 ('kiem-hiep',N'Ân oán, nghĩa tình và những lựa chọn giữa chính và tà.'),
 ('ngon-tinh',N'Hai con người từ hai thế giới khác nhau tình cờ gặp lại sau nhiều năm xa cách.'),
 ('ngon-tinh',N'Giữa những hiểu lầm và tự ái, tình cảm vẫn lặng lẽ lớn dần.'),
 ('ngon-tinh',N'Một câu chuyện nhẹ nhàng về yêu thương, tha thứ và cơ hội thứ hai.'),
 ('do-thi',N'Giữa thành phố hoa lệ, một người trẻ bắt đầu lại từ con số không.'),
 ('do-thi',N'Thân phận bí ẩn dần được hé lộ khi anh vô tình bước vào cuộc tranh đoạt của những gia tộc lớn.'),
 ('do-thi',N'Công việc, tình yêu và những toan tính của người trưởng thành.'),
 ('xuyen-khong',N'Tỉnh dậy trong thân phận của một người xa lạ ở triều đại cổ xưa, cô buộc phải học cách sinh tồn.'),
 ('xuyen-khong',N'Kiến thức của thế giới hiện đại trở thành vũ khí lợi hại nhất của cô.'),
 ('xuyen-khong',N'Câu chuyện về lựa chọn ở lại hay trở về.'),
 ('trong-sinh',N'Được sống lại một lần nữa, cô thề sẽ không để bi kịch đời trước tái diễn.'),
 ('trong-sinh',N'Biết trước tương lai, anh từng bước thay đổi vận mệnh của bản thân và gia đình.'),
 ('trong-sinh',N'Báo thù chỉ là khởi đầu, điều quan trọng hơn là sống một cuộc đời đáng sống.'),
 ('khoa-hoc-vien-tuong',N'Năm 2300, nhân loại rời Trái Đất để tìm một ngôi nhà mới giữa các vì sao.'),
 ('khoa-hoc-vien-tuong',N'Một trí tuệ nhân tạo bỗng nhận ra mình đang suy nghĩ.'),
 ('khoa-hoc-vien-tuong',N'Cuộc hành trình qua không gian đặt ra những câu hỏi về bản chất của con người.'),
 ('trinh-tham',N'Một vụ án tưởng chừng đã khép lại bất ngờ xuất hiện những chứng cứ mới.'),
 ('trinh-tham',N'Thám tử trẻ lần theo từng manh mối nhỏ nhất, càng điều tra càng thấy sự thật nằm ngay gần mình.'),
 ('trinh-tham',N'Mỗi chương là một mảnh ghép, cho đến khi bức tranh toàn cảnh hiện ra.'),
 ('kinh-di',N'Ngôi nhà cuối con hẻm đã bỏ trống nhiều năm, nhưng đêm nào cũng có tiếng bước chân.'),
 ('kinh-di',N'Những điều không thể giải thích dần len vào cuộc sống bình thường của họ.'),
 ('kinh-di',N'Có những thứ không nên được nhắc tên khi đêm xuống.'),
 ('hai-huoc',N'Những tình huống dở khóc dở cười của một nhóm bạn không bao giờ chịu lớn.'),
 ('hai-huoc',N'Mỗi ngày trôi qua đều có một rắc rối mới và một cách giải quyết còn rắc rối hơn.'),
 ('hai-huoc',N'Cười đến đau bụng rồi lại thấy ấm lòng.'),
 ('hoc-duong',N'Những ngày đi học với tiếng trống trường, giờ ra chơi và những rung động đầu đời.'),
 ('hoc-duong',N'Lớp học nhỏ chứa đầy kỷ niệm của một thế hệ học trò.'),
 ('hoc-duong',N'Tuổi trẻ ồn ào, vụng dại nhưng đẹp đến không ngờ.'),
 ('lich-su',N'Giữa thời loạn lạc, những con người nhỏ bé góp tay làm nên trang sử lớn.'),
 ('lich-su',N'Mưu lược, lòng dũng cảm và cái giá của quyền lực.'),
 ('lich-su',N'Những biến cố lịch sử được kể lại qua đôi mắt người trong cuộc.'),
 ('quan-su',N'Một đơn vị nhỏ nhận nhiệm vụ gần như không thể giữa vùng chiến sự khốc liệt.'),
 ('quan-su',N'Kỷ luật, tình đồng đội và những quyết định trong tích tắc.'),
 ('quan-su',N'Phía sau bộ quân phục là những con người có gia đình và ước mơ.'),
 ('vong-du',N'Thế giới game chân thực đến mức ranh giới với đời thật dần mờ đi.'),
 ('vong-du',N'Từ một tân thủ bình thường, anh từng bước leo lên bảng xếp hạng máy chủ.'),
 ('vong-du',N'Những người bạn trong game trở thành điều quý giá nhất.'),
 ('dong-nhan',N'Câu chuyện nối tiếp thế giới quen thuộc theo một hướng chưa ai nghĩ tới.'),
 ('dong-nhan',N'Điều gì sẽ xảy ra nếu một nhân vật quen thuộc lựa chọn khác đi?'),
 ('dong-nhan',N'Món quà dành cho những người đã yêu thế giới ấy.'),
 ('light-novel',N'Cuộc sống học đường thường ngày bỗng đảo lộn khi một cô gái bí ẩn chuyển đến.'),
 ('light-novel',N'Hài hước nhẹ nhàng xen lẫn những khoảnh khắc đáng yêu.'),
 ('light-novel',N'Mỗi tập là một câu chuyện nhỏ về tình bạn và trưởng thành.'),
 ('dien-van',N'Một mảnh ruộng nhỏ, một căn nhà tranh và những ngày bình yên bên người thân.'),
 ('dien-van',N'Từ tay trắng, cô từng bước xây dựng cuộc sống no đủ nơi thôn quê.'),
 ('dien-van',N'Chuyện làng quê giản dị mà ấm áp.'),
 ('cung-dau',N'Chốn hậu cung nhiều quy củ, mỗi lời nói đều có thể trở thành mưu kế.'),
 ('cung-dau',N'Một tân phi lặng lẽ quan sát, chờ đúng thời cơ để lật ngược thế cờ.'),
 ('cung-dau',N'Quyền lực, sủng ái và cái giá của lòng người.'),
 ('phieu-luu',N'Một tấm bản đồ cũ dẫn nhóm bạn đến nơi chưa từng có trong sách vở.'),
 ('phieu-luu',N'Mỗi chặng đường là một thử thách, mỗi người đồng hành là một bí ẩn.'),
 ('phieu-luu',N'Kho báu thật sự có lẽ nằm ở chính hành trình.')
) v (Slug, Body);
GO

/* TE: title endings (global) */
INSERT #lex (Kind, Slug, Body) SELECT 'TE', '', Body FROM (VALUES
 (N'Chi Lộ'),(N'Truyền Kỳ'),(N'Ký'),(N'Khởi Đầu'),(N'Hồi Ức'),(N'Chi Chiến'),
 (N'Phần Một'),(N'Ngoại Truyện'),(N'Huyền Thoại'),(N'Của Tôi'),(N'Không Thể Quên'),(N'Nơi Ấy')
) v (Body);
GO

/* CHT: chapter title phrases */
INSERT #lex (Kind, Slug, Body) SELECT 'CHT', '', Body FROM (VALUES
 (N'Khởi đầu mới'),(N'Cuộc gặp gỡ bất ngờ'),(N'Lời hứa năm xưa'),(N'Ngã rẽ định mệnh'),(N'Bóng tối ập đến'),
 (N'Ánh sáng cuối đường'),(N'Bí mật được hé lộ'),(N'Người lạ trong đêm'),(N'Trận chiến đầu tiên'),(N'Giọt nước mắt'),
 (N'Kẻ thù cũ'),(N'Con đường phía trước'),(N'Sự thật phũ phàng'),(N'Ký ức trở về'),(N'Hy vọng mong manh'),
 (N'Cơn bão sắp tới'),(N'Một lựa chọn khó khăn'),(N'Tin tức từ xa'),(N'Cuộc đối đầu'),(N'Phút bình yên'),
 (N'Lời cảnh báo'),(N'Chuyến đi xa'),(N'Thử thách mới'),(N'Món quà bất ngờ'),(N'Đêm không ngủ'),
 (N'Ngày đoàn tụ'),(N'Quyết định cuối cùng'),(N'Dấu vết cũ'),(N'Lời tạm biệt'),(N'Hồi kết')
) v (Body);
GO

/* NF / NM / NG: Vietnamese family, middle and given names */
INSERT #lex (Kind, Slug, Body) SELECT 'NF', '', Body FROM (VALUES
 (N'Nguyễn'),(N'Trần'),(N'Lê'),(N'Phạm'),(N'Hoàng'),(N'Huỳnh'),(N'Phan'),(N'Vũ'),(N'Võ'),(N'Đặng'),
 (N'Bùi'),(N'Đỗ'),(N'Hồ'),(N'Ngô'),(N'Dương'),(N'Lý'),(N'Đinh'),(N'Mai'),(N'Trịnh'),(N'Lương')
) v (Body);
INSERT #lex (Kind, Slug, Body) SELECT 'NM', '', Body FROM (VALUES
 (N'Văn'),(N'Thị'),(N'Minh'),(N'Quốc'),(N'Thanh'),(N'Hữu'),(N'Ngọc'),(N'Anh'),(N'Gia'),(N'Bảo')
) v (Body);
INSERT #lex (Kind, Slug, Body) SELECT 'NG', '', Body FROM (VALUES
 (N'An'),(N'Bình'),(N'Châu'),(N'Dũng'),(N'Giang'),(N'Hà'),(N'Hải'),(N'Hạnh'),(N'Hiếu'),(N'Hoa'),
 (N'Hùng'),(N'Hương'),(N'Khánh'),(N'Lan'),(N'Linh'),(N'Long'),(N'Mai'),(N'Nam'),(N'Ngân'),(N'Nhung'),
 (N'Phong'),(N'Phúc'),(N'Quân'),(N'Quỳnh'),(N'Sơn'),(N'Tâm'),(N'Thảo'),(N'Thắng'),(N'Thịnh'),(N'Trang'),
 (N'Trung'),(N'Tú'),(N'Tuấn'),(N'Uyên'),(N'Vân'),(N'Việt'),(N'Vinh'),(N'Yến'),(N'Duy'),(N'Khoa')
) v (Body);
GO

/* PA / PB: pen-name parts (225 distinct pairs) */
INSERT #lex (Kind, Slug, Body) SELECT 'PA', '', Body FROM (VALUES
 (N'Thanh'),(N'Mộc'),(N'Vân'),(N'Lạc'),(N'Hàn'),(N'Bạch'),(N'Tử'),(N'Minh'),(N'Nguyệt'),(N'Phong'),
 (N'Hoài'),(N'Diệp'),(N'Cẩm'),(N'Tịnh'),(N'Lăng')
) v (Body);
INSERT #lex (Kind, Slug, Body) SELECT 'PB', '', Body FROM (VALUES
 (N'Phi'),(N'Lan'),(N'Du'),(N'Thiên'),(N'Nhi'),(N'Hạ'),(N'Khê'),(N'Vũ'),(N'Tuyết'),(N'An'),
 (N'Dương'),(N'Lam'),(N'Ca'),(N'Trúc'),(N'Sơn')
) v (Body);
GO

/* TAG: 60 tags */
INSERT #lex (Kind, Slug, Body) SELECT 'TAG', '', Body FROM (VALUES
 (N'Hệ thống'),(N'Phản diện'),(N'Nữ cường'),(N'Ngược tâm'),(N'Sủng'),(N'Hài hước'),(N'Học viện'),(N'Tu luyện'),(N'Báo thù'),(N'Trùng sinh'),
 (N'Xuyên không'),(N'Cổ đại'),(N'Hiện đại'),(N'Mạt thế'),(N'Dị năng'),(N'Quân đội'),(N'Kinh doanh'),(N'Showbiz'),(N'Thanh xuân'),(N'Gia đấu'),
 (N'Cung đấu'),(N'Điền viên'),(N'Mỹ thực'),(N'Y thuật'),(N'Vô địch'),(N'Thú cưng'),(N'Ma pháp'),(N'Kiếm sĩ'),(N'Võ thuật'),(N'Giang hồ'),
 (N'Trinh thám'),(N'Hồi hộp'),(N'Kinh dị'),(N'Ma quái'),(N'Thần thoại'),(N'Dị giới'),(N'Phiêu lưu'),(N'Du hành thời gian'),(N'Hoán đổi'),(N'Hôn nhân'),
 (N'Ngọt ngào'),(N'Ngược luyến'),(N'Hài kịch'),(N'Đời thường'),(N'Thanh mai trúc mã'),(N'Ân oán'),(N'Lịch sử'),(N'Quân sự'),(N'Chiến tranh'),(N'Game'),
 (N'Esports'),(N'Trí tuệ nhân tạo'),(N'Robot'),(N'Không gian'),(N'Sinh tồn'),(N'Giải đố'),(N'Chữa lành'),(N'Tình bạn'),(N'Gia đình'),(N'Trưởng thành')
) v (Body);
GO

/* RP / RN / RC: review lines for praise (4-5 stars), neutral (3), criticism (1-2) */
INSERT #lex (Kind, Slug, Body) SELECT 'RP', '', Body FROM (VALUES
 (N'Truyện hay, cốt truyện cuốn hút, đọc một mạch không dừng được.'),
 (N'Nhân vật xây dựng rất có hồn, mình đã khóc ở những chương cuối.'),
 (N'Văn phong mượt mà, tình tiết hợp lý, đáng đọc từ đầu đến cuối.'),
 (N'Một trong những bộ hay nhất mình từng đọc trên trang này, chấm điểm tuyệt đối.'),
 (N'Mạch truyện chặt chẽ, nhiều chi tiết bất ngờ, mong tác giả ra chương đều đặn.'),
 (N'Đọc xong vẫn còn đọng lại nhiều cảm xúc, rất cảm ơn tác giả.'),
 (N'Truyện nhẹ nhàng nhưng sâu sắc, đọc rất thư giãn sau một ngày dài.'),
 (N'Cách kể chuyện lôi cuốn, mỗi chương đều để lại một câu hỏi khiến mình muốn đọc tiếp.')
) v (Body);
INSERT #lex (Kind, Slug, Body) SELECT 'RN', '', Body FROM (VALUES
 (N'Truyện ổn, đoạn đầu hơi chậm nhưng càng về sau càng hấp dẫn.'),
 (N'Ý tưởng khá hay nhưng cách triển khai còn chưa đều tay.'),
 (N'Đọc được, có vài chương hơi dài dòng nhưng nhìn chung vẫn đáng theo dõi.'),
 (N'Nhân vật chính chưa thật sự nổi bật, bù lại bối cảnh xây dựng khá công phu.'),
 (N'Có điểm sáng nhưng cũng có chỗ thiếu logic, hy vọng tác giả sẽ chỉnh lại.'),
 (N'Nội dung bình thường, hợp để đọc giải trí.'),
 (N'Mở đầu tốt, giữa truyện hơi loãng, mong phần sau khá hơn.'),
 (N'Không quá xuất sắc nhưng cũng không đến nỗi tệ, đọc giết thời gian thì được.')
) v (Body);
INSERT #lex (Kind, Slug, Body) SELECT 'RC', '', Body FROM (VALUES
 (N'Cốt truyện rời rạc, nhiều tình tiết không thuyết phục, mình đọc không nổi.'),
 (N'Nhân vật hành động thiếu logic, đọc mà thấy khó chịu.'),
 (N'Kéo dài lê thê, nhiều chương không có tình tiết gì mới.'),
 (N'Văn phong còn non, nhiều lỗi diễn đạt làm mất hứng khi đọc.'),
 (N'Kỳ vọng nhiều nhưng cái kết quá vội vàng, hơi thất vọng.'),
 (N'Ý tưởng không mới và triển khai cũng chưa tốt.'),
 (N'Đọc được vài chương thì bỏ, không bắt được nhịp truyện.'),
 (N'Nội dung lặp lại nhiều, cần biên tập lại gọn hơn.')
) v (Body);
GO

/* LST: reading-list names */
INSERT #lex (Kind, Slug, Body) SELECT 'LST', '', Body FROM (VALUES
 (N'Đang đọc'),(N'Đọc sau'),(N'Yêu thích'),(N'Truyện hay'),(N'Chờ hoàn thành'),
 (N'Đọc cuối tuần'),(N'Đọc lại'),(N'Top của tôi'),(N'Nhẹ nhàng'),(N'Hồi hộp')
) v (Body);
GO

/* BAN / HID / REJ / BIO / INT: reasons, notes, short texts */
INSERT #lex (Kind, Slug, Body) SELECT 'BAN', '', Body FROM (VALUES
 (N'Đăng nội dung spam'),(N'Vi phạm quy định cộng đồng'),(N'Nhiều lần quấy rối người dùng khác')) v (Body);
INSERT #lex (Kind, Slug, Body) SELECT 'HID', '', Body FROM (VALUES
 (N'Nội dung vi phạm quy định cộng đồng'),(N'Bị báo cáo sao chép nội dung'),(N'Chờ tác giả chỉnh sửa theo yêu cầu')) v (Body);
INSERT #lex (Kind, Slug, Body) SELECT 'REJ', '', Body FROM (VALUES
 (N'Hồ sơ chưa đủ thông tin'),(N'Bút danh chưa phù hợp'),(N'Chưa có kế hoạch sáng tác cụ thể')) v (Body);
INSERT #lex (Kind, Slug, Body) SELECT 'BIO', '', Body FROM (VALUES
 (N'Yêu thích những câu chuyện về tình người và hành trình trưởng thành.'),
 (N'Viết truyện vào những buổi tối rảnh rỗi, rất mong nhận được góp ý của bạn đọc.'),
 (N'Thích khám phá các thể loại khác nhau và thử sức với những ý tưởng mới.'),
 (N'Tác giả tự do, đang hoàn thiện bộ truyện đầu tay.'),
 (N'Tin rằng mỗi câu chuyện đều xứng đáng được kể đến cùng.'),
 (N'Cảm ơn bạn đã ghé thăm, chúc bạn đọc truyện vui vẻ.')) v (Body);
INSERT #lex (Kind, Slug, Body) SELECT 'INT', '', Body FROM (VALUES
 (N'Tôi đã viết truyện được vài năm và muốn chia sẻ tác phẩm của mình với nhiều bạn đọc hơn.'),
 (N'Tôi có sẵn dàn ý cho một bộ truyện dài và muốn đăng tải đều đặn mỗi tuần.'),
 (N'Tôi là người yêu truyện và mong muốn thử sức sáng tác cùng cộng đồng.'),
 (N'Tôi đang viết dở một bộ truyện và cần nơi để đăng và nhận phản hồi từ độc giả.'),
 (N'Tôi dự định viết các truyện ngắn theo nhiều thể loại và đăng lên đây.'),
 (N'Tôi từng đăng truyện ở nơi khác và muốn chuyển sang nền tảng này để quản lý tốt hơn.')) v (Body);
GO

INSERT seed.Lex (Kind, Slug, Idx, Body)
SELECT Kind, Slug, ROW_NUMBER() OVER (PARTITION BY Kind, Slug ORDER BY Body COLLATE Latin1_General_100_BIN2), Body
FROM #lex;
DROP TABLE #lex;
GO

/* pick the Idx-th line of a kind: r in [0,1) -> uniform choice */
CREATE OR ALTER FUNCTION seed.fn_Lex (@Kind VARCHAR(8), @Slug VARCHAR(40), @r FLOAT)
RETURNS TABLE
AS RETURN
SELECT l.Body
FROM seed.Lex l
WHERE l.Kind = @Kind AND l.Slug = @Slug
  AND l.Idx = 1 + CAST(FLOOR(@r * (SELECT COUNT(*) FROM seed.Lex c WHERE c.Kind = @Kind AND c.Slug = @Slug)) AS INT);
GO

/* ---------- sanity checks ---------- */
DECLARE @bad NVARCHAR(400) = (
    SELECT STRING_AGG(CONCAT(Kind, ':', Slug, '=', Cnt), ', ')
    FROM (SELECT Kind, Slug, COUNT(*) AS Cnt FROM seed.Lex GROUP BY Kind, Slug) c
    WHERE (Kind IN ('TN','TA','DS') AND Cnt <> 3)
       OR (Kind = 'SENT' AND Cnt < 90)
       OR (Kind = 'TAG' AND Cnt <> 60)
       OR (Kind = 'NF' AND Cnt <> 20) OR (Kind = 'NM' AND Cnt <> 10) OR (Kind = 'NG' AND Cnt <> 40)
       OR (Kind IN ('PA','PB') AND Cnt <> 15)
       OR (Kind IN ('RP','RN','RC') AND Cnt <> 8)
       OR (Kind = 'CHT' AND Cnt <> 30) OR (Kind = 'TE' AND Cnt <> 12) OR (Kind = 'LST' AND Cnt <> 10));
IF @bad IS NOT NULL THROW 50111, N'seed.Lex has an unexpected number of lines for some kinds (see message text)', 1;
IF (SELECT COUNT(DISTINCT Slug) FROM seed.Lex WHERE Kind = 'TN') <> 20
    THROW 50112, N'seed.Lex must hold title words for exactly 20 genres', 1;
GO

SELECT Kind, COUNT(*) AS Lines FROM seed.Lex GROUP BY Kind ORDER BY Kind;
SELECT RefNow FROM seed.Param;
SELECT COUNT(*) AS DistinctSlugs FROM (SELECT DISTINCT sl.slug FROM seed.Lex l CROSS APPLY seed.fn_Slug(l.Body) sl WHERE l.Kind = 'TAG') x;   -- expect 60
GO
