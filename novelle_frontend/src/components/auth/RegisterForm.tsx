import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useCooldown } from '@/hooks/useCooldown';
import { cn } from '@/lib/utils';
import { MSG, normalizeUsername, registerSchema, type RegisterValues } from '@/types/user';
import { hasCode, retryAfterSeconds } from '@/utils/errors';
import { applyApiError } from '@/utils/formErrors';

interface RegisterFormProps {
  /** Calls the API (without confirmPassword); rejects with ApiError. */
  onSubmit: (values: RegisterValues) => Promise<unknown>;
}

const EMPTY: RegisterValues = { displayName: '', username: '', email: '', password: '', confirmPassword: '' };

/** Register tab of the AuthModal board. Hints under username and passwords turn into the error text. */
export function RegisterForm({ onSubmit }: RegisterFormProps) {
  const form = useForm<RegisterValues>({ resolver: zodResolver(registerSchema), defaultValues: EMPTY });
  const cooldown = useCooldown();
  const { errors } = form.formState;
  const passwordError = errors.password?.message || errors.confirmPassword?.message;

  async function submit(values: RegisterValues) {
    try {
      await onSubmit(values);
    } catch (e) {
      if (hasCode(e, 'RATE_LIMITED')) cooldown.start(retryAfterSeconds(e) ?? 60);
      applyApiError(form, e, {
        codes: { USERNAME_TAKEN: { field: 'username' }, EMAIL_TAKEN: { field: 'email' } },
        fieldMessages: {
          displayName: MSG.displayName,
          username: MSG.usernameInvalid,
          email: MSG.emailInvalid,
          password: MSG.passwordInvalid,
        },
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate aria-label="Đăng ký" className="flex flex-col gap-3.5">
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên hiển thị</FormLabel>
              <FormControl>
                <Input autoComplete="nickname" className="h-11" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="username"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Tên đăng nhập</FormLabel>
              <FormControl>
                <Input
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="h-11"
                  {...field}
                  onBlur={() => {
                    field.onChange(normalizeUsername(field.value));
                    field.onBlur();
                  }}
                />
              </FormControl>
              {fieldState.error ? <FormMessage /> : <FormDescription>{MSG.usernameHint}</FormDescription>}
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
                <Input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} className="h-11" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* One shared hint / error line under both password fields, as on the board. */}
        <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mật khẩu</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" className="h-11" aria-describedby="register-password-msg" {...field} />
                </FormControl>
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
                  <Input type="password" autoComplete="new-password" className="h-11" aria-describedby="register-password-msg" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <p
            id="register-password-msg"
            className={cn('text-small sm:col-span-2', passwordError ? 'text-destructive' : 'text-muted-foreground')}
          >
            {passwordError || MSG.passwordHint}
          </p>
        </div>
        <SubmitButton block pending={form.formState.isSubmitting} cooldown={cooldown.remaining} pendingLabel="Đang tạo tài khoản…">
          Tạo tài khoản
        </SubmitButton>
      </form>
    </Form>
  );
}
