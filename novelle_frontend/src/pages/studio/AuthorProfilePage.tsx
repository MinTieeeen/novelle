import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/api/queryKeys';
import { getDashboardOverview, getStudioProfile, updateStudioProfile } from '@/api/studio';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorResult } from '@/components/common/ErrorResult';
import { AuthorProfileForm } from '@/components/studio/AuthorProfileForm';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useCatalog';
import type { AuthorProfileStudio, AuthorProfileValues } from '@/types/studio';
import { errorMessage, hasCode } from '@/utils/errors';

/**
 * S6 · Hồ sơ tác giả (/studio/profile, board StudioProfile): S10 + D1 for the preview counts; S11 sends only
 * what changed, then the session is refreshed so the header and sidebar show the new pen name.
 */
export default function AuthorProfilePage() {
  useDocumentTitle('Hồ sơ tác giả');
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: queryKeys.studio.profile, queryFn: getStudioProfile });
  const overview = useQuery({ queryKey: queryKeys.studio.dashboard.overview, queryFn: getDashboardOverview, staleTime: 60_000 });

  async function save(v: AuthorProfileValues) {
    const p = profile.data;
    if (!p) return;
    const body: { penName?: string; bio?: string } = {};
    if (v.penName !== p.penName) body.penName = v.penName;
    if (v.bio !== (p.bio ?? '')) body.bio = v.bio;
    if (!Object.keys(body).length) return;
    try {
      const next = await updateStudioProfile(body);
      queryClient.setQueryData<AuthorProfileStudio>(queryKeys.studio.profile, next);
      void queryClient.invalidateQueries({ queryKey: queryKeys.authors.detail(next.authorId) });
      if (body.penName) void refresh();
      toast.success('Đã lưu hồ sơ tác giả.');
    } catch (e) {
      if (!hasCode(e, 'PEN_NAME_TAKEN', 'VALIDATION_FAILED')) toast.error(errorMessage(e));
      throw e;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">Hồ sơ tác giả</h1>
        <p className="text-muted-foreground">Thông tin này hiển thị trên trang tác giả và dưới mỗi truyện của bạn.</p>
      </header>
      {profile.isError ? (
        <ErrorResult title="Chưa tải được hồ sơ tác giả" onRetry={() => profile.refetch()} />
      ) : profile.data ? (
        <AuthorProfileForm
          profile={profile.data}
          stats={overview.data && { storyCount: overview.data.storyCount, chapterCount: overview.data.chapterCount }}
          onSubmit={save}
        />
      ) : (
        <Skeleton className="h-[420px] max-w-[1100px] rounded-lg" />
      )}
    </div>
  );
}
