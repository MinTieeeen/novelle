import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { setAuthorFollow, setStoryFollow, getAuthorFollow, getStoryFollow } from '@/api/library';
import { queryKeys } from '@/api/queryKeys';
import { useAuth } from '@/auth/AuthProvider';
import { useAuthModal } from '@/auth/AuthModalProvider';
import type { AuthorFollowStatus, FollowStatus } from '@/types/library';
import type { AuthorProfile, StoryDetail } from '@/types/story';
import type { Me } from '@/types/user';
import { errorMessage, hasCode } from '@/utils/errors';

/**
 * Runs `action` now for a logged-in user; a guest gets the login popup first and the action runs right
 * after logging in. Returns false when the user may not do it at all (admins).
 */
export function useRequireLogin() {
  const { user } = useAuth();
  const authModal = useAuthModal();
  return useCallback(
    (action: (me: Me) => void) => {
      if (user) {
        action(user);
        return;
      }
      authModal.open('login', { onSuccess: (me) => action(me) });
    },
    [user, authModal],
  );
}

/** Shown when a follow request fails: the toggle is rolled back first. Rate limits are toasted globally. */
function followError(e: unknown) {
  if (hasCode(e, 'RATE_LIMITED', 'UNAUTHENTICATED', 'ACCOUNT_BANNED')) return;
  if (hasCode(e, 'CANNOT_FOLLOW_SELF')) toast.error('Bạn không thể tự theo dõi chính mình.');
  else if (hasCode(e, 'STORY_NOT_FOUND', 'AUTHOR_NOT_FOUND')) toast.error('Nội dung này không còn công khai.');
  else toast.error(errorMessage(e));
}

/**
 * "Theo dõi" of a story (F1–F3): status loaded for logged-in readers / authors, toggled optimistically,
 * rolled back on error; the follower count on the story page comes from the response.
 */
export function useStoryFollow(story: Pick<StoryDetail, 'storyId' | 'slug'> | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const requireLogin = useRequireLogin();
  const storyId = story?.storyId ?? 0;
  const key = queryKeys.follow.story(storyId);

  const status = useQuery({
    queryKey: key,
    queryFn: () => getStoryFollow(storyId),
    enabled: !!story && !!user && user.role !== 'ADMIN',
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationKey: ['follow-story', storyId],
    mutationFn: (follow: boolean) => setStoryFollow(storyId, follow),
    onMutate: async (follow) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FollowStatus>(key);
      queryClient.setQueryData<FollowStatus>(key, {
        storyId,
        following: follow,
        followCount: (previous?.followCount ?? 0) + (follow === previous?.following ? 0 : follow ? 1 : -1),
      });
      return { previous };
    },
    onError: (e, _follow, ctx) => {
      queryClient.setQueryData(key, ctx?.previous);
      followError(e);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      if (story) {
        queryClient.setQueryData<StoryDetail>(queryKeys.stories.detail(story.slug), (s) => (s ? { ...s, followCount: data.followCount } : s));
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.library.follows });
    },
  });

  const following = status.data?.following ?? false;
  const toggle = useCallback(() => {
    // After logging in from the popup the status is unknown yet: a guest's click always means "follow".
    requireLogin((me) => {
      if (me.role === 'ADMIN') return;
      mutation.mutate(user ? !following : true);
    });
  }, [requireLogin, mutation, user, following]);

  return { following, toggle, ready: !user || status.isSuccess, pending: mutation.isPending };
}

/** "Theo dõi" of an author (F4–F6), same pattern; the count lives in the author page cache. */
export function useAuthorFollow(author: Pick<AuthorProfile, 'authorId'> | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const requireLogin = useRequireLogin();
  const authorId = author?.authorId ?? 0;
  const key = queryKeys.follow.author(authorId);

  const status = useQuery({
    queryKey: key,
    queryFn: () => getAuthorFollow(authorId),
    enabled: !!author && !!user && user.role !== 'ADMIN',
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationKey: ['follow-author', authorId],
    mutationFn: (follow: boolean) => setAuthorFollow(authorId, follow),
    onMutate: async (follow) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AuthorFollowStatus>(key);
      queryClient.setQueryData<AuthorFollowStatus>(key, {
        authorId,
        following: follow,
        followerCount: (previous?.followerCount ?? 0) + (follow === previous?.following ? 0 : follow ? 1 : -1),
      });
      return { previous };
    },
    onError: (e, _follow, ctx) => {
      queryClient.setQueryData(key, ctx?.previous);
      followError(e);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      queryClient.setQueryData<AuthorProfile>(queryKeys.authors.detail(authorId), (a) => (a ? { ...a, followerCount: data.followerCount } : a));
      void queryClient.invalidateQueries({ queryKey: queryKeys.library.authors });
    },
  });

  const following = status.data?.following ?? false;
  const toggle = useCallback(() => {
    requireLogin((me) => {
      if (me.role === 'ADMIN') return;
      mutation.mutate(user ? !following : true);
    });
  }, [requireLogin, mutation, user, following]);

  return { following, toggle, ready: !user || status.isSuccess, pending: mutation.isPending };
}
