import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { BIO_MAX, MSG, profileSchema, type ProfileValues } from '@/types/user';
import { formatNumber } from '@/utils/format';
import { applyApiError } from '@/utils/formErrors';

interface ProfileFormProps {
  defaultValues: ProfileValues;
  /** Sends PATCH /api/me; rejects with ApiError (STALE_DATA is shown by the page). */
  onSubmit: (values: ProfileValues) => Promise<unknown>;
}

/** Display name and bio of the logged-in user (/profile, tab Hồ sơ). */
export function ProfileForm({ defaultValues, onSubmit }: ProfileFormProps) {
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues });
  const bio = useWatch({ control: form.control, name: 'bio' }) ?? '';

  // A newer profile (after save or reload) becomes the new baseline for "dirty".
  const { displayName, bio: savedBio } = defaultValues;
  useEffect(() => {
    form.reset({ displayName, bio: savedBio });
  }, [displayName, savedBio, form]);

  async function submit(values: ProfileValues) {
    try {
      await onSubmit(values);
    } catch (e) {
      applyApiError(form, e, { fieldMessages: { displayName: MSG.displayName, bio: MSG.bio } });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate aria-label="Hồ sơ" className="flex max-w-[560px] flex-col gap-5">
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên hiển thị</FormLabel>
              <FormControl>
                <Input autoComplete="nickname" {...field} />
              </FormControl>
              <FormDescription>Tên hiện cạnh bình luận và đánh giá của bạn.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bio"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Giới thiệu</FormLabel>
              <FormControl>
                <Textarea rows={5} placeholder="Vài dòng về bạn và thể loại bạn thích đọc" {...field} />
              </FormControl>
              <div className="flex justify-between gap-4">
                {fieldState.error ? <FormMessage /> : <FormDescription>Để trống nếu không muốn giới thiệu.</FormDescription>}
                <span className={cn('num shrink-0 text-small', bio.length > BIO_MAX ? 'text-destructive' : 'text-muted-foreground')}>
                  {formatNumber(bio.length)}/{formatNumber(BIO_MAX)}
                </span>
              </div>
            </FormItem>
          )}
        />
        <div>
          <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Đang lưu…" disabled={!form.formState.isDirty}>
            Lưu thay đổi
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
