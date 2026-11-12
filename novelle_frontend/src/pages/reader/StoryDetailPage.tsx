import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getAuthorStories } from '@/api/authors';
import { queryKeys } from '@/api/queryKeys';
import { getProgress } from '@/api/reading';
import { getStory } from '@/api/stories';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorResult } from '@/components/common/ErrorResult';
import { StoryLibraryActions } from '@/components/library/StoryLibraryActions';
import { ContinueReadingButton } from '@/components/reader/ContinueReadingButton';
import { SameAuthorList } from '@/components/story/AuthorBlocks';
import { ChapterToc } from '@/components/story/ChapterToc';
import { StoryAbout } from '@/components/story/StoryAbout';
import { StoryHero } from '@/components/story/StoryHero';
import { StoryRatingsBlock } from '@/components/story/StoryRatingsBlock';
import { StoryDetailSkeleton } from '@/components/story/StorySkeletons';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { firstChapter } from '@/types/story';
import { hasCode } from '@/utils/errors';

/**
 * R3 · Chi tiết truyện (StoryDetail board): hero, "Giới thiệu", table of contents and, on the right,
 * "Cùng tác giả". A logged-in reader with a position gets "Đọc tiếp" and the "Đang đọc" row in the TOC
 * (FE3); "Theo dõi" + "Thêm vào tủ" in the hero's actionsSlot and the "Đánh giá" block under the TOC (FE4).
 */
export default function StoryDetailPage() {
  const { slug = '' } = useParams();
  const story = useQuery({ queryKey: queryKeys.stories.detail(slug), queryFn: () => getStory(slug), staleTime: 5 * 60_000 });
  const authorId = story.data?.author.authorId;
  const sameAuthor = useQuery({
    queryKey: queryKeys.authors.stories(authorId ?? 0, { size: 6 }),
    queryFn: () => getAuthorStories(authorId!, { size: 6 }),
    enabled: authorId != null,
    staleTime: 5 * 60_000,
  });
  // "Đọc tiếp": my position in this story (logged in only). 204 → null, errors just hide the button.
  const { user } = useAuth();
  const storyId = story.data?.storyId;
  const progress = useQuery({
    queryKey: queryKeys.readingProgress(storyId ?? 0),
    queryFn: () => getProgress(storyId!),
    enabled: !!user && storyId != null,
    retry: false,
  });
  const reading = user ? progress.data ?? null : null;
  useDocumentTitle(story.data?.title);

  if (story.isPending) return <StoryDetailSkeleton />;

  if (story.isError) {
    return hasCode(story.error, 'STORY_NOT_FOUND', 'NOT_FOUND') ? (
      <ErrorResult
        variant="not-found"
        title="Không tìm thấy truyện này"
        description="Truyện có thể đã bị gỡ, đang ẩn, hoặc đường dẫn đã đổi."
        action={
          <Button asChild>
            <Link to="/search">Tìm truyện khác</Link>
          </Button>
        }
      />
    ) : (
      <ErrorResult title="Chưa tải được truyện" onRetry={() => story.refetch()} />
    );
  }

  const s = story.data;
  const others = (sameAuthor.data?.items ?? []).filter((x) => x.storyId !== s.storyId).slice(0, 5);

  return (
    <>
      <StoryHero
        story={s}
        firstChapterId={firstChapter(s)?.chapterId ?? null}
        continueSlot={reading && <ContinueReadingButton progress={reading} />}
        actionsSlot={<StoryLibraryActions story={s} />}
      />
      <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col gap-12 lg:max-w-[760px]">
          <StoryAbout description={s.description} />
          {/* Remount when the position arrives, so the volume being read opens. */}
          <ChapterToc
            key={reading?.chapterId ?? 'none'}
            volumes={s.volumes}
            looseChapters={s.looseChapters}
            chapterCount={s.chapterCount}
            currentChapterId={reading?.chapterId}
            currentChapterNo={reading?.chapterNo}
          />
          <StoryRatingsBlock story={s} />
        </div>
        <div className="lg:sticky lg:top-[136px] lg:w-[300px] lg:shrink-0">
          <SameAuthorList stories={others} authorId={s.author.authorId} penName={s.author.penName} />
        </div>
      </div>
    </>
  );
}
