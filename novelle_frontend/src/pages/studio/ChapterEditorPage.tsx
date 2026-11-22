import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import { ChevronLeft, History } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { queryKeys } from '@/api/queryKeys';
import {
  discardDraft,
  getRevision,
  getRevisions,
  getStudioChapter,
  getStudioStory,
  getVolumes,
  publishChapter,
  restoreRevision,
  saveChapter,
  saveDraft,
  scheduleChapter,
  unscheduleChapter,
} from '@/api/studio';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorResult } from '@/components/common/ErrorResult';
import { ChapterStatusBadge } from '@/components/studio/StudioBadges';
import { editorHtml } from '@/components/studio/editorConfig';
import { ConflictDialog, DraftBanner, SaveStatus } from '@/components/studio/EditorParts';
import { PublishPopover } from '@/components/studio/PublishPopover';
import { RevisionPanel, RevisionPreviewDialog } from '@/components/studio/RevisionPanel';
import { RichTextEditor } from '@/components/studio/RichTextEditor';
import { FOCUS } from '@/components/studio/studioStyles';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAutosave } from '@/hooks/useAutosave';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { useCooldown } from '@/hooks/useCooldown';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { cn } from '@/lib/utils';
import { chapterLabel } from '@/types/story';
import { CHAPTER_CONTENT_MAX, CHAPTER_TITLE_MAX, chapterTitleSchema, textLength, type Revision, type StudioChapter } from '@/types/studio';
import { errorMessage, hasCode, retryAfterSeconds } from '@/utils/errors';

/** What "Lưu" last stored (C6), compared with the editor to know whether something changed. */
interface Saved {
  title: string;
  content: string;
  volumeId: number | null;
  version: string;
  savedAt: string | null;
}

const parseId = (raw: string | undefined) => (raw && /^\d{1,18}$/.test(raw) ? Number(raw) : null);

/**
 * S4 · Soạn chương (/studio/stories/:storyId/chapters/:chapterId, board ChapterEditor). Full screen:
 * top bar (back, story › chapter, volume, save state, Lịch sử, Lưu, Xuất bản), draft banner, formatting
 * toolbar, title + text. Autosaves a Redis draft every 10 s while changed (C4); "Lưu" / Ctrl+S stores the
 * chapter with its version (C6, 409 → ConflictDialog); publish now / schedule / unschedule (C7–C9, after
 * saving); revisions R1–R3; leaving with unsaved changes asks first.
 */
