import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError } from '@/api/http';
import { toastAuthError } from '@/auth/AuthModalProvider';
import { AuthModal, type AuthTab } from '@/components/auth/AuthModal';
import { ErrorResult } from '@/components/common/ErrorResult';
import { PageHeader } from '@/components/common/PageHeader';
import { UserAvatar } from '@/components/common/UserAvatar';
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const SCENARIOS = {
  ok: 'Thành công',
  invalid: 'Sai mật khẩu',
  banned: 'Tài khoản bị khoá',
  rate: 'Quá nhanh (429)',
  taken: 'Trùng tên / email (409)',
  validation: 'VALIDATION_FAILED',
  server: 'Lỗi máy chủ',
} as const;
type Scenario = keyof typeof SCENARIOS;

const ERRORS: Record<Exclude<Scenario, 'ok'>, ApiError> = {
  invalid: new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'x' }),
  banned: new ApiError({ status: 403, code: 'ACCOUNT_BANNED', message: 'x', details: { banReason: 'Spam bình luận' } }),
  rate: new ApiError({ status: 429, code: 'RATE_LIMITED', message: 'x', details: { retryAfterSeconds: 12 } }),
  taken: new ApiError({ status: 409, code: 'USERNAME_TAKEN', message: 'x' }),
  validation: new ApiError({
    status: 400,
    code: 'VALIDATION_FAILED',
    message: 'x',
    details: [{ field: 'email', message: 'must be a well-formed email address' }],
  }),
  server: new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'x' }),
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Dev-only preview of the FE1 account components (/dev/account). Query params pick a state for
 * screenshots: ?open=login|register&scenario=<key>.
 */
export default function AccountPreviewPage() {
  const [params, setParams] = useSearchParams();
  const scenario = (params.get('scenario') as Scenario) in SCENARIOS ? (params.get('scenario') as Scenario) : 'ok';
  const openTab = params.get('open');
  const [tab, setTab] = useState<AuthTab>(openTab === 'register' ? 'register' : 'login');
  const [open, setOpen] = useState(openTab === 'login' || openTab === 'register');

  const setScenario = (value: string) => {
    params.set('scenario', value);
    setParams(params, { replace: true });
  };

  async function fake(fieldCodes: string[], success: string) {
    await wait(600);
    if (scenario === 'ok') {
      setOpen(false);
      toast.success(success);
      return;
    }
    const error = ERRORS[scenario];
    toastAuthError(error, fieldCodes);
    throw error;
  }

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Tài khoản (FE1)" description="Bản xem trước popup đăng nhập / đăng ký, hồ sơ, avatar, khối lỗi" />

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 font-semibold">Popup đăng nhập / đăng ký</h2>
        <RadioGroup value={scenario} onValueChange={setScenario} className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Kịch bản">
          {Object.entries(SCENARIOS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <RadioGroupItem value={key} id={`sc-${key}`} />
              <Label htmlFor={`sc-${key}`} className="font-normal">
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => (setTab('login'), setOpen(true))}>
            Mở tab Đăng nhập
          </Button>
          <Button variant="outline" onClick={() => (setTab('register'), setOpen(true))}>
            Mở tab Đăng ký
          </Button>
        </div>
        <AuthModal
          open={open}
          tab={tab}
          onTabChange={setTab}
          onOpenChange={setOpen}
          onLogin={() => fake(['INVALID_CREDENTIALS'], 'Đã đăng nhập. Chào Lan Anh quay lại.')}
          onRegister={() => fake(['USERNAME_TAKEN', 'EMAIL_TAKEN'], 'Đã tạo tài khoản. Chào mừng Lan Anh đến Novelle.')}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="mb-5 text-title-3 font-semibold">Hồ sơ</h2>
            <ProfileForm
              defaultValues={{ displayName: 'Lan Anh', bio: 'Mê truyện kiếm hiệp và trinh thám.' }}
              onSubmit={async () => {
                await wait(600);
                if (scenario !== 'ok') throw ERRORS.validation;
                toast.success('Đã lưu hồ sơ');
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h2 className="mb-5 text-title-3 font-semibold">Đổi mật khẩu</h2>
            <ChangePasswordForm
              onSubmit={async () => {
                await wait(600);
                if (scenario !== 'ok') throw new ApiError({ status: 400, code: 'WRONG_PASSWORD', message: 'x' });
                toast.success('Đã đổi mật khẩu');
              }}
            />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 font-semibold">Avatar</h2>
        <div className="flex items-end gap-6">
          <UserAvatar name="Lan Anh" size="sm" />
          <UserAvatar name="Lan Anh" size="md" />
          <UserAvatar name="Lan Anh" size="lg" />
          <UserAvatar name="Mộc Lan" size="sm" verified />
          <UserAvatar name="Mộc Lan" size="md" verified />
          <UserAvatar name="Mộc Lan" size="lg" verified />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ErrorResult onRetry={() => toast('Thử lại')} />
        <ErrorResult variant="not-found" title="Không tìm thấy người dùng này" description="Tài khoản có thể đã đổi tên hoặc không còn hoạt động." />
      </section>
    </div>
  );
}
