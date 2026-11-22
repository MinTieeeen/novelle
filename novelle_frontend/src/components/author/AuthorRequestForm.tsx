import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  authorRequestSchema,
  INTRO_MAX,
  PEN_NAME_MAX,
  REQUEST_MSG,
  type AuthorRequestValues,
} from '@/types/authorRequest';
// import { formatNumber } from '@/utils/format';
import { applyApiError } from '@/utils/formErrors';

interface AuthorRequestFormProps {
  /** prefilled after a rejection (the previous pen name and introduction) */
  defaultValues?: Partial<Pick<AuthorRequestValues, 'proposedPenName' | 'introduction'>>;
  /** A2; rejects with ApiError (PEN_NAME_TAKEN goes under the pen name) */
  onSubmit: (values: { proposedPenName: string; introduction: string }) => Promise<unknown>;
  cooldown?: number;
}

/**
 * R10 form (board BecomeAuthor): pen name 2–100, introduction 20–2000 with counters, the commitment box
 * (frontend only) and "Gửi yêu cầu". Limits are the backend's, checked after trimming.
 */
export function AuthorRequestForm({ defaultValues, onSubmit, cooldown = 0 }: AuthorRequestFormProps) {
  const form = useForm<AuthorRequestValues>({
    resolver: zodResolver(authorRequestSchema),
    defaultValues: { proposedPenName: '', introduction: '', agree: false as unknown as true, ...defaultValues },
  });
  const [agree] = useWatch({ control: form.control, name: ['proposedPenName', 'introduction', 'agree'] });
  const pending = form.formState.isSubmitting;

  async function submit(values: AuthorRequestValues) {
    try {
      await onSubmit({ proposedPenName: values.proposedPenName, introduction: values.introduction });
    } catch (e) {
      applyApiError(form, e, {
        codes: { PEN_NAME_TAKEN: { field: 'proposedPenName', message: REQUEST_MSG.penTaken } },
        fieldMessages: { proposedPenName: REQUEST_MSG.penName, introduction: REQUEST_MSG.intro },
      });
    }
  }

  // const counter = (n: number, max: number) => (
  //   <span className="num shrink-0">
  //     {formatNumber(n)}/{formatNumber(max)}
  //   </span>
  // );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate aria-label="Yêu cầu trở thành tác giả" className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="proposedPenName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bút danh (*)</FormLabel>
              <FormControl>
                <Input placeholder="Nhập bút danh (2-100 ký tự)" autoComplete="off" maxLength={PEN_NAME_MAX + 20} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="introduction"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Giới thiệu bản thân (*)</FormLabel>
              <FormControl>
                <Textarea
                  rows={6}
                  placeholder="Hãy giới thiệu về bạn (ít nhất 20 kí tự)"
                  maxLength={INTRO_MAX + 50}
                  className="resize-y"
                  {...field}
                />
              </FormControl>
              <div className="flex justify-between gap-3 text-small text-muted-foreground">
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="agree"
          render={({ field, fieldState }) => (
            <FormItem>
              <button
                type="button"
                role="checkbox"
                aria-checked={!!field.value}
                aria-invalid={!!fieldState.error || undefined}
                onClick={() => field.onChange(!field.value)}
                className="flex items-start gap-3 rounded-sm text-left text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-px grid size-5 flex-none place-items-center rounded-[5px] border-[1.5px] text-primary-foreground',
                    field.value ? 'border-primary bg-primary' : fieldState.error ? 'border-destructive' : 'border-input bg-card',
                  )}
                >
                  {field.value && <Check className="size-3.5" strokeWidth={2.5} />}
                </span>
                <span>Tôi đồng ý và cam kết với Chính sách nội dung và dữ liệu của Novelle bao gồm Quyền tác giả & sở hữu trí tuệ</span>
              </button>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SubmitButton pending={pending} pendingLabel="Đang gửi…" cooldown={cooldown} disabled={!agree}>
            Gửi yêu cầu
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
