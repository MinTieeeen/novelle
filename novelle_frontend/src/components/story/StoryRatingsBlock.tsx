import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { queryKeys } from '@/api/queryKeys';
import { deleteRating, getMyRating, getRatings, saveRating } from '@/api/ratings';
import { useAuth } from '@/auth/AuthProvider';
import { useAuthModal } from '@/auth/AuthModalProvider';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RatingSection, type RatingMode } from '@/components/story/RatingSection';
import type { RatingValues } from '@/types/rating';
import type { StoryDetail } from '@/types/story';
import { errorMessage, hasCode } from '@/utils/errors';

const PAGE = 10;

/**
 * Ratings of the story page (D1–D4): summary + first page from D1, more reviews page by page, my rating
 * (D2) with save / delete. Save and delete update the average shown in the hero from the response.
 */
export function StoryRatingsBlock({ story }: { story: StoryDetail }) {
  const { user } = useAuth();
  const authModal = useAuthModal();
  const queryClient = useQueryClient();
  const storyId = story.storyId;
  const [confirmDelete, setConfirmDelete] = useState(false);

  // D1 page by page: the first page carries the summary, "Xem thêm đánh giá" reads the next one.
  const ratings = useInfiniteQuery({
    queryKey: queryKeys.ratings.list(storyId),
    queryFn: ({ pageParam }) => getRatings(storyId, { page: pageParam, size: PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.reviews.page + 1 < last.reviews.totalPages ? last.reviews.page + 1 : undefined),
    staleTime: 60_000,
  });

  const own = !!user?.author && user.author.penName === story.author.penName;
  const mode: RatingMode = !user ? 'guest' : user.role === 'ADMIN' ? 'admin' : own ? 'own-story' : 'form';

  const mine = useQuery({
    queryKey: queryKeys.ratings.mine(storyId),
    queryFn: () => getMyRating(storyId),
    enabled: mode === 'form',
  });

  const afterChange = (ratingAvg: number, ratingCount: number) => {
    queryClient.setQueryData<StoryDetail>(queryKeys.stories.detail(story.slug), (s) => (s ? { ...s, ratingAvg, ratingCount } : s));
    // exact: the key is a prefix of ratings.mine, which was just set from the response.
    void queryClient.invalidateQueries({ queryKey: queryKeys.ratings.list(storyId), exact: true });
  };

  async function save(values: RatingValues) {
    try {
      const res = await saveRating(storyId, values);
      queryClient.setQueryData(queryKeys.ratings.mine(storyId), res.rating);
      afterChange(res.ratingAvg, res.ratingCount);
      toast.success(mine.data ? 'Đã cập nhật đánh giá.' : 'Cảm ơn bạn đã đánh giá truyện.');
    } catch (e) {
      if (hasCode(e, 'CANNOT_RATE_OWN_STORY')) toast.error('Tác giả không tự đánh giá truyện của mình.');
      else if (hasCode(e, 'ADMIN_CANNOT_RATE')) toast.error('Quản trị viên không đánh giá truyện.');
      else if (!hasCode(e, 'VALIDATION_FAILED', 'RATE_LIMITED')) toast.error(errorMessage(e));
      throw e;
    }
  }

  const remove = useMutation({
    mutationFn: () => deleteRating(storyId),
    onSuccess: async () => {
      setConfirmDelete(false);
      queryClient.setQueryData(queryKeys.ratings.mine(storyId), null);
      toast.success('Đã xoá đánh giá của bạn.');
      // D4 returns nothing: read the new average from D1 again.
      const fresh = await getRatings(storyId, { page: 0, size: PAGE });
      afterChange(fresh.ratingAvg, fresh.ratingCount);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pages = ratings.data?.pages ?? [];
  const first = pages[0];

  return (
    <>
      <RatingSection
        ratings={first}
        moreReviews={pages.slice(1).flatMap((p) => p.reviews.items)}
        hasMore={!!ratings.hasNextPage}
        loadingMore={ratings.isFetchingNextPage}
        onLoadMore={() => void ratings.fetchNextPage()}
        mode={mode}
        mine={mode === 'form' ? (mine.data ?? null) : undefined}
        onSave={save}
        onDelete={() => setConfirmDelete(true)}
        onLogin={() => authModal.open('login')}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Xoá đánh giá của bạn?"
        confirmLabel="Xoá đánh giá"
        pendingLabel="Đang xoá…"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
