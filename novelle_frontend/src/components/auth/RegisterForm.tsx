import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useToastFormErrors } from '@/components/auth/useToastFormErrors';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useCooldown } from '@/hooks/useCooldown';
import { MSG, normalizeUsername, registerSchema, type RegisterValues } from '@/types/user';
import { hasCode, retryAfterSeconds } from '@/utils/errors';
import { applyApiError } from '@/utils/formErrors';

interface RegisterFormProps {
  /** Calls the API (without confirmPassword); rejects with ApiError. */
  onSubmit: (values: RegisterValues) => Promise<unknown>;
}

const EMPTY: RegisterValues = { displayName: '', username: '', email: '', password: '', confirmPassword: '' };
const ORDER = ['displayName', 'username', 'email', 'password', 'confirmPassword'] as const;

/**
 * Register tab of the AuthModal board. Field errors (Zod, 409 taken, VALIDATION_FAILED) go to a toast,
 * checked in field order; the hints under username and password stay as guidance.
 */
export function RegisterForm({ onSubmit }: RegisterFormProps) {
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: EMPTY,
    shouldFocusError: false,
  });
  const cooldown = useCooldown();
  const errors = useToastFormErrors(form, ORDER);

  async function submit(values: RegisterValues) {
    try {
      await onSubmit(values);
      errors.clear();
    } catch (e) {
      if (hasCode(e, 'RATE_LIMITED')) cooldown.start(retryAfterSeconds(e) ?? 60);
      const onField = applyApiError(form, e, {
        codes: { USERNAME_TAKEN: { field: 'username' }, EMAIL_TAKEN: { field: 'email' } },
        fieldMessages: {
          displayName: MSG.displayName,
          username: MSG.usernameInvalid,
          email: MSG.emailInvalid,
          password: MSG.passwordInvalid,
        },
      });
      if (onField) errors.report();
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(submit, (e) => errors.report(e))}
        noValidate
        aria-label="Đăng ký"
        className="flex flex-col gap-3"
      >
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên hiển thị</FormLabel>
              <FormControl>
                <Input autoComplete="nickname" placeholder="Ví dụ: John Doe" className="h-11" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên đăng nhập (Username)</FormLabel>
              <FormControl>
                <Input
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Ví dụ: john"
                  className="h-11"
                  {...field}
                  onBlur={() => {
                    field.onChange(normalizeUsername(field.value));
                    field.onBlur();
                  }}
                />
              </FormControl>
              <FormDescription>{MSG.usernameHint}</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Ví dụ: john@gmail.com"
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
                <Input type="password" autoComplete="new-password" placeholder="********" className="h-11" {...field} />
              </FormControl>
              <FormDescription>{MSG.passwordHint}</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nhập lại mật khẩu</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" placeholder="********" className="h-11" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <SubmitButton block pending={form.formState.isSubmitting} cooldown={cooldown.remaining} pendingLabel="Đang tạo tài khoản…">
          Tạo tài khoản
        </SubmitButton>
      </form>
    </Form>
  );
}
