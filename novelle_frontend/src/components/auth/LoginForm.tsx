import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { useToastFormErrors } from '@/components/auth/useToastFormErrors';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useCooldown } from '@/hooks/useCooldown';
import { loginSchema, MSG, type LoginValues } from '@/types/user';
import { hasCode, retryAfterSeconds } from '@/utils/errors';
import { applyApiError } from '@/utils/formErrors';

interface LoginFormProps {
  /** Calls the API; rejects with ApiError. Toasts for non-field errors are the caller's job. */
  onSubmit: (values: LoginValues) => Promise<unknown>;
}

const ORDER = ['login', 'password'] as const;

/**
 * Login tab of the AuthModal board: username or email, password, one primary button.
 * Field errors (Zod and API) are reported one at a time in a toast, in field order.
 */
export function LoginForm({ onSubmit }: LoginFormProps) {
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: '', password: '' },
    shouldFocusError: false,
  });
  const cooldown = useCooldown();
  const errors = useToastFormErrors(form, ORDER);

  async function submit(values: LoginValues) {
    try {
      await onSubmit(values);
      errors.clear();
    } catch (e) {
      if (hasCode(e, 'RATE_LIMITED')) cooldown.start(retryAfterSeconds(e) ?? 30);
      const onField = applyApiError(form, e, {
        codes: { INVALID_CREDENTIALS: { field: 'password', alsoInvalid: ['login'] } },
        fieldMessages: { login: MSG.loginRequired, password: MSG.passwordRequired },
      });
      if (onField) errors.report();
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(submit, (e) => errors.report(e))}
        noValidate
        aria-label="Đăng nhập"
        className="flex flex-col gap-3"
      >
        <FormField
          control={form.control}
          name="login"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên đăng nhập hoặc email</FormLabel>
              <FormControl>
                <Input
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Ví dụ: john hoặc john@gmail.com"
                  className="h-11"
                  {...field}
                />
              </FormControl>
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
                <PasswordInput autoComplete="current-password" placeholder="********" className="h-11" {...field} />
              </FormControl>
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
