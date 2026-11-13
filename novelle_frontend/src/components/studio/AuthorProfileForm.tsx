import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpRight } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { SubmitButton } from '@/components/common/SubmitButton';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AUTHOR_BIO_MAX, authorProfileSchema, PEN_NAME_MAX, STUDIO_MSG, type AuthorProfileStudio, type AuthorProfileValues } from '@/types/studio';
import { formatMonthYear, formatNumber } from '@/utils/format';
import { applyApiError } from '@/utils/formErrors';

interface AuthorProfileFormProps {
  profile: AuthorProfileStudio;
  /** D1 counts for the preview */
  stats?: { storyCount: number; chapterCount: number };
  /** S11; rejects with ApiError (PEN_NAME_TAKEN under the pen name) */
  onSubmit: (values: AuthorProfileValues) => Promise<unknown>;
}

/**
 * S6 (board StudioProfile): pen name + bio form on the left, a live preview of the author card on the right
 * (avatar with the verified tick, "Tham gia từ tháng 3/2026", bio, Truyện / Chương / Theo dõi) and the link
 * to the public author page.
 */
export function AuthorProfileForm({ profile, stats, onSubmit }: AuthorProfileFormProps) {
  const defaults = { penName: profile.penName, bio: profile.bio ?? '' };
  const form = useForm<AuthorProfileValues>({ resolver: zodResolver(authorProfileSchema), defaultValues: defaults });
  const [penName, bio] = useWatch({ control: form.control, name: ['penName', 'bio'] });
  const pending = form.formState.isSubmitting;

  useEffect(() => {
    form.reset({ penName: profile.penName, bio: profile.bio ?? '' });
  }, [profile.penName, profile.bio, form]);

  async function submit(v: AuthorProfileValues) {
    try {
      await onSubmit(v);
    } catch (e) {
      applyApiError(form, e, {
        codes: { PEN_NAME_TAKEN: { field: 'penName', message: STUDIO_MSG.penTaken } },
        fieldMessages: { penName: STUDIO_MSG.penName, bio: STUDIO_MSG.bio },
      });
    }
  }

  const shownName = penName?.trim() || profile.penName;
  return (
    <div className="flex max-w-[1100px] flex-wrap items-start gap-8">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(submit)}
          noValidate
          aria-label="Hồ sơ tác giả"
          className="flex min-w-0 flex-[1_1_440px] flex-col gap-6 rounded-lg border border-border bg-card p-6 sm:p-8"
        >
          <FormField
            control={form.control}
            name="penName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bút danh</FormLabel>
                <FormControl>
                  <Input autoComplete="off" maxLength={PEN_NAME_MAX + 20} {...field} />
                </FormControl>
                <FormDescription>Bút danh là duy nhất trên Novelle, 2–100 ký tự.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Giới thiệu</FormLabel>
                <FormControl>
                  <Textarea rows={6} placeholder="Bạn là ai, viết về điều gì?" className="resize-y" {...field} />
                </FormControl>
                <div className="flex justify-between gap-3">
                  <FormMessage />
                  <span className="num ml-auto text-small text-muted-foreground">
                    {formatNumber(bio?.trim().length ?? 0)}/{formatNumber(AUTHOR_BIO_MAX)}
                  </span>
                </div>
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <SubmitButton pending={pending} pendingLabel="Đang lưu…" disabled={!form.formState.isDirty}>
              Lưu hồ sơ
            </SubmitButton>
            <Button type="button" variant="outline" disabled={!form.formState.isDirty || pending} onClick={() => form.reset(defaults)}>
              Huỷ thay đổi
            </Button>
          </div>
        </form>
      </Form>

      <aside aria-label="Xem trước" className="flex min-w-0 flex-[1_1_360px] flex-col gap-3">
        <span className="text-label font-semibold">Xem trước thẻ tác giả</span>
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <UserAvatar name={shownName} size="lg" verified={profile.isVerified} />
            <div className="min-w-0">
              <div className="truncate font-serif text-[24px] leading-[30px] font-semibold tracking-[-0.01em]">{shownName}</div>
              <div className="text-label text-muted-foreground">Tham gia từ {formatMonthYear(profile.authorSince)}</div>
            </div>
          </div>
          <p className="font-serif leading-[26px] whitespace-pre-line">
            {bio?.trim() || <span className="text-muted-foreground">Chưa có giới thiệu.</span>}
          </p>
          <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4">
            {(
              [
                ['Truyện', stats?.storyCount],
                ['Chương', stats?.chapterCount],
                ['Theo dõi', profile.followerCount],
              ] as const
            ).map(([label, n]) => (
              <div key={label}>
                <dt className="text-small text-muted-foreground">{label}</dt>
                <dd className="num font-serif text-[20px] leading-[26px] font-semibold">{n == null ? '–' : formatNumber(n)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Link to={`/authors/${profile.authorId}`} className="inline-flex items-center gap-1.5 self-start text-label font-medium text-link hover:underline">
          <ArrowUpRight aria-hidden className="size-4" strokeWidth={1.75} /> Xem trang công khai
        </Link>
      </aside>
    </div>
  );
}
