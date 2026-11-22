import type { ChapterRead, ReadingProgress } from '../../src/types/reading';
import { storyDetail } from './story';

const PARAGRAPHS = [
  'Trăng rằm tháng Bảy lên chậm. Ông Tư ngồi ở mũi đò, tay giữ cây đèn bão đã cũ, nhìn mặt sông Hương phẳng như tấm lụa người ta trải ra phơi.',
  'Gió từ phía Kim Long thổi xuống, mang theo mùi bùn non và tiếng mái chèo khua nước từ đâu xa lắm. Ông biết giờ này chẳng còn con đò nào chạy. Bến Thương Bạc đã ngủ từ lúc chuông chùa Thiên Mụ gõ tiếng cuối cùng.',
  'Vậy mà có người gọi đò.',
  'Tiếng gọi không lớn, chỉ vừa đủ để ông nghe. Một giọng đàn bà, nhẹ như sợi chỉ: “Ông ơi, cho tôi qua sông với.”',
  'Ông Tư nâng đèn lên. Ánh vàng loang ra trên mặt nước, chạm tới bờ bên kia, nơi có một bóng áo trắng đứng lặng giữa đám lau. Ông nheo mắt. Ông đã chở khách bốn mươi năm, nhận mặt được cả những người chỉ qua sông một lần. Người đàn bà này, ông chưa gặp bao giờ.',
  '“Khuya rồi, cô đi đâu?” ông hỏi.',
  '“Tôi về nhà.” Bóng áo trắng ngừng một chút. “Nhà tôi ở bên kia, từ lâu rồi.”',
  'Ông Tư không hỏi thêm. Ông đặt cây đèn xuống mũi đò, cầm lấy mái chèo. Nước sông đêm nay lạnh hơn mọi khi, và lúc con đò rời bến, ngọn đèn trong tay ông bỗng sáng lên như vừa được ai châm thêm dầu.',
];

/** Long enough to scroll: the board's text three times, a section heading and a quote. */
export const chapterHtml = [
  ...PARAGRAPHS.map((p) => `<p>${p}</p>`),
  '<h3>Bờ bên kia</h3>',
  ...PARAGRAPHS.map((p) => `<p>${p}</p>`),
  '<blockquote><p>Đèn thì để soi người sống. Người đi rồi, chỉ cần nhớ đường.</p></blockquote>',
  ...PARAGRAPHS.map((p) => `<p>${p}</p>`),
].join('');

const story = {
  storyId: storyDetail.storyId,
  slug: storyDetail.slug,
  title: storyDetail.title,
  author: { authorId: storyDetail.author.authorId, penName: storyDetail.author.penName },
};

/** Chapter 4 (volume 2), with a previous and a next chapter. */
export const chapterRead: ChapterRead = {
  chapterId: 5004,
  chapterNo: 4,
  title: 'Chương 4: Bến Thương Bạc',
  content: chapterHtml,
  wordCount: 3_218,
  publishedAt: '2026-10-15T03:00:00Z',
  viewCount: 6_901,
  story,
  volume: { volumeId: 2, volumeNo: 2, title: 'Đèn trên mặt nước' },
  prevChapterId: 5003,
  nextChapterId: 5005,
};

/** First chapter: no previous chapter → the story splash is shown. */
export const firstChapterRead: ChapterRead = {
  ...chapterRead,
  chapterId: 5001,
  chapterNo: 1,
  title: 'Chương 1: Bến Thương Bạc',
  volume: { volumeId: 1, volumeNo: 1, title: 'Bến cũ' },
  prevChapterId: undefined,
  nextChapterId: 5002,
};

/** Last chapter (loose): no next chapter. */
export const lastChapterRead: ChapterRead = {
  ...chapterRead,
  chapterId: 5006,
  chapterNo: 6,
  title: 'Chương 6: Người gác đèn',
  volume: undefined,
  prevChapterId: 5005,
  nextChapterId: undefined,
};

export const readingProgress: ReadingProgress = {
  storyId: storyDetail.storyId,
  chapterId: 5004,
  chapterNo: 4,
  chapterTitle: 'Bến Thương Bạc',
  scrollPercent: 38.4,
  updatedAt: '2026-11-10T13:20:00Z',
};
