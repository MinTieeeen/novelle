import { useAuth } from '@/auth/AuthProvider';
import { FollowButton } from '@/components/story/FollowButton';
import { useAuthorFollow } from '@/hooks/useFollow';
import type { AuthorProfile } from '@/types/story';

/**
 * AuthorHeader action (FE4): "Theo dõi" the author. Hidden for admins and on my own author page (pen
 * names are unique, and /me has no authorId); the backend still answers CANNOT_FOLLOW_SELF.
 */
export function AuthorFollowAction({ author }: { author: AuthorProfile }) {
  const { user } = useAuth();
  const follow = useAuthorFollow(author);
  if (user?.role === 'ADMIN' || (user?.author && user.author.penName === author.penName)) return null;
  return (
    <FollowButton
      following={follow.following}
      onToggle={follow.toggle}
      disabled={follow.pending || !follow.ready}
      target={`tác giả ${author.penName}`}
      className="self-start"
    />
  );
}
