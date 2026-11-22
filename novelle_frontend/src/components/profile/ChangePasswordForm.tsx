import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { changePasswordSchema, MSG, type ChangePasswordValues } from '@/types/user';
import { applyApiError } from '@/utils/formErrors';

interface ChangePasswordFormProps {
  /** Sends PUT /api/me/password; rejects with ApiError. The form clears itself after success. */
  onSubmit: (values: ChangePasswordValues) => Promise<unknown>;
}

const EMPTY: ChangePasswordValues = { currentPassword: '', newPassword: '', confirmPassword: '' };

/** Current password + new password twice (/profile, tab Mật khẩu). */
export function ChangePasswordForm({ onSubmit }: ChangePasswordFormProps) {
  const form = useForm<ChangePasswordValues>({ resolver: zodResolver(changePasswordSchema), defaultValues: EMPTY });

  async function submit(values: ChangePasswordValues) {
    try {
      await onSubmit(values);
      form.reset(EMPTY);
    } catch (e) {
      applyApiError(form, e, {
        codes: { WRONG_PASSWORD: { field: 'currentPassword' } },
        fieldMessages: { currentPassword: MSG.currentPasswordRequired, newPassword: MSG.passwordInvalid },
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate aria-label="Đổi mật khẩu" className="flex max-w-[400px] flex-col gap-5">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mật khẩu hiện tại</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Mật khẩu mới</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              {fieldState.error ? <FormMessage /> : <FormDescription>{MSG.passwordHint}</FormDescription>}
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nhập lại mật khẩu mới</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Đang đổi mật khẩu…">
            Đổi mật khẩu
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
