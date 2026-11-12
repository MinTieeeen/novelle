import { Check, Globe, Link2, Lock, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LIST_DESCRIPTION_MAX, LIST_NAME_MAX, type ReadingListDetail, type ReadingListValues } from '@/types/library';
import { formatNumber, formatRelative } from '@/utils/format';

interface ShelfHeaderProps {
  list: ReadingListDetail;
  editing: boolean;
  draft: ReadingListValues;
  onDraftChange: (patch: Partial<ReadingListValues>) => void;
  /** first invalid field message from the page's Zod check */
  error?: { field: keyof ReadingListValues; message: string } | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
}

const VISIBILITY = [
  { value: true, label: 'Công khai' },
  { value: false, label: 'Riêng tư' },
] as const;

/** Absolute link of a list, for "Sao chép liên kết". */
function listUrl(listId: number): string {
  return `${window.location.origin}/lists/${listId}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Đã sao chép liên kết tủ truyện.');
    return true;
  } catch {
    toast.error('Không sao chép được. Hãy chép đường dẫn trên thanh địa chỉ.');
    return false;
  }
}

/**
 * R8 header (board Shelf): breadcrumb, name, visibility, description, "owner · N truyện · Cập nhật …";
 * the owner gets "Sửa" which turns the header into inputs (name, description, Công khai / Riêng tư,
 * link + copy) with "Lưu" / "Huỷ". Public lists get "Sao chép liên kết".
 */
export function ShelfHeader({ list, editing, draft, onDraftChange, error, onEdit, onCancel, onSave, saving }: ShelfHeaderProps) {
  const [copied, setCopied] = useState(false);
  const url = listUrl(list.listId);
  const copyLink = async () => {
    if (await copy(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <nav aria-label="Đường dẫn" className="text-small text-muted-foreground">
        {list.isOwner ? (
          <Link to="/library?tab=lists" className="hover:text-foreground hover:underline">
            Thư viện
          </Link>
        ) : (
          <Link to={`/users/${list.owner.username}`} className="hover:text-foreground hover:underline">
            @{list.owner.username}
          </Link>
        )}{' '}
        › Tủ truyện
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-2.5">
          {editing ? (
            <>
              <Input
                aria-label="Tên tủ"
                aria-invalid={error?.field === 'name' || undefined}
                value={draft.name}
                maxLength={LIST_NAME_MAX + 20}
                onChange={(e) => onDraftChange({ name: e.target.value })}
                className="h-[52px] max-w-[520px] font-serif text-[28px] font-semibold"
              />
              <Input
                aria-label="Mô tả"
                aria-invalid={error?.field === 'description' || undefined}
                value={draft.description}
                maxLength={LIST_DESCRIPTION_MAX + 20}
                placeholder="Mô tả ngắn (không bắt buộc)"
                onChange={(e) => onDraftChange({ description: e.target.value })}
                className="max-w-[640px]"
              />
              {error && (
                <p role="alert" className="text-small text-destructive">
                  {error.message}
                </p>
              )}
              <div role="radiogroup" aria-label="Quyền xem" className="inline-flex gap-5">
                {VISIBILITY.map((o) => {
                  const on = draft.isPublic === o.value;
                  return (
                    <button
                      key={o.label}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onDraftChange({ isPublic: o.value })}
                      className={cn(
                        'border-b-2 py-1 text-label transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
                        on ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {draft.isPublic && (
                <div className="flex max-w-[520px] items-center gap-3 rounded-md border border-input bg-secondary py-1.5 pr-1.5 pl-3.5">
                  <span className="min-w-0 flex-1 truncate text-label text-muted-foreground">{url.replace(/^https?:\/\//, '')}</span>
                  <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                    {copied ? <Check /> : <Link2 />}
                    {copied ? 'Đã chép' : 'Chép'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">
                  {list.name}
                </h1>
                <span className={cn('inline-flex items-center gap-1.5 text-small font-semibold', list.isPublic ? 'text-success' : 'text-muted-foreground')}>
                  {list.isPublic ? <Globe aria-hidden className="size-3.5" strokeWidth={1.75} /> : <Lock aria-hidden className="size-3.5" strokeWidth={1.75} />}
                  {list.isPublic ? 'Công khai' : 'Riêng tư'}
                </span>
              </div>
              {list.description && <p className="max-w-[640px] text-muted-foreground">{list.description}</p>}
            </>
          )}
          <span className="text-label text-muted-foreground">
            <b className="font-semibold text-foreground">@{list.owner.username}</b> · {formatNumber(list.itemCount)} truyện · Cập nhật{' '}
            {formatRelative(list.updatedAt)}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {!editing && list.isPublic && (
            <button
              type="button"
              onClick={copyLink}
              className="rounded-sm text-label font-medium text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              {copied ? 'Đã sao chép' : 'Sao chép liên kết'}
            </button>
          )}
          {list.isOwner && !editing && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil strokeWidth={1.75} /> Sửa
            </Button>
          )}
          {editing && (
            <>
              <Button variant="ghost" onClick={onCancel} disabled={saving}>
                Huỷ
              </Button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSave();
                }}
              >
                <SubmitButton pending={!!saving} pendingLabel="Đang lưu…">
                  Lưu
                </SubmitButton>
              </form>
            </>
          )}
        </div>
      </header>
    </>
  );
}
