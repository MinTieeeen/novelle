import { useCallback } from 'react';
import type { FieldErrors, FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { firstFieldError } from '@/utils/formErrors';

export const AUTH_FORM_TOAST_ID = 'auth-form-error';
const TOAST_ID = AUTH_FORM_TOAST_ID;

/**
 * Login / register popup: validation errors are not written under the fields. The fields are checked
 * in screen order and the first error goes to one toast (replaced on the next error); the field keeps
 * its red border (aria-invalid) and gets the focus.
 */
export function useToastFormErrors<T extends FieldValues>(form: UseFormReturn<T>, order: readonly Path<T>[]) {
  /**
   * `errors` comes from handleSubmit's invalid callback. Without it (after setError from an API error)
   * the live field state is read: `form.formState` is the snapshot of the last render and does not
   * contain an error set in the same event yet.
   */
  const report = useCallback(
    (errors?: FieldErrors<T>) => {
      const source = errors
        ? (errors as Partial<Record<Path<T>, { message?: string }>>)
        : (Object.fromEntries(order.map((f) => [f, form.getFieldState(f).error])) as Partial<
            Record<Path<T>, { message?: string }>
          >);
      const first = firstFieldError<T>(source, order);
      if (!first) return false;
      toast.error(first.message, { id: TOAST_ID });
      form.setFocus(first.field);
      return true;
    },
    [form, order],
  );

  /** Dismiss the error toast (after a successful submit). */
  const clear = useCallback(() => toast.dismiss(TOAST_ID), []);

  return { report, clear };
}
