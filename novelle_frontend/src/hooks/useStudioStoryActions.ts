import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/api/queryKeys';
import { deleteStory, publishStory, unpublishStory } from '@/api/studio';
import type { StudioStory } from '@/types/studio';
import { errorMessage, hasCode } from '@/utils/errors';

type Target = { storyId: number; slug: string; title: string };

/**
 * Publish (S7), unpublish (S8) and delete (S9) of one of my stories, shared by S1 and S3: toasts in the
 * words of the boards, the story cache set from the response, lists and the public page refreshed.
 */
export function useStudioStoryActions(options: { onDeleted?: (t: Target) => void } = {}) {
  const queryClient = useQueryClient();

  const refresh = (t: Target, story?: StudioStory) => {
    if (story) queryClient.setQueryData(queryKeys.studio.story(t.storyId), story);
    void queryClient.invalidateQueries({ queryKey: ['studio', 'stories'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.studio.dashboard.overview });
    void queryClient.invalidateQueries({ queryKey: queryKeys.stories.detail(t.slug) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.home });
  };

  const onError = (t: Target) => (e: unknown) => {
    if (hasCode(e, 'STORY_HAS_NO_CHAPTER')) toast.error('Hãy đăng ít nhất một chương trước khi đăng truyện.');
    else if (hasCode(e, 'STORY_HIDDEN')) {
      toast.error('Truyện đang bị quản trị viên ẩn, chưa đăng hay gỡ đăng được.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.studio.story(t.storyId) });
    } else if (hasCode(e, 'ALREADY_PROCESSED')) {
      toast.info('Trạng thái truyện vừa thay đổi. Đã tải lại.');
      refresh(t);
      void queryClient.invalidateQueries({ queryKey: queryKeys.studio.story(t.storyId) });
    } else if (!hasCode(e, 'RATE_LIMITED')) toast.error(errorMessage(e));
  };

  const publish = useMutation({
    mutationFn: (t: Target) => publishStory(t.storyId),
    onSuccess: (s, t) => {
      refresh(t, s);
      toast.success(`Đã đăng “${t.title}”. Người đọc đã thấy truyện.`);
    },
    onError: (e, t) => onError(t)(e),
  });

  const unpublish = useMutation({
    mutationFn: (t: Target) => unpublishStory(t.storyId),
    onSuccess: (s, t) => {
      refresh(t, s);
      toast.success(`Đã gỡ đăng “${t.title}”. Truyện chuyển về bản nháp.`);
    },
    onError: (e, t) => onError(t)(e),
  });

  const remove = useMutation({
    mutationFn: (t: Target) => deleteStory(t.storyId),
    onSuccess: (_d, t) => {
      queryClient.removeQueries({ queryKey: queryKeys.studio.story(t.storyId) });
      refresh(t);
      toast.success(`Đã xoá “${t.title}”.`);
      options.onDeleted?.(t);
    },
    onError: (e, t) => onError(t)(e),
  });

  const busyId = [publish, unpublish, remove].find((m) => m.isPending)?.variables?.storyId ?? null;
  return { publish, unpublish, remove, busyId };
}