export default function ChapterEditorPage() {
  const params = useParams();
  const storyId = parseId(params.storyId);
  const chapterId = parseId(params.chapterId);
  const queryClient = useQueryClient();
  const cooldown = useCooldown();

  const chapter = useQuery({
    queryKey: queryKeys.studio.chapter(chapterId ?? 0),
    queryFn: () => getStudioChapter(chapterId!),
    enabled: chapterId !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: (n, e) => n < 1 && !hasCode(e, 'CHAPTER_NOT_FOUND', 'NOT_FOUND'),
  });
  const story = useQuery({ queryKey: queryKeys.studio.story(storyId ?? 0), queryFn: () => getStudioStory(storyId!), enabled: storyId !== null });
  const volumes = useQuery({ queryKey: queryKeys.studio.volumes(storyId ?? 0), queryFn: () => getVolumes(storyId!), enabled: storyId !== null });

  const editorRef = useRef<Editor | null>(null);
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const [volumeId, setVolumeId] = useState<number | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [changeId, setChangeId] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<StudioChapter['draft']>(null);
  const [conflict, setConflict] = useState(false);
  const [conflictPending, setConflictPending] = useState<'load' | 'overwrite' | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [preview, setPreview] = useState<Revision | null>(null);
  const [restoring, setRestoring] = useState<Revision | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const latest = useRef({ title, html });
  latest.current = { title, html };

  const c = chapter.data;
  useDocumentTitle(c ? `Soạn · ${chapterLabel({ chapterNo: c.chapterNo, title: title || c.title })}` : 'Soạn chương');

  /** Puts a server chapter into the editor and makes it the saved baseline. */
  const applyChapter = useCallback(
    (ch: StudioChapter, opts: { keepDraftBanner?: boolean } = {}) => {
      const ed = editorRef.current;
      if (ed) ed.commands.setContent(ch.content || '', { emitUpdate: false });
      const normalized = ed ? editorHtml(ed) : ch.content;
      setTitle(ch.title);
      setHtml(normalized);
      setVolumeId(ch.volumeId ?? null);
      setSaved({ title: ch.title, content: normalized, volumeId: ch.volumeId ?? null, version: ch.version, savedAt: null });
      if (!opts.keepDraftBanner) setDraft(ch.draft ?? null);
      queryClient.setQueryData(queryKeys.studio.chapter(ch.chapterId), ch);
    },
    [queryClient],
  );

  // First load (and after "Tải bản mới nhất"): once both the chapter and the editor exist.
  const [editorReady, setEditorReady] = useState(false);
  const loadedVersion = useRef<string | null>(null);
  useEffect(() => {
    if (!c || !editorReady || loadedVersion.current === c.version) return;
    loadedVersion.current = c.version;
    applyChapter(c);
  }, [c, editorReady, applyChapter]);

  const dirty = !!saved && (title !== saved.title || html !== saved.content || volumeId !== saved.volumeId);

  const autosave = useAutosave({
    changeId,
    paused: !saved || saving || !dirty,
    save: () => saveDraft(chapterId!, { title: latest.current.title.slice(0, CHAPTER_TITLE_MAX), content: latest.current.html }),
  });

  const blocker = useUnsavedChanges(dirty);

  const afterServerChange = (ch: StudioChapter) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.studio.chapters(ch.storyId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.studio.revisions(ch.chapterId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.studio.story(ch.storyId) });
  };

  /** C6 with the current text; returns the saved chapter or null (errors handled here). */
  const save = useCallback(
    async (opts: { version?: string; quiet?: boolean } = {}): Promise<StudioChapter | null> => {
      if (!saved || chapterId === null) return null;
      const parsed = chapterTitleSchema.safeParse(latest.current.title);
      if (!parsed.success) {
        setTitleError(parsed.error.issues[0].message);
        titleRef.current?.focus();
        return null;
      }
      if (latest.current.html.length > CHAPTER_CONTENT_MAX) {
        toast.error('Nội dung chương dài quá 200.000 ký tự. Hãy tách thành nhiều chương.');
        return null;
      }
      setTitleError(null);
      setSaving(true);
      try {
        const res = await saveChapter(chapterId, { title: parsed.data, content: latest.current.html, volumeId, version: opts.version ?? saved.version });
        loadedVersion.current = res.version;
        setSaved({ title: parsed.data, content: latest.current.html, volumeId, version: res.version, savedAt: new Date().toISOString() });
        setTitle(parsed.data);
        setDraft(null);
        autosave.markSaved();
        queryClient.setQueryData(queryKeys.studio.chapter(res.chapterId), { ...res, draft: null });
        afterServerChange(res);
        if (!opts.quiet) toast.success('Đã lưu chương.');
        return res;
      } catch (e) {
        if (hasCode(e, 'STALE_DATA')) setConflict(true);
        else if (hasCode(e, 'VOLUME_NOT_IN_STORY', 'VOLUME_NOT_FOUND')) {
          toast.error('Tập đã chọn không còn trong truyện. Chọn lại tập.');
          setVolumeId(null);
          void volumes.refetch();
        } else toast.error(errorMessage(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved, chapterId, volumeId, autosave.markSaved, queryClient],
  );

  async function loadLatest() {
    if (chapterId === null) return;
    setConflictPending('load');
    try {
      // Keep my text as the Redis draft first, so the banner can bring it back.
      await saveDraft(chapterId, { title: latest.current.title.slice(0, CHAPTER_TITLE_MAX), content: latest.current.html }).catch(() => undefined);
      const fresh = await getStudioChapter(chapterId);
      loadedVersion.current = fresh.version;
      applyChapter(fresh);
      autosave.markSaved();
      setConflict(false);
      toast.info('Đã tải bản mới nhất. Bản bạn đang soạn được giữ thành bản nháp.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setConflictPending(null);
    }
  }

  async function overwrite() {
    if (chapterId === null) return;
    setConflictPending('overwrite');
    try {
      const fresh = await getStudioChapter(chapterId);
      const res = await save({ version: fresh.version });
      if (res) setConflict(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setConflictPending(null);
    }
  }

  const statusChange = useMutation({
    mutationFn: async (action: { kind: 'now' } | { kind: 'schedule'; iso: string } | { kind: 'unschedule' }) => {
      if (action.kind !== 'unschedule' && dirty) {
        const ok = await save({ quiet: true });
        if (!ok) throw new Error('not saved');
      }
      if (action.kind === 'now') return publishChapter(chapterId!);
      if (action.kind === 'schedule') return scheduleChapter(chapterId!, action.iso);
      return unscheduleChapter(chapterId!);
    },
    onSuccess: (res, action) => {
      setPublishOpen(false);
      loadedVersion.current = res.version;
      setSaved((s) => (s ? { ...s, version: res.version } : s));
      queryClient.setQueryData(queryKeys.studio.chapter(res.chapterId), { ...res, draft: null });
      afterServerChange(res);
      if (story.data) void queryClient.invalidateQueries({ queryKey: queryKeys.stories.detail(story.data.slug) });
      toast.success(action.kind === 'now' ? 'Đã xuất bản chương. Người đọc đã thấy chương này.' : action.kind === 'schedule' ? 'Đã hẹn giờ đăng chương.' : 'Đã huỷ hẹn giờ. Chương trở về bản nháp.');
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'not saved') return;
      if (hasCode(e, 'CHAPTER_EMPTY')) {
        toast.error('Chương chưa có nội dung.');
        editorRef.current?.commands.focus();
      } else if (hasCode(e, 'RATE_LIMITED')) cooldown.start(retryAfterSeconds(e) ?? 60);
      else if (hasCode(e, 'ALREADY_PROCESSED', 'CHAPTER_ALREADY_PUBLISHED')) {
        toast.info('Trạng thái chương vừa thay đổi. Đã tải lại.');
        void chapter.refetch();
      } else if (hasCode(e, 'VALIDATION_FAILED')) toast.error('Thời điểm hẹn không hợp lệ: chọn sau bây giờ ít nhất 1 phút và trong vòng 365 ngày.');
      else toast.error(errorMessage(e));
    },
  });

  const revisions = useQuery({
    queryKey: queryKeys.studio.revisions(chapterId ?? 0),
    queryFn: () => getRevisions(chapterId!),
    enabled: historyOpen && chapterId !== null,
  });
  const revisionDetail = useQuery({
    queryKey: [...queryKeys.studio.revisions(chapterId ?? 0), preview?.revisionNo],
    queryFn: () => getRevision(chapterId!, preview!.revisionNo),
    enabled: !!preview,
  });
  const restore = useMutation({
    mutationFn: (r: Revision) => restoreRevision(chapterId!, r.revisionNo, saved!.version),
    onSuccess: (res, r) => {
      setRestoring(null);
      setPreview(null);
      setHistoryOpen(false);
      loadedVersion.current = res.version;
      applyChapter({ ...res, draft: null });
      autosave.markSaved();
      afterServerChange(res);
      toast.success(`Đã khôi phục bản lúc ${new Date(r.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.`);
    },
    onError: (e) => {
      setRestoring(null);
      if (hasCode(e, 'STALE_DATA')) setConflict(true);
      else if (hasCode(e, 'REVISION_NOT_FOUND')) {
        toast.error('Bản sửa này không còn nữa.');
        void revisions.refetch();
      } else toast.error(errorMessage(e));
    },
  });

  async function restoreDraft() {
    if (!draft) return;
    editorRef.current?.commands.setContent(draft.content || '', { emitUpdate: false });
    setHtml(editorRef.current ? editorHtml(editorRef.current) : draft.content);
    setTitle(draft.title);
    setDraft(null);
    setChangeId((n) => n + 1);
    toast.info('Đã khôi phục bản nháp. Bấm “Lưu” để lưu lại.');
  }

  const discard = useMutation({
    mutationFn: () => discardDraft(chapterId!),
    onSuccess: () => setDraft(null),
    onError: () => setDraft(null),
  });

  if (storyId === null || chapterId === null || (chapter.isError && hasCode(chapter.error, 'CHAPTER_NOT_FOUND', 'NOT_FOUND'))) {
    return (
      <div className="mx-auto max-w-content px-4 py-16">
        <ErrorResult
          variant="not-found"
          title="Không tìm thấy chương này"
          description="Chương có thể đã bị xoá hoặc không thuộc truyện của bạn."
          action={
            <Button asChild>
              <Link to={storyId ? `/studio/stories/${storyId}` : '/studio'}>Về quản lý truyện</Link>
            </Button>
          }
        />
      </div>
    );
  }
  if (chapter.isError) {
    return (
      <div className="mx-auto max-w-content px-4 py-16">
        <ErrorResult title="Chưa tải được chương" onRetry={() => chapter.refetch()} />
      </div>
    );
  }

  const status = c?.status ?? 'DRAFT';
  const draftDiff = draft ? textLength(draft.content) - textLength(html) : 0;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-[57px] items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
        <Link
          to={`/studio/stories/${storyId}`}
          aria-label="Quay lại quản lý truyện"
          className={cn('grid size-10 flex-none place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground', FOCUS)}
        >
          <ChevronLeft aria-hidden className="size-5" strokeWidth={1.75} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-small text-muted-foreground">{story.data?.title ?? ' '}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-label font-semibold">{c ? chapterLabel({ chapterNo: c.chapterNo, title: title || c.title }) : 'Đang tải…'}</span>
            {c && <ChapterStatusBadge status={status} scheduledAt={c.scheduledAt} className="max-md:hidden" />}
          </span>
        </div>
        <label className="max-lg:hidden">
          <span className="sr-only">Chọn tập</span>
          <select
            value={volumeId ?? ''}
            onChange={(e) => {
              setVolumeId(e.target.value ? Number(e.target.value) : null);
              setChangeId((n) => n + 1);
            }}
            disabled={!saved}
            className={cn('h-9 max-w-[220px] rounded-md border border-input bg-card px-2.5 text-label', FOCUS)}
          >
            <option value="">Không thuộc tập nào</option>
            {(volumes.data ?? []).map((v) => (
              <option key={v.volumeId} value={v.volumeId}>
                Tập {v.volumeNo} · {v.title}
              </option>
            ))}
          </select>
        </label>
        <span className="max-md:hidden">
          <SaveStatus dirty={dirty} saving={saving} autosave={autosave.status} draftSavedAt={autosave.savedAt} savedAt={saved?.savedAt} />
        </span>
        <Button variant="ghost" onClick={() => setHistoryOpen(true)} aria-haspopup="dialog" className="max-sm:px-2.5">
          <History strokeWidth={1.75} />
          <span className="max-sm:sr-only">Lịch sử</span>
        </Button>
        <Button variant="outline" onClick={() => void save()} disabled={!saved || saving || !dirty} title="Ctrl+S">
          Lưu
        </Button>
        <PublishPopover
          status={status}
          scheduledAt={c?.scheduledAt}
          open={publishOpen}
          onOpenChange={setPublishOpen}
          disabled={!saved || cooldown.remaining > 0}
          pending={statusChange.isPending}
          onPublishNow={() => statusChange.mutate({ kind: 'now' })}
          onSchedule={(iso) => statusChange.mutate({ kind: 'schedule', iso })}
          onUnschedule={() => statusChange.mutate({ kind: 'unschedule' })}
        />
      </header>

      {draft && saved && (
        <DraftBanner savedAt={draft.savedAt} diff={draftDiff} onRestore={() => void restoreDraft()} onDiscard={() => discard.mutate()} busy={discard.isPending} />
      )}

      {!saved && (
        <div className="mx-auto w-full max-w-reading px-6 pt-14" role="status" aria-label="Đang tải chương">
          <Skeleton className="mb-6 h-10 w-3/4" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="mb-3 h-5" />
          ))}
        </div>
      )}

      <div className={cn('flex flex-1 flex-col', !saved && 'hidden')}>
        <RichTextEditor
          initialContent=""
          onReady={(ed) => {
            editorRef.current = ed;
            setEditorReady(true);
          }}
          onChange={(next) => {
            setHtml(next);
            setChangeId((n) => n + 1);
          }}
          onSave={() => void save()}
          header={
            <div className="mb-8">
              <label htmlFor="chapter-title" className="sr-only">
                Tiêu đề chương
              </label>
              <input
                id="chapter-title"
                ref={titleRef}
                value={title}
                maxLength={CHAPTER_TITLE_MAX + 20}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setChangeId((n) => n + 1);
                  if (titleError) setTitleError(null);
                }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    void save();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    editorRef.current?.commands.focus('start');
                  }
                }}
                placeholder="Tiêu đề chương"
                aria-invalid={!!titleError || undefined}
                className="w-full bg-transparent font-serif text-[28px] leading-9 font-[560] italic outline-none placeholder:text-muted-foreground sm:text-chapter-title"
              />
              {titleError && (
                <p role="alert" className="mt-1 text-small text-destructive">
                  {titleError}
                </p>
              )}
            </div>
          }
        />
      </div>

      <ConflictDialog open={conflict} pending={conflictPending} onLoadLatest={() => void loadLatest()} onOverwrite={() => void overwrite()} />
      <RevisionPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        revisions={revisions.data}
        error={revisions.isError}
        onView={(r) => setPreview(r)}
        onRestore={(r) => setRestoring(r)}
      />
      <RevisionPreviewDialog
        revision={preview ? (revisionDetail.data ?? preview) : null}
        loading={revisionDetail.isPending}
        onClose={() => setPreview(null)}
        onRestore={(r) => setRestoring(r)}
      />
      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(o) => !o && setRestoring(null)}
        title="Khôi phục bản này?"
        description={
          dirty
            ? 'Nội dung đang soạn chưa lưu sẽ bị thay bằng bản cũ. Bản trên máy chủ hiện tại được giữ trong lịch sử.'
            : 'Chương sẽ trở về nội dung của bản này. Bản hiện tại được giữ trong lịch sử.'
        }
        confirmLabel="Khôi phục"
        pendingLabel="Đang khôi phục…"
        pending={restore.isPending}
        onConfirm={() => restoring && restore.mutate(restoring)}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => !o && blocker.reset?.()}
        title="Rời trang khi chưa lưu?"
        description="Thay đổi chưa được lưu bằng nút “Lưu”. Bản nháp tự lưu vẫn còn, bạn có thể khôi phục khi mở lại chương."
        cancelLabel="Ở lại"
        confirmLabel="Rời trang"
        destructive
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}
