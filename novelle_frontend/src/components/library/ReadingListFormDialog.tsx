import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { LIBRARY_MSG, LIST_DESCRIPTION_MAX, readingListSchema, type ReadingListValues } from '@/types/library';
import { formatNumber } from '@/utils/format';
import { applyApiError } from '@/utils/formErrors';

interface ReadingListFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** create: empty form; edit: the list's current values */
  mode: 'create' | 'edit';
  defaultValues?: Partial<ReadingListValues>;
  /** POST / PATCH; rejects with ApiError (READING_LIST_NAME_TAKEN goes under the name). */
  onSubmit: (values: ReadingListValues) => Promise<unknown>;
}

const EMPTY: ReadingListValues = { name: '', description: '', isPublic: false };

/**
 * "Tạo tủ mới" / "Đổi tên tủ" (board Library): name, optional description, "Công khai" switch. Errors
 * under the field; the dialog closes itself only when the save succeeds.
 */
export function ReadingListFormDialog({ open, onOpenChange, mode, defaultValues, onSubmit }: ReadingListFormDialogProps) {
  const form = useForm<ReadingListValues>({ resolver: zodResolver(readingListSchema), defaultValues: { ...EMPTY, ...defaultValues } });
  const description = useWatch({ control: form.control, name: 'description' }) ?? '';
  const pending = form.formState.isSubmitting;
  const returnFocus = useReturnFocus(open);

  // Each opening starts from the given values.
  const { name, description: savedDescription, isPublic } = { ...EMPTY, ...defaultValues };
  useEffect(() => {
    if (open) form.reset({ name, description: savedDescription ?? '', isPublic });
  }, [open, name, savedDescription, isPublic, form]);

  async function submit(values: ReadingListValues) {
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (e) {
      applyApiError(form, e, {
        codes: { READING_LIST_NAME_TAKEN: { field: 'name', message: LIBRARY_MSG.nameTaken } },
        fieldMessages: { name: LIBRARY_MSG.listName, description: LIBRARY_MSG.listDescription },
      });
      // Other errors (limit, not found) are toasted by the caller.
    }
  }

  const title = mode === 'create' ? 'Tạo tủ mới' : 'Sửa tủ';

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-w-[460px] gap-5 sm:max-w-[460px]" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle className="font-serif text-title-3">{title}</DialogTitle>
          <DialogDescription>Tủ truyện giúp bạn gom các truyện theo chủ đề.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate aria-label={title} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên tủ</FormLabel>
                  <FormControl>
                    <Input placeholder="Ví dụ: Đọc đêm mưa" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-baseline justify-between">
                    <FormLabel>
                      Mô tả <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
                    </FormLabel>
                    <span className="num text-caption text-muted-foreground">
                      {formatNumber(description.length)}/{formatNumber(LIST_DESCRIPTION_MAX)}
                    </span>
                  </div>
                  <FormControl>
                    <Textarea rows={2} placeholder="Những truyện hợp để đọc một mình khi mưa rả rích." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isPublic"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-md bg-secondary px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <FormLabel>Công khai</FormLabel>
                    <span className="text-small text-muted-foreground">Ai có đường dẫn đều xem được tủ này.</span>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter className="mt-1">
              <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <SubmitButton pending={pending} pendingLabel="Đang lưu…">
                {mode === 'create' ? 'Tạo tủ' : 'Lưu'}
              </SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
