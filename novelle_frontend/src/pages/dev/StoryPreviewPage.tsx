import { useState } from 'react';
import { authorProfile, genres, home, storyCard, storyDetail, stories } from '../../../e2e/fixtures/story';
import { AppPagination } from '@/components/common/AppPagination';
import { PageHeader } from '@/components/common/PageHeader';
import { GenreBar } from '@/components/layout/GenreBar';
import { HeaderSearch } from '@/components/layout/HeaderSearch';
import { AuthorHeader, SameAuthorList } from '@/components/story/AuthorBlocks';
import { ChapterToc } from '@/components/story/ChapterToc';
import { GenreGrid, TopList, UpdatedList } from '@/components/story/HomeLists';
import { RatingStars } from '@/components/story/RatingStars';
import { StoryAbout } from '@/components/story/StoryAbout';
import { AgeBadge, GenreBadge, StatusBadge } from '@/components/story/StoryBadges';
import { StoryCard } from '@/components/story/StoryCard';
import { StoryCover } from '@/components/story/StoryCover';
import { ActiveFilterChips, StoryFilters } from '@/components/story/StoryFilters';
import { StoryHero } from '@/components/story/StoryHero';
import { StoryListItem } from '@/components/story/StoryListItem';
import { StoryShelf } from '@/components/story/StoryShelf';
import { StoryDetailSkeleton, StoryGridSkeleton, StoryListSkeleton, StoryRowsSkeleton } from '@/components/story/StorySkeletons';
import { firstChapter, type Tag } from '@/types/story';
import { DEFAULT_SEARCH, type StorySearchParams } from '@/types/storySearch';

const TAGS: Tag[] = [
  { tagId: 1, name: 'báo thù', slug: 'bao-thu', usageCount: 120 },
  { tagId: 2, name: 'tu luyện', slug: 'tu-luyen', usageCount: 98 },
  { tagId: 3, name: 'Huế', slug: 'hue', usageCount: 12 },
  { tagId: 4, name: 'tâm linh', slug: 'tam-linh', usageCount: 40 },
];

