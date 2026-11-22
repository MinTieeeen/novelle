import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import * as authApi from '@/api/auth';
import { queryKeys } from '@/api/queryKeys';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/common/PageHeader';
import { UserAvatar } from '@/components/common/UserAvatar';
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROLE_LABEL, type ChangePasswordValues, type ProfileValues } from '@/types/user';
import { errorMessage, hasCode } from '@/utils/errors';
import { formatDate } from '@/utils/format';

type Tab = 'profile' | 'password';

/** /profile: account card, tab Hồ sơ (display name, bio) and tab Mật khẩu. No board: built from the DS. */
export default function ProfilePage() {
  const { user, setUser, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'password' ? 'password' : 'profile';
  const [stale, setStale] = useState(false);

  const defaults = useMemo<ProfileValues>(
    () => ({ displayName: user?.displayName ?? '', bio: user?.bio ?? '' }),
    [user?.displayName, user?.bio],
  );

  const saveProfile = useMutation({
    mutationFn: (values: ProfileValues) =>
      authApi.updateMe({ displayName: values.displayName, bio: values.bio, rowVersion: user!.rowVersion }),
    onSuccess: (me) => {
      setUser(me);
      setStale(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.profile(me.username) });
      toast.success('Đã lưu hồ sơ');
    },
    onError: (e) => {
      if (hasCode(e, 'STALE_DATA')) setStale(true);
      else if (!hasCode(e, 'VALIDATION_FAILED')) toast.error(errorMessage(e));
    },
  });

  const changePassword = useMutation({
    mutationFn: ({ currentPassword, newPassword }: ChangePasswordValues) =>
      authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => toast.success('Đã đổi mật khẩu'),
    onError: (e) => {
      if (!hasCode(e, 'WRONG_PASSWORD', 'VALIDATION_FAILED')) toast.error(errorMessage(e));
    },
  });

  if (!user) return null; // RequireRole renders this page only for a logged-in user.

  function setTab(next: string) {
    params.set('tab', next);
    setParams(params, { replace: true });
  }

  async function reload() {
    await refresh();
    setStale(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Hồ sơ" description="Thông tin tài khoản và mật khẩu của bạn." />

      <Card className="py-0">
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} size="lg" verified={user.author?.isVerified} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 text-title-2 font-semibold break-words">{user.displayName}</h2>
              <Badge variant={user.role === 'AUTHOR' ? 'default' : 'outline'}>{ROLE_LABEL[user.role]}</Badge>
            </div>
            <p className="flex flex-wrap gap-x-1.5 text-small text-muted-foreground">
              <span>@{user.username}</span>
              <span aria-hidden>·</span>
              <span className="break-all">{user.email}</span>
              <span aria-hidden>·</span>
              <span>Tham gia từ {formatDate(user.createdAt)}</span>
            </p>
            {user.author && (
              <p className="text-small text-muted-foreground">
                Bút danh <span className="font-medium text-foreground">{user.author.penName}</span>. Sửa bút danh và giới
                thiệu tác giả ở{' '}
                <Link to="/studio/profile" className="text-link underline-offset-4 hover:underline">
                  Studio
                </Link>
                .
              </p>
            )}
          </div>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link to={`/users/${encodeURIComponent(user.username)}`}>Xem hồ sơ công khai</Link>
          </Button>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Hồ sơ">
          <TabsTrigger value="profile">Hồ sơ</TabsTrigger>
          <TabsTrigger value="password">Mật khẩu</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="flex flex-col gap-5">
          {stale && (
            <Alert className="max-w-[560px] border-transparent bg-warning-soft [&>svg]:text-warning">
              <TriangleAlert />
              <AlertTitle>Hồ sơ đã được cập nhật ở nơi khác</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>Tải lại bản mới nhất rồi sửa tiếp. Nội dung bạn vừa nhập sẽ được thay bằng bản đã lưu.</span>
                <Button size="sm" variant="outline" onClick={reload}>
                  Tải lại
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <ProfileForm defaultValues={defaults} onSubmit={(v) => saveProfile.mutateAsync(v)} />
        </TabsContent>
        <TabsContent value="password">
          <ChangePasswordForm onSubmit={(v) => changePassword.mutateAsync(v)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
