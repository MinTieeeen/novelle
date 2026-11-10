import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Users } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { queryKeys } from '@/api/queryKeys';
import { getPublicProfile } from '@/api/users';
import { ErrorResult } from '@/components/common/ErrorResult';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROLE_LABEL } from '@/types/user';
import { hasCode } from '@/utils/errors';
import { formatDate, formatNumber } from '@/utils/format';

/**
 * /users/:username: public profile (no email or status). Authors also show their pen name, verified tick
 * and follower count, with a link to the author page. Public reading lists come with FE4.
 */
export default function PublicProfilePage() {
  const { username = '' } = useParams();
  const profile = useQuery({
    queryKey: queryKeys.users.profile(username),
    queryFn: () => getPublicProfile(username),
  });

  if (profile.isPending) return <ProfileSkeleton />;

  if (profile.isError) {
    return hasCode(profile.error, 'USER_NOT_FOUND', 'NOT_FOUND') ? (
      <ErrorResult
        variant="not-found"
        title="Không tìm thấy người dùng này"
        description="Tên người dùng có thể đã đổi, hoặc tài khoản không còn hoạt động."
        action={
          <Button asChild>
            <Link to="/">Về trang chủ</Link>
          </Button>
        }
      />
    ) : (
      <ErrorResult onRetry={() => profile.refetch()} />
    );
  }

  const p = profile.data;
  return (
    <div className="flex max-w-[760px] flex-col gap-8">
      <Card className="py-0">
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
          <UserAvatar name={p.displayName} avatarUrl={p.avatarUrl} size="lg" verified={p.author?.isVerified} />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-title-1 font-semibold">{p.displayName}</h1>
                <Badge variant={p.role === 'AUTHOR' ? 'default' : 'outline'}>{ROLE_LABEL[p.role]}</Badge>
              </div>
              <p className="text-small text-muted-foreground">
                @{p.username} · Tham gia từ {formatDate(p.createdAt)}
              </p>
            </div>
            {p.bio ? <p className="whitespace-pre-line">{p.bio}</p> : <p className="text-muted-foreground">Chưa có giới thiệu.</p>}
          </div>
        </CardContent>
      </Card>

      {p.author && (
        <Card className="py-0">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-small text-muted-foreground">Bút danh</p>
              <p className="font-serif text-title-3 font-semibold">{p.author.penName}</p>
              <p className="inline-flex items-center gap-1.5 text-small text-muted-foreground">
                <Users className="size-4" strokeWidth={1.75} aria-hidden />
                <span className="num">{formatNumber(p.author.followerCount)}</span> người theo dõi
              </p>
              {p.author.bio && <p className="mt-2 whitespace-pre-line">{p.author.bio}</p>}
            </div>
            <Button variant="outline" asChild>
              <Link to={`/authors/${p.author.authorId}`}>
                Xem trang tác giả <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex max-w-[760px] flex-col gap-8" aria-busy="true" aria-label="Đang tải hồ sơ">
      <div className="flex gap-6 rounded-lg border border-border bg-card p-6">
        <Skeleton className="size-18 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      </div>
    </div>
  );
}
