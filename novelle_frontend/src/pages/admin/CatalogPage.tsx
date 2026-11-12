import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { createGenre, deleteGenre, deleteTag, getAdminGenres, getAdminTags, renameTag, updateGenre } from '@/api/admin';
import { queryKeys } from '@/api/queryKeys';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { AdminSearch } from '@/components/admin/AdminSearch';
import { GenreBlockedDialog, GenreFormDialog, GenreTable, TagRenameDialog, TagTable } from '@/components/admin/CatalogParts';
import { AppPagination } from '@/components/common/AppPagination';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorResult } from '@/components/common/ErrorResult';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toastAdminError } from '@/hooks/useAdminActions';
import { useDocumentTitle } from '@/hooks/useCatalog';
import type { AdminGenre, AdminTag, GenreValues } from '@/types/admin';
import { hasCode } from '@/utils/errors';
import { formatNumber } from '@/utils/format';

const TAG_PAGE = 20;
type Tab = 'genres' | 'tags';

/**
 * AD6 · Danh mục (/admin/catalog?tab=tags&q=&page=, board AdminCatalog): tabs Thể loại / Tag with counts;
 * genres (G1) with add / edit (G2 / G3, slug read-only) and delete (G4: a genre still used opens "Không xoá
 * được" with its story count, also on a 409 GENRE_IN_USE); tags (T1, most used first) with search, paging,
 * rename (T2) and delete (T3, removed from every story).
 */
