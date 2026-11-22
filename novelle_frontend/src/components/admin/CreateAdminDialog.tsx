import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { ADMIN_MSG, createAdminSchema, type CreateAdminValues } from '@/types/admin';
import { MSG, normalizeUsername } from '@/types/user';
import { applyApiError } from '@/utils/formErrors';
import { toastAdminError } from '@/hooks/useAdminActions';

interface CreateAdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** U5; rejects with ApiError (USERNAME_TAKEN / EMAIL_TAKEN under the field) */
  onSubmit: (values: CreateAdminValues) => Promise<unknown>;
}

const EMPTY: CreateAdminValues = { displayName: '', username: '', email: '', password: '' };

/** "Tạo tài khoản admin" (board AdminUsers): display name, username, email, temporary password (FE1 rules). */
export function CreateAdminDialog({ open, onOpenChange, onSubmit }: CreateAdminDialogProps) {
  const form = useForm<CreateAdminValues>({ resolver: zodResolver(createAdminSchema), defaultValues: EMPTY });
  const pending = form.formState.isSubmitting;
  const returnFocus = useReturnFocus(open);
  useEffect(() => {
    if (open) form.reset(EMPTY);
  }, [open, form]);

  async function submit(v: CreateAdminValues) {
    try {
      await onSubmit(v);
      onOpenChange(false);
    } catch (e) {
      const shown = applyApiError(form, e, {
        codes: {
          USERNAME_TAKEN: { field: 'username', message: ADMIN_MSG.usernameTaken },
          EMAIL_TAKEN: { field: 'email', message: ADMIN_MSG.emailTaken },
        },
        fieldMessages: { displayName: MSG.displayName, username: MSG.usernameInvalid, email: MSG.emailInvalid, password: MSG.passwordHint },
      });
      if (!shown) toastAdminError(e);
    }
  }

  const fields = [
    ['displayName', 'Tên hiển thị', 'Nguyễn Văn A', 'text', undefined],
    ['username', 'Username', 'nguyenvana', 'text', MSG.usernameHint],
    ['email', 'Email', 'admin@novelle.vn', 'email', undefined],
  ] as const;

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent onCloseAutoFocus={returnFocus} className="max-w-[480px] gap-5 sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-title-3">Tạo tài khoản admin</DialogTitle>
          <DialogDescription>Tài khoản mới có toàn quyền quản trị. Chỉ tạo cho người bạn tin tưởng.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate aria-label="Tạo tài khoản admin" className="flex flex-col gap-4">
            {fields.map(([name, label, placeholder, type, hint]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input
                        type={type}
                        placeholder={placeholder}
                        autoComplete="off"
                        {...field}
                        onBlur={(e) => {
                          if (name === 'username') field.onChange(normalizeUsername(e.target.value));
                          field.onBlur();
                        }}
                      />
                    </FormControl>
                    {hint && <FormDescription>{hint}</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mật khẩu tạm</FormLabel>
                  <FormControl>
                    <PasswordInput placeholder="Ít nhất 8 ký tự" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormDescription>Người dùng nên đổi mật khẩu sau lần đăng nhập đầu tiên.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <SubmitButton pending={pending} pendingLabel="Đang tạo…">
                Tạo admin
              </SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
