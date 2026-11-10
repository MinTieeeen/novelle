import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { isApiError } from '@/api/http';
import { errorMessage, fieldErrors } from '@/utils/errors';

export interface FieldMapping<T extends FieldValues> {
  /** Field that shows the message. */
  field: Path<T>;
  /** Defaults to errorMessage(error). */
  message?: string;
  /** Other fields to mark invalid (red border) without a message, e.g. login + password. */
  alsoInvalid?: Path<T>[];
}

export interface ApiErrorOptions<T extends FieldValues> {
  /** Error code → field (409 USERNAME_TAKEN → username, 401 INVALID_CREDENTIALS → password). */
  codes?: Partial<Record<string, FieldMapping<T>>>;
  /**
   * Vietnamese message per field for VALIDATION_FAILED (the backend's field messages are English and
   * are never shown). Usually the same rule text as the Zod schema.
   */
  fieldMessages?: Partial<Record<Path<T>, string>>;
}

const GENERIC_FIELD = 'Giá trị chưa hợp lệ.';

/**
 * Puts an API error onto the form fields: listed codes go to their field, VALIDATION_FAILED details go
 * to the field with the same name. Returns true when the error was shown on a field, so the caller only
 * needs a toast for the other cases.
 */
export function applyApiError<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
  { codes = {}, fieldMessages = {} }: ApiErrorOptions<T> = {},
): boolean {
  if (!isApiError(error)) return false;

  const mapping = codes[error.code];
  if (mapping) {
    for (const other of mapping.alsoInvalid ?? []) form.setError(other, { type: 'server', message: '' });
    form.setError(mapping.field, { type: 'server', message: mapping.message ?? errorMessage(error) }, { shouldFocus: true });
    return true;
  }

  if (error.code === 'VALIDATION_FAILED') {
    const known = new Set(Object.keys(form.getValues()));
    let shown = false;
    for (const { field } of fieldErrors(error)) {
      if (!known.has(field)) continue;
      const name = field as Path<T>;
      form.setError(name, { type: 'server', message: fieldMessages[name] ?? GENERIC_FIELD }, { shouldFocus: !shown });
      shown = true;
    }
    return shown;
  }

  return false;
}