export default function CatalogPage() {
  useDocumentTitle('Danh mục');
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'tags' ? 'tags' : 'genres';
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  const page = Math.max(0, Math.floor(Number(params.get('page'))) || 0);

  const [form, setForm] = useState<{ genre?: AdminGenre } | null>(null);
  const [deletingGenre, setDeletingGenre] = useState<AdminGenre | null>(null);
  const [blocked, setBlocked] = useState<AdminGenre | null>(null);
  const [renaming, setRenaming] = useState<AdminTag | null>(null);
  const [deletingTag, setDeletingTag] = useState<AdminTag | null>(null);

  const go = (next: { tab?: Tab; q?: string; page?: number }, push = false) => {
    const p = new URLSearchParams();
    const t = next.tab ?? tab;
    if (t === 'tags') {
      p.set('tab', 'tags');
      const nq = next.q ?? q;
      if (nq) p.set('q', nq);
      if (next.page) p.set('page', String(next.page));
    }
    setParams(p, { replace: !push });
  };

  const genres = useQuery({ queryKey: queryKeys.admin.genres, queryFn: getAdminGenres });
  const tagQuery = { q: q || undefined, page, size: TAG_PAGE };
  const tags = useQuery({ queryKey: queryKeys.admin.tags(tagQuery), queryFn: () => getAdminTags(tagQuery), placeholderData: keepPreviousData });

  const genresChanged = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.admin.genres });
    void qc.invalidateQueries({ queryKey: queryKeys.genres });
    void qc.invalidateQueries({ queryKey: queryKeys.admin.stats.genres });
  };
  const tagsChanged = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.admin.tagsAll });
    void qc.invalidateQueries({ queryKey: queryKeys.tagsAll });
    void qc.invalidateQueries({ queryKey: queryKeys.stories.all });
  };

  const saveGenre = useMutation({
    mutationFn: ({ genre, v }: { genre?: AdminGenre; v: GenreValues }) =>
      genre
        ? updateGenre(genre.genreId, { name: v.name, description: v.description, sortOrder: v.sortOrder })
        : createGenre({ name: v.name, description: v.description || undefined, sortOrder: v.sortOrder }),
    onSuccess: (g, { genre }) => {
      genresChanged();
      toast.success(genre ? `Đã lưu thể loại “${g.name}”` : `Đã thêm thể loại “${g.name}”`);
    },
  });
  const removeGenre = useMutation({
    mutationFn: (g: AdminGenre) => deleteGenre(g.genreId),
    onSuccess: (_, g) => {
      setDeletingGenre(null);
      genresChanged();
      toast.success(`Đã xoá thể loại “${g.name}”`);
    },
    onError: (e, g) => {
      setDeletingGenre(null);
      if (hasCode(e, 'GENRE_IN_USE')) setBlocked(g);
      else toastAdminError(e);
      genresChanged();
    },
  });
  const rename = useMutation({
    mutationFn: ({ tag, name }: { tag: AdminTag; name: string }) => renameTag(tag.tagId, name),
    onSuccess: (t, { tag }) => {
      tagsChanged();
      toast.success(`Đã đổi #${tag.name} thành #${t.name}`);
    },
  });
  const removeTag = useMutation({
    mutationFn: (t: AdminTag) => deleteTag(t.tagId),
    onSuccess: (_, t) => {
      setDeletingTag(null);
      tagsChanged();
      toast.success(`Đã xoá tag #${t.name}`);
    },
    onError: (e) => {
      setDeletingTag(null);
      toastAdminError(e);
      if (hasCode(e, 'TAG_NOT_FOUND')) tagsChanged();
    },
  });

  const genreList = genres.data ?? [];
  const nextOrder = genreList.reduce((m, g) => Math.max(m, g.sortOrder), 0) + 1;
  const askDeleteGenre = (g: AdminGenre) => (g.storyCount > 0 ? setBlocked(g) : setDeletingGenre(g));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">Danh mục</h1>
        {tab === 'genres' && (
          <Button onClick={() => setForm({})}>
            <Plus strokeWidth={1.75} /> Thêm thể loại
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <AdminFilterTabs
          label="Danh mục"
          value={tab}
          onChange={(t) => go({ tab: t, q: '', page: 0 }, true)}
          tabs={[
            { value: 'genres', label: 'Thể loại', count: genres.data?.length },
            { value: 'tags', label: 'Tag', count: q ? undefined : tags.data?.totalElements },
          ]}
        />
        {tab === 'tags' && <AdminSearch value={q} onSearch={(nq) => go({ q: nq, page: 0 })} label="Tìm tag" placeholder="Tìm tag" />}
      </div>

      {tab === 'genres' ? (
        genres.isError ? (
          <ErrorResult title="Chưa tải được thể loại" onRetry={() => genres.refetch()} />
        ) : !genres.data ? (
          <Skeleton className="h-[420px] rounded-lg" />
        ) : genreList.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-5 py-12 text-center text-muted-foreground">Chưa có thể loại nào. Thêm thể loại đầu tiên để tác giả chọn khi tạo truyện.</p>
        ) : (
          <GenreTable genres={genreList} onEdit={(g) => setForm({ genre: g })} onDelete={askDeleteGenre} />
        )
      ) : tags.isError ? (
        <ErrorResult title="Chưa tải được tag" onRetry={() => tags.refetch()} />
      ) : !tags.data ? (
        <Skeleton className="h-[420px] rounded-lg" />
      ) : (
        <>
          <div aria-busy={tags.isFetching}>
            <TagTable tags={tags.data.items} onRename={setRenaming} onDelete={setDeletingTag} />
          </div>
          {tags.data.totalElements > 0 && (
            <AppPagination page={tags.data.page} totalPages={tags.data.totalPages} totalElements={tags.data.totalElements} unit="tag" onPageChange={(p) => go({ page: p }, true)} />
          )}
        </>
      )}

      <GenreFormDialog
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        genre={form?.genre}
        nextOrder={nextOrder}
        onSubmit={(v) => saveGenre.mutateAsync({ genre: form?.genre, v })}
      />
      <ConfirmDialog
        open={deletingGenre !== null}
        onOpenChange={(o) => !o && !removeGenre.isPending && setDeletingGenre(null)}
        title={`Xoá thể loại “${deletingGenre?.name ?? ''}”?`}
        description="Thể loại chưa có truyện nào. Xoá xong không hoàn tác được."
        confirmLabel="Xoá thể loại"
        pendingLabel="Đang xoá…"
        destructive
        pending={removeGenre.isPending}
        onConfirm={() => deletingGenre && removeGenre.mutate(deletingGenre)}
      />
      <GenreBlockedDialog genre={blocked} onClose={() => setBlocked(null)} />
      <TagRenameDialog tag={renaming} onClose={() => setRenaming(null)} onSubmit={(name) => rename.mutateAsync({ tag: renaming!, name })} />
      <ConfirmDialog
        open={deletingTag !== null}
        onOpenChange={(o) => !o && !removeTag.isPending && setDeletingTag(null)}
        title={`Xoá tag “${deletingTag?.name ?? ''}”?`}
        description={`Tag sẽ bị gỡ khỏi ${formatNumber(deletingTag?.usageCount ?? 0)} truyện đang dùng. Không hoàn tác được.`}
        confirmLabel="Xoá tag"
        pendingLabel="Đang xoá…"
        destructive
        pending={removeTag.isPending}
        onConfirm={() => deletingTag && removeTag.mutate(deletingTag)}
      />
    </div>
  );
}
