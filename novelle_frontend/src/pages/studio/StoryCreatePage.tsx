import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { queryKeys } from '@/api/queryKeys';
import { createStory } from '@/api/studio';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorResult } from '@/components/common/ErrorResult';
import { StoryForm } from '@/components/studio/StoryForm';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle, useGenres } from '@/hooks/useCatalog';
import { useCooldown } from '@/hooks/useCooldown';
import type { StoryValues } from '@/types/studio';
import { errorMessage, hasCode, retryAfterSeconds } from '@/utils/errors';

/**
 * S2 · Tạo truyện (/studio/stories/new, board StudioCreate): StoryForm in create mode; S2 creates a DRAFT
 * story, then its "Chương & tập" tab opens so the author can write the first chapter.
 */
export default function StoryCreatePage() {
  useDocumentTitle('Tạo truyện');
  const { user } = useAuth();
  const genres = useGenres();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cooldown = useCooldown();

  async function submit(v: StoryValues) {
    try {
      const story = await createStory({
        title: v.title,
        description: v.description || undefined,
        coverUrl: v.coverUrl || undefined,
        ageRating: v.ageRating,
        completionStatus: v.completionStatus,
        genreIds: v.genreIds,
        primaryGenreId: v.primaryGenreId,
        tags: v.tags,
      });
      queryClient.setQueryData(queryKeys.studio.story(story.storyId), story);
      void queryClient.invalidateQueries({ queryKey: ['studio', 'stories'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.studio.dashboard.overview });
      toast.success(`Đã tạo “${story.title}”. Viết chương đầu tiên rồi đăng truyện nhé.`);
      navigate(`/studio/stories/${story.storyId}`, { replace: true });
    } catch (e) {
      if (hasCode(e, 'RATE_LIMITED')) cooldown.start(retryAfterSeconds(e) ?? 60);
      else if (!hasCode(e, 'VALIDATION_FAILED')) toast.error(errorMessage(e));
      throw e;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2.5">
        <nav aria-label="Đường dẫn" className="text-small text-muted-foreground">
          <Link to="/studio" className="hover:text-foreground hover:underline">
            Truyện của tôi
          </Link>{' '}
          › Tạo truyện
        </nav>
        <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">Tạo truyện mới</h1>
      </header>
      {genres.isError ? (
        <ErrorResult title="Chưa tải được danh sách thể loại" onRetry={() => genres.refetch()} />
      ) : genres.data ? (
        <div className="max-w-[1000px]">
          <StoryForm mode="create" genres={genres.data} penName={user?.author?.penName ?? ''} onSubmit={submit} cancelTo="/studio" cooldown={cooldown.remaining} />
        </div>
      ) : (
        <Skeleton className="h-[640px] max-w-[1000px] rounded-lg" />
      )}
    </div>
  );
}
