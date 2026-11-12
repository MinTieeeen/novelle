import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { deleteHistory, getFollowedAuthors, getFollowedStories, getHistory, setAuthorFollow } from '@/api/library';
import { queryKeys } from '@/api/queryKeys';
import { createList, deleteList, getMyLists, updateList } from '@/api/readingLists';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorResult } from '@/components/common/ErrorResult';
import { FollowedAuthorRow, HistoryCard, ShelfCard } from '@/components/library/LibraryItems';
import { ReadingListFormDialog } from '@/components/library/ReadingListFormDialog';
import { StoryCard } from '@/components/story/StoryCard';
import { StoryGridSkeleton } from '@/components/story/StorySkeletons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { useLoadMore } from '@/hooks/useLoadMore';
import type { PageResponse } from '@/types/api';
import { LIBRARY_MSG, type HistoryItem, type ReadingListSummary, type ReadingListValues } from '@/types/library';
import { errorMessage, hasCode } from '@/utils/errors';
import { formatNumber } from '@/utils/format';

const HISTORY_SIZE = 10;
const GRID = 'grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))] sm:gap-x-6';

function Section({ id, title, count, children }: { id: string; title: string; count?: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <h2 id={id} className="font-serif text-[20px] leading-[26px] font-semibold">
        {title}{' '}
        {count !== undefined && <span className="num font-sans text-label font-normal text-muted-foreground">{formatNumber(count)}</span>}
      </h2>
      {children}
    </section>
  );
}

function MoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <Button variant="outline" className="self-center px-5" onClick={onClick} disabled={loading}>
      {loading && <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden />}
      Xem thêm
    </Button>
  );
}

/** Tab "Đang đọc & theo dõi": history, followed stories, followed authors (board Library). */
function ReadingTab() {
  const queryClient = useQueryClient();
  const history = useLoadMore(queryKeys.library.history(HISTORY_SIZE), (page) => getHistory({ page, size: HISTORY_SIZE }));
  const follows = useLoadMore(queryKeys.library.follows, (page) => getFollowedStories({ page, size: 12 }));
  const authors = useLoadMore(queryKeys.library.authors, (page) => getFollowedAuthors({ page, size: 10 }));
  // Authors unfollowed here stay in the list (board): "Theo dõi" follows them again.
  const [unfollowed, setUnfollowed] = useState<Set<number>>(new Set());

  const removeHistory = useMutation({
    mutationFn: (item: HistoryItem) => deleteHistory(item.story.storyId),
    onMutate: (item) => {
      const key = queryKeys.library.history(HISTORY_SIZE);
      const previous = queryClient.getQueryData<InfiniteData<PageResponse<HistoryItem>>>(key);
      queryClient.setQueryData<InfiniteData<PageResponse<HistoryItem>>>(key, (d) =>
        d && {
          ...d,
          pages: d.pages.map((p, i) => ({
            ...p,
            items: p.items.filter((h) => h.story.storyId !== item.story.storyId),
            totalElements: i === 0 ? p.totalElements - 1 : p.totalElements,
          })),
        },
      );
      return { previous };
    },
    onError: (e, _item, ctx) => {
      queryClient.setQueryData(queryKeys.library.history(HISTORY_SIZE), ctx?.previous);
      toast.error(errorMessage(e));
    },
    onSuccess: (_d, item) => {
      toast.success(`Đã xoá “${item.story.title}” khỏi lịch sử đọc.`);
      queryClient.removeQueries({ queryKey: queryKeys.readingProgress(item.story.storyId) });
      void queryClient.invalidateQueries({ queryKey: ['library', 'history'] });
    },
  });

  const toggleAuthor = useMutation({
    mutationFn: ({ authorId, follow }: { authorId: number; follow: boolean }) => setAuthorFollow(authorId, follow),
    onMutate: ({ authorId, follow }) =>
      setUnfollowed((s) => {
        const next = new Set(s);
        if (follow) next.delete(authorId);
        else next.add(authorId);
        return next;
      }),
    onError: (e, { authorId, follow }) => {
      setUnfollowed((s) => {
        const next = new Set(s);
        if (follow) next.add(authorId);
        else next.delete(authorId);
        return next;
      });
      if (!hasCode(e, 'RATE_LIMITED')) toast.error(errorMessage(e));
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.follow.author(data.authorId), data);
    },
  });

  if (history.query.isError && follows.query.isError && authors.query.isError) {
    return <ErrorResult title="Chưa tải được thư viện" onRetry={() => void queryClient.invalidateQueries({ queryKey: queryKeys.library.all })} />;
  }

  return (
    <div className="flex flex-col gap-12">
      <Section id="lib-reading" title="Đang đọc" count={history.query.isSuccess ? history.total : undefined}>
        {history.query.isPending ? (
          <StoryGridSkeleton count={5} />
        ) : history.items.length === 0 ? (
          <p className="text-muted-foreground">Lịch sử đọc trống. Truyện bạn đọc sẽ hiện ở đây.</p>
        ) : (
          <div className={GRID}>
            {history.items.map((h) => (
              <HistoryCard
                key={h.story.storyId}
                item={h}
                onRemove={() => removeHistory.mutate(h)}
                removing={removeHistory.isPending && removeHistory.variables?.story.storyId === h.story.storyId}
              />
            ))}
          </div>
        )}
        {history.hasMore && <MoreButton onClick={history.loadMore} loading={history.loadingMore} />}
      </Section>

      <Section id="lib-follows" title="Truyện theo dõi" count={follows.query.isSuccess ? follows.total : undefined}>
        {follows.query.isPending ? (
          <StoryGridSkeleton count={6} />
        ) : follows.items.length === 0 ? (
          <p className="text-muted-foreground">
            Chưa theo dõi truyện nào
            
          </p>
        ) : (
          <div className={GRID}>
            {follows.items.map((s) => (
              <StoryCard key={s.storyId} story={s} />
            ))}
          </div>
        )}
        {follows.hasMore && <MoreButton onClick={follows.loadMore} loading={follows.loadingMore} />}
      </Section>

      <Section id="lib-authors" title="Tác giả theo dõi" count={authors.query.isSuccess ? authors.total : undefined}>
        {authors.query.isPending ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : authors.items.length === 0 ? (
          <p className="text-muted-foreground">Chưa theo dõi tác giả nào.</p>
        ) : (
          <ul className="flex flex-col">
            {authors.items.map((a) => (
              <FollowedAuthorRow
                key={a.authorId}
                author={a}
                following={!unfollowed.has(a.authorId)}
                pending={toggleAuthor.isPending && toggleAuthor.variables?.authorId === a.authorId}
                onToggle={() => toggleAuthor.mutate({ authorId: a.authorId, follow: unfollowed.has(a.authorId) })}
              />
            ))}
          </ul>
        )}
        {authors.hasMore && <MoreButton onClick={authors.loadMore} loading={authors.loadingMore} />}
      </Section>
    </div>
  );
}

