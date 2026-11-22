import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { queryKeys } from '@/api/queryKeys';
import { getAllListItems, getList, removeListItem, reorderList, updateList } from '@/api/readingLists';
import { AppPagination } from '@/components/common/AppPagination';
import { ErrorResult } from '@/components/common/ErrorResult';
import { ShelfHeader } from '@/components/library/ShelfHeader';
import { ShelfItemRow, SortableShelf } from '@/components/library/SortableShelf';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useCatalog';
import {
  LIBRARY_MSG,
  LIST_PAGE_SIZE,
  orderOf,
  readingListSchema,
  type ReadingListDetail,
  type ReadingListItem,
  type ReadingListValues,
} from '@/types/library';
import { errorMessage, hasCode } from '@/utils/errors';

function NotFound() {
  return (
    <ErrorResult
      variant="not-found"
      title="Không tìm thấy tủ truyện này"
      description="Tủ có thể đã bị xoá, hoặc chủ tủ để ở chế độ riêng tư."
      action={
        <Button asChild>
          <Link to="/library?tab=lists">Về thư viện</Link>
        </Button>
      }
    />
  );
}

const sameOrder = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * R8 · Tủ truyện (/lists/:listId, board Shelf): public lists for everyone, private ones for the owner
 * (others get not-found). View: header + stories in list order, 50 per page. Owner's "Sửa": name,
 * description, visibility, drag to reorder, "Bỏ khỏi tủ"; "Lưu" sends PATCH + one PUT …/items/order.
 */
export default function ReadingListPage() {
  const raw = useParams().listId ?? '';
  const listId = /^\d{1,9}$/.test(raw) ? Number(raw) : null;
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, Number(params.get('page')) || 0);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: queryKeys.readingLists.page(listId ?? 0, page),
    queryFn: () => getList(listId!, { page, size: LIST_PAGE_SIZE }),
    enabled: listId !== null,
    placeholderData: keepPreviousData,
    retry: (count, e) => count < 1 && !hasCode(e, 'READING_LIST_NOT_FOUND', 'NOT_FOUND'),
  });
  useDocumentTitle(list.data?.name);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ReadingListValues>({ name: '', description: '', isPublic: false });
  const [formError, setFormError] = useState<{ field: keyof ReadingListValues; message: string } | null>(null);
  const [order, setOrder] = useState<ReadingListItem[] | null>(null);
  const [initialOrder, setInitialOrder] = useState<number[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.readingLists.all });

  async function startEdit(l: ReadingListDetail) {
    setDraft({ name: l.name, description: l.description ?? '', isPublic: l.isPublic });
    setFormError(null);
    setEditing(true);
    setLoadingAll(true);
    try {
      // T8 needs every public story of the list, not only this page.
      const all = await getAllListItems(l.listId);
      setOrder(all);
      setInitialOrder(orderOf(all));
    } catch (e) {
      toast.error(errorMessage(e));
      setEditing(false);
    } finally {
      setLoadingAll(false);
    }
  }

  function stopEdit() {
    setEditing(false);
    setOrder(null);
    setFormError(null);
  }

  async function remove(item: ReadingListItem) {
    if (listId === null) return;
    setRemovingId(item.story.storyId);
    try {
      await removeListItem(listId, item.story.storyId);
      setOrder((o) => o?.filter((x) => x.story.storyId !== item.story.storyId) ?? null);
      setInitialOrder((ids) => ids.filter((id) => id !== item.story.storyId));
      toast.success(`Đã bỏ “${item.story.title}” khỏi tủ.`);
      void refresh();
    } catch (e) {
      if (hasCode(e, 'STORY_NOT_IN_LIST')) {
        setOrder((o) => o?.filter((x) => x.story.storyId !== item.story.storyId) ?? null);
      } else toast.error(errorMessage(e));
    } finally {
      setRemovingId(null);
    }
  }

  async function save(l: ReadingListDetail) {
    const parsed = readingListSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError({ field: issue.path[0] as keyof ReadingListValues, message: issue.message });
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const v = parsed.data;
      const changed = v.name !== l.name || v.description !== (l.description ?? '') || v.isPublic !== l.isPublic;
      if (changed) await updateList(l.listId, { name: v.name, description: v.description, isPublic: v.isPublic });
      const ids = orderOf(order ?? []);
      if (order && !sameOrder(ids, initialOrder)) await reorderList(l.listId, ids);
      toast.success('Đã lưu tủ truyện.');
      stopEdit();
      void refresh();
    } catch (e) {
      if (hasCode(e, 'READING_LIST_NAME_TAKEN')) setFormError({ field: 'name', message: LIBRARY_MSG.nameTaken });
      else if (hasCode(e, 'INVALID_ITEM_ORDER')) {
        toast.error('Tủ vừa thay đổi ở nơi khác. Thứ tự đã được tải lại, hãy sắp xếp lại.');
        void startEdit(l);
      } else toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (listId === null || (list.isError && hasCode(list.error, 'READING_LIST_NOT_FOUND', 'NOT_FOUND'))) return <NotFound />;
  if (list.isError) return <ErrorResult title="Chưa tải được tủ truyện" onRetry={() => list.refetch()} />;

  const l = list.data;
  if (!l) {
    return (
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6" role="status" aria-label="Đang tải tủ truyện">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-[420px] rounded-lg" />
      </div>
    );
  }

  const items = l.items.items;
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-7">
      <ShelfHeader
        list={l}
        editing={editing}
        draft={draft}
        onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        error={formError}
        onEdit={() => void startEdit(l)}
        onCancel={stopEdit}
        onSave={() => void save(l)}
        saving={saving}
      />
      {editing && (
        <p className="text-small text-muted-foreground">
          Nhấn giữ tay cầm bên trái rồi kéo lên hoặc xuống để đổi vị trí truyện. Bàn phím: Tab tới tay cầm, Space để nhấc, mũi tên để di chuyển.
        </p>
      )}
      <section aria-label="Truyện trong tủ" aria-busy={loadingAll} className="overflow-hidden rounded-lg border border-border bg-card">
        {editing ? (
          loadingAll || !order ? (
            <p className="flex items-center justify-center gap-2 px-5 py-14 text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={1.75} /> Đang tải toàn bộ tủ…
            </p>
          ) : order.length === 0 ? (
            <p className="px-5 py-14 text-center text-muted-foreground">Tủ chưa có truyện nào.</p>
          ) : (
            <SortableShelf items={order} onChange={setOrder} onRemove={(i) => void remove(i)} removingId={removingId} />
          )
        ) : items.length === 0 ? (
          <p className="px-5 py-14 text-center text-muted-foreground">
            Tủ chưa có truyện nào.{l.isOwner && ' Thêm truyện từ trang chi tiết truyện.'}
          </p>
        ) : (
          items.map((item, i) => <ShelfItemRow key={item.story.storyId} item={item} position={page * LIST_PAGE_SIZE + i + 1} />)
        )}
      </section>
      {!editing && (
        <AppPagination
          page={l.items.page}
          totalPages={l.items.totalPages}
          totalElements={l.items.totalElements}
          unit="truyện"
          onPageChange={(p) => {
            const next = new URLSearchParams(params);
            if (p > 0) next.set('page', String(p));
            else next.delete('page');
            setParams(next);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </div>
  );
}
