import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useCooldown } from '@/hooks/useCooldown';
import { loginSchema, MSG, type LoginValues } from '@/types/user';
import { hasCode, retryAfterSeconds } from '@/utils/errors';
import { applyApiError } from '@/utils/formErrors';

interface LoginFormProps {
  /** Calls the API; rejects with ApiError. Toasts for non-field errors are the caller's job. */
  onSubmit: (values: LoginValues) => Promise<unknown>;
}

/** Login tab of the AuthModal board: username or email, password, one primary button. */
export function LoginForm({ onSubmit }: LoginFormProps) {
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { login: '', password: '' } });
  const cooldown = useCooldown();

  async function submit(values: LoginValues) {
    try {
      await onSubmit(values);
    } catch (e) {
      if (hasCode(e, 'RATE_LIMITED')) cooldown.start(retryAfterSeconds(e) ?? 30);
      applyApiError(form, e, {
        codes: { INVALID_CREDENTIALS: { field: 'password', alsoInvalid: ['login'] } },
        fieldMessages: { login: MSG.loginRequired, password: MSG.passwordRequired },
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate aria-label="Đăng nhập" className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="login"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên đăng nhập hoặc email</FormLabel>
              <FormControl>
                <Input autoComplete="username" autoCapitalize="none" spellCheck={false} className="h-11" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mật khẩu</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" className="h-11" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton block pending={form.formState.isSubmitting} cooldown={cooldown.remaining} pendingLabel="Đang đăng nhập…">
          Đăng nhập
        </SubmitButton>
      </form>
    </Form>
  );
}