/** Tab "Tủ truyện": my lists with create / rename / delete (board Library). */
function ListsTab() {
  const queryClient = useQueryClient();
  const lists = useQuery({ queryKey: queryKeys.readingLists.mine, queryFn: getMyLists });
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; list: ReadingListSummary } | null>(null);
  const [deleting, setDeleting] = useState<ReadingListSummary | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.readingLists.all });

  async function save(values: ReadingListValues) {
    const body = { name: values.name, description: values.description, isPublic: values.isPublic };
    try {
      if (form?.mode === 'edit') {
        await updateList(form.list.listId, body);
        toast.success('Đã lưu tủ truyện.');
      } else {
        const created = await createList(body);
        toast.success(`Đã tạo tủ “${created.name}”.`);
      }
      void refresh();
    } catch (e) {
      if (hasCode(e, 'READING_LIST_LIMIT')) toast.error(LIBRARY_MSG.listLimit);
      else if (hasCode(e, 'READING_LIST_NOT_FOUND')) {
        toast.error('Tủ này không còn nữa.');
        void refresh();
      } else if (!hasCode(e, 'READING_LIST_NAME_TAKEN', 'VALIDATION_FAILED')) toast.error(errorMessage(e));
      throw e;
    }
  }

  const remove = useMutation({
    mutationFn: (list: ReadingListSummary) => deleteList(list.listId),
    onSuccess: (_d, list) => {
      setDeleting(null);
      toast.success(`Đã xoá tủ “${list.name}”.`);
      queryClient.setQueryData<ReadingListSummary[]>(queryKeys.readingLists.mine, (l) => l?.filter((x) => x.listId !== list.listId));
      void refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <section aria-label="Tủ truyện" className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button onClick={() => setForm({ mode: 'create' })}>
          <Plus strokeWidth={1.75} /> Tạo tủ mới
        </Button>
      </div>
      {lists.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[220px] rounded-lg" />
          ))}
        </div>
      ) : lists.isError ? (
        <ErrorResult title="Chưa tải được tủ truyện" onRetry={() => lists.refetch()} />
      ) : lists.data.length === 0 ? (
        <EmptyState
          title="Bạn chưa có tủ truyện nào"
          description="Gom các truyện muốn đọc vào một tủ để tìm lại nhanh."
          action={<Button onClick={() => setForm({ mode: 'create' })}>Tạo tủ truyện</Button>}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {lists.data.map((l) => (
            <ShelfCard key={l.listId} list={l} onRename={() => setForm({ mode: 'edit', list: l })} onDelete={() => setDeleting(l)} />
          ))}
        </div>
      )}

      <ReadingListFormDialog
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        mode={form?.mode ?? 'create'}
        defaultValues={
          form?.mode === 'edit' ? { name: form.list.name, description: form.list.description ?? '', isPublic: form.list.isPublic } : undefined
        }
        onSubmit={save}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Xoá tủ “${deleting?.name ?? ''}”?`}
        description="Tủ bị xoá, các truyện bên trong vẫn nằm trong danh sách theo dõi của bạn. Không hoàn tác được."
        confirmLabel="Xoá tủ"
        pendingLabel="Đang xoá…"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </section>
  );
}

/**
 * R7 · Thư viện (/library, board Library): tab "Đang đọc & theo dõi" (history, followed stories, followed
 * authors, each with "Xem thêm") and tab "Tủ truyện" (?tab=lists). READER and AUTHOR only.
 */
export default function LibraryPage() {
  useDocumentTitle('Thư viện');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'lists' ? 'lists' : 'reading';

  const setTab = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === 'lists') p.set('tab', 'lists');
    else p.delete('tab');
    setParams(p, { replace: true });
  };

  return (
    <div className="flex flex-col gap-7">
      <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">Thư viện</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Thư viện">
          <TabsTrigger value="reading">Tất cả</TabsTrigger>
          <TabsTrigger value="lists">Tủ truyện</TabsTrigger>
        </TabsList>
        <TabsContent value="reading" className="pt-6">
          <ReadingTab />
        </TabsContent>
        <TabsContent value="lists" className="pt-6">
          <ListsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