const LONG_ABOUT = Array.from({ length: 3 }, () => storyDetail.description).join('\n\n');

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 font-sans text-label font-semibold tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** Dev-only preview of the FE2 catalog + story components (/dev/story), with fixture data. */
export default function StoryPreviewPage() {
  const [filters, setFilters] = useState<StorySearchParams>({
    ...DEFAULT_SEARCH,
    genres: ['kiem-hiep', 'huyen-huyen'],
    tags: ['bao-thu'],
    status: 'ONGOING',
    minRating: 4,
    minChapters: 50,
  });
  const [tagQuery, setTagQuery] = useState('');
  const [page, setPage] = useState(3);
  const patch = (p: Partial<StorySearchParams>) => setFilters((f) => ({ ...f, page: 0, ...p }));
  const tagNames = Object.fromEntries(TAGS.map((t) => [t.slug, t.name]));
  const first = firstChapter(storyDetail);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Truyện (FE2)" description="Bản xem trước component catalog + story với dữ liệu mẫu" />

      <Block title="Thanh thể loại và ô tìm kiếm header">
        <div className="-mx-4 overflow-hidden border-y border-border sm:-mx-6">
          <GenreBar genres={[...genres, ...genres.map((g) => ({ ...g, genreId: g.genreId + 50, slug: `${g.slug}-2` }))]} activeSlug="kiem-hiep" />
          <GenreBar genres={undefined} activeSlug={null} loading />
        </div>
        <HeaderSearch />
      </Block>

      <Block title="Bìa: 5 tông, có ảnh, ảnh lỗi (→ bìa mặc định), các cỡ">
        <div className="flex flex-wrap items-end gap-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="w-[140px]">
              <StoryCover storyId={i} title={storyCard(i).title} penName={storyCard(i).author.penName} />
            </div>
          ))}
          <div className="w-[140px]">
            <StoryCover storyId={9} title="Ảnh lỗi" penName="Không có" coverUrl="/covers/khong-co/01.jpg" />
          </div>
          <StoryCover storyId={1} title="Mùa Nước Nổi" size="sm" />
          <StoryCover storyId={2} title="x" size="xs" />
        </div>
      </Block>

      <Block title="Badge và sao">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status="ONGOING" />
          <StatusBadge status="COMPLETED" />
          <StatusBadge status="HIATUS" />
          <AgeBadge ageRating="18+" />
          <AgeBadge ageRating="13+" />
          <GenreBadge name="Kiếm hiệp" />
          <RatingStars value={4.6} count={312} />
          <RatingStars value={3.4} variant="stars" />
          <RatingStars value={0} count={0} />
        </div>
      </Block>

      <Block title="Thẻ truyện và kệ">
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))] sm:gap-x-6">
          {stories(6).map((s) => (
            <StoryCard key={s.storyId} story={s} />
          ))}
        </div>
        <StoryShelf id="dev-shelf" title="Đánh giá cao" stories={home.topRated} moreTo="/search?sort=rating" />
      </Block>

      <Block title="Trang chủ: Mới cập nhật + Xem nhiều nhất + Thể loại">
        <div className="flex flex-wrap items-start gap-8">
          <div className="min-w-0 flex-[999_1_560px]">
            <UpdatedList stories={home.latestUpdated} moreTo="/search?sort=updated" />
          </div>
          <div className="min-w-0 flex-[1_1_300px]">
            <TopList stories={home.mostViewed} moreTo="/search?sort=views" />
          </div>
        </div>
        <GenreGrid genres={genres} />
      </Block>

      <Block title="Tìm kiếm: bộ lọc, chip, dòng kết quả, phân trang">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <StoryFilters
            className="lg:w-[300px] lg:shrink-0"
            filters={filters}
            onChange={patch}
            onReset={() => setFilters({ ...DEFAULT_SEARCH })}
            genres={genres}
            tagSuggestions={tagQuery ? TAGS.filter((t) => t.name.includes(tagQuery.toLowerCase())) : []}
            onTagQueryChange={setTagQuery}
            tagNames={tagNames}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <ActiveFilterChips filters={filters} genres={genres} tagNames={tagNames} onChange={patch} />
            {stories(3).map((s) => (
              <StoryListItem key={s.storyId} story={s} />
            ))}
            <AppPagination page={page} totalPages={12} totalElements={233} onPageChange={setPage} />
            <AppPagination page={0} totalPages={2} onPageChange={() => {}} />
          </div>
        </div>
      </Block>

      <Block title="Chi tiết truyện">
        <StoryHero story={storyDetail} firstChapterId={first?.chapterId ?? null} />
        <StoryHero story={{ ...storyDetail, ratingCount: 0, tags: [], volumes: [], looseChapters: [] }} firstChapterId={null} />
        <div className="flex flex-col gap-10 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-10">
            <StoryAbout description={LONG_ABOUT} />
            <StoryAbout description="Một đoạn giới thiệu ngắn." />
            <ChapterToc volumes={storyDetail.volumes} looseChapters={storyDetail.looseChapters} chapterCount={6} currentChapterNo={4} currentChapterId={5004} />
            <ChapterToc volumes={[]} looseChapters={[]} chapterCount={0} />
          </div>
          <div className="lg:w-[300px]">
            <SameAuthorList stories={stories(4, 1)} authorId={10} penName="Mộc Lan" />
          </div>
        </div>
      </Block>

      <Block title="Trang tác giả">
        <AuthorHeader author={authorProfile} />
        <AuthorHeader author={{ ...authorProfile, isVerified: false, bio: null, stats: { ...authorProfile.stats, ratingCount: 0 } }} />
      </Block>

      <Block title="Skeleton">
        <StoryRowsSkeleton count={3} />
        <StoryGridSkeleton count={6} />
        <StoryListSkeleton count={2} />
        <StoryDetailSkeleton />
      </Block>
    </div>
  );
}
