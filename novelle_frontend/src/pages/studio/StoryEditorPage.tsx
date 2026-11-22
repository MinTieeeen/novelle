import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, EyeOff, Send, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { queryKeys } from '@/api/queryKeys';
import {
  createChapter,
  createVolume,
  deleteChapter,
  deleteVolume,
  getStudioChapters,
  getStudioStory,
  getVolumes,
  renameVolume,
  replaceStoryGenres,
  replaceStoryTags,
  updateStoryInfo,
  type StoryInfoPatch,
} from '@/api/studio';
import { useAuth } from '@/auth/AuthProvider';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorResult } from '@/components/common/ErrorResult';
import { StoryCover } from '@/components/story/StoryCover';
import { ChapterList, VolumeFormDialog } from '@/components/studio/ChapterList';
import { StoryForm } from '@/components/studio/StoryForm';
import { PublishBadge } from '@/components/studio/StudioBadges';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDocumentTitle, useGenres } from '@/hooks/useCatalog';
import { useStudioStoryActions } from '@/hooks/useStudioStoryActions';
import { nextChapterTitle, storyToValues, tagSlug, type ChapterListItem, type StoryValues, type StudioStory, type Volume } from '@/types/studio';
import { errorMessage, hasCode } from '@/utils/errors';
import { formatNumber } from '@/utils/format';

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The S4 body with only the info fields that changed; null when nothing did. */
function infoPatch(s: StudioStory, v: StoryValues): StoryInfoPatch | null {
  const patch: StoryInfoPatch = { version: s.version };
  if (v.title !== s.title) patch.title = v.title;
  if (v.description !== (s.description ?? '')) patch.description = v.description;
  if (v.coverUrl !== (s.coverUrl ?? '')) patch.coverUrl = v.coverUrl;
  if (v.ageRating !== s.ageRating) patch.ageRating = v.ageRating;
  if (v.completionStatus !== s.completionStatus) patch.completionStatus = v.completionStatus;
  return Object.keys(patch).length > 1 ? patch : null;
}

/**
 * S3 · Quản lý truyện (/studio/stories/:storyId?tab=info, board StudioManage): header (cover, title, status,
 * "genres · N chương · lượt xem", public page, Đăng / Gỡ đăng), tab "Chương & tập" (ChapterList: volumes,
 * chapters, create / rename / delete) and tab "Thông tin" (StoryForm edit + "Xoá truyện"). A hidden story
 * shows the admin's reason and cannot be published or unpublished.
 */
export default function StoryEditorPage() {
  const raw = useParams().storyId ?? '';
  const storyId = /^\d{1,9}$/.test(raw) ? Number(raw) : null;
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'info' ? 'info' : 'chapters';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const genres = useGenres();

  const story = useQuery({
    queryKey: queryKeys.studio.story(storyId ?? 0),
    queryFn: () => getStudioStory(storyId!),
    enabled: storyId !== null,
    retry: (n, e) => n < 1 && !hasCode(e, 'STORY_NOT_FOUND', 'NOT_FOUND'),
  });
  const volumes = useQuery({ queryKey: queryKeys.studio.volumes(storyId ?? 0), queryFn: () => getVolumes(storyId!), enabled: storyId !== null });
  const chapters = useQuery({ queryKey: queryKeys.studio.chapters(storyId ?? 0), queryFn: () => getStudioChapters(storyId!), enabled: storyId !== null });
  const s = story.data;
  useDocumentTitle(s ? `Quản lý · ${s.title}` : 'Quản lý truyện');

  const actions = useStudioStoryActions({ onDeleted: () => navigate('/studio', { replace: true }) });
  const [conflict, setConflict] = useState(false);
  const [volumeForm, setVolumeForm] = useState<{ volume?: Volume } | null>(null);
  const [deletingVolume, setDeletingVolume] = useState<Volume | null>(null);
  const [deletingChapter, setDeletingChapter] = useState<ChapterListItem | null>(null);
  const [deletingStory, setDeletingStory] = useState(false);

  const formValues = useMemo(() => (s ? storyToValues(s) : undefined), [s]);

  const invalidateTree = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.studio.story(storyId ?? 0) });
    void queryClient.invalidateQueries({ queryKey: ['studio', 'stories'] });
  };

  const newChapter = useMutation({
    mutationFn: (volumeId: number | null) => createChapter(storyId!, { title: nextChapterTitle(chapters.data ?? []), volumeId }),
    onSuccess: (c) => {
      invalidateTree();
      navigate(`/studio/stories/${storyId}/chapters/${c.chapterId}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const removeVolume = useMutation({
    mutationFn: (v: Volume) => deleteVolume(v.volumeId),
    onSuccess: (_d, v) => {
      setDeletingVolume(null);
      toast.success(`Đã xoá tập ${v.volumeNo}.`);
      invalidateTree();
    },
    onError: (e) => {
      setDeletingVolume(null);
      if (hasCode(e, 'VOLUME_NOT_EMPTY')) toast.error('Hãy chuyển hoặc xoá các chương trong tập trước.');
      else toast.error(errorMessage(e));
      invalidateTree();
    },
  });

  const removeChapter = useMutation({
    mutationFn: (c: ChapterListItem) => deleteChapter(c.chapterId),
    onSuccess: (_d, c) => {
      setDeletingChapter(null);
      toast.success(`Đã xoá chương ${c.chapterNo}.`);
      invalidateTree();
      if (s) void queryClient.invalidateQueries({ queryKey: queryKeys.stories.detail(s.slug) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function saveVolume(title: string) {
    try {
      if (volumeForm?.volume) await renameVolume(volumeForm.volume.volumeId, title);
      else await createVolume(storyId!, title);
      toast.success(volumeForm?.volume ? 'Đã đổi tên tập.' : `Đã tạo tập “${title.trim()}”.`);
      invalidateTree();
    } catch (e) {
      if (hasCode(e, 'VOLUME_NOT_FOUND')) {
        toast.error('Tập này không còn nữa.');
        invalidateTree();
      } else if (!hasCode(e, 'VALIDATION_FAILED')) toast.error(errorMessage(e));
      throw e;
    }
  }

  async function saveInfo(v: StoryValues) {
    if (!s) return;
    try {
      let latest = s;
      const patch = infoPatch(s, v);
      if (patch) latest = await updateStoryInfo(s.storyId, patch);
      const currentGenres = s.genres.map((g) => g.genreId);
      const currentPrimary = s.genres.find((g) => g.isPrimary)?.genreId;
      if (!sameIds(v.genreIds, currentGenres) || v.primaryGenreId !== currentPrimary) {
        latest = await replaceStoryGenres(s.storyId, v.genreIds, v.primaryGenreId);
      }
      if (v.tags.map(tagSlug).join('|') !== s.tags.map((t) => t.slug).join('|')) {
        latest = await replaceStoryTags(s.storyId, v.tags);
      }
      if (latest === s) {
        toast.info('Không có thay đổi nào để lưu.');
        return;
      }
      queryClient.setQueryData(queryKeys.studio.story(s.storyId), latest);
      void queryClient.invalidateQueries({ queryKey: ['studio', 'stories'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.detail(s.slug) });
      setConflict(false);
      toast.success('Đã lưu thông tin truyện.');
    } catch (e) {
      if (hasCode(e, 'STALE_DATA')) setConflict(true);
      else if (!hasCode(e, 'VALIDATION_FAILED')) toast.error(errorMessage(e));
      throw e;
    }
  }

  if (storyId === null || (story.isError && hasCode(story.error, 'STORY_NOT_FOUND', 'NOT_FOUND'))) {
    return (
      <ErrorResult
        variant="not-found"
        title="Không tìm thấy truyện này"
        description="Truyện có thể đã bị xoá hoặc không thuộc về bạn."
        action={
          <Button asChild>
            <Link to="/studio">Về Truyện của tôi</Link>
          </Button>
        }
      />
    );
  }
  if (story.isError) return <ErrorResult title="Chưa tải được truyện" onRetry={() => story.refetch()} />;
  if (!s) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Đang tải truyện">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-[420px] rounded-lg" />
      </div>
    );
  }

  const target = { storyId: s.storyId, slug: s.slug, title: s.title };
  const hidden = s.publishStatus === 'HIDDEN';
  const busy = actions.busyId === s.storyId;
  const draftCount = (chapters.data ?? []).filter((c) => c.status !== 'PUBLISHED').length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <nav aria-label="Đường dẫn" className="text-small text-muted-foreground">
          <Link to="/studio" className="hover:text-foreground hover:underline">
            Truyện của tôi
          </Link>{' '}
          › Quản lý truyện
        </nav>
        <div className="flex flex-wrap items-center gap-5">
          <StoryCover storyId={s.storyId} title={s.title} coverUrl={s.coverUrl} size="xs" className="w-14 flex-none" />
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-[26px] leading-[34px] font-semibold tracking-[-0.01em] sm:text-[28px] sm:leading-9">{s.title}</h1>
              <PublishBadge status={s.publishStatus} />
            </div>
            <p className="text-muted-foreground">
              {[...s.genres.map((g) => g.name), `${formatNumber(s.chapterCount)} chương đã đăng`, `${formatNumber(s.viewCount)} lượt xem`].join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.publishStatus === 'PUBLISHED' && (
              <Button variant="outline" asChild>
                <Link to={`/stories/${s.slug}`}>
                  <ExternalLink strokeWidth={1.75} /> Xem trang công khai
                </Link>
              </Button>
            )}
            {s.publishStatus === 'PUBLISHED' ? (
              <Button variant="outline" disabled={busy} onClick={() => actions.unpublish.mutate(target)}>
                <EyeOff strokeWidth={1.75} /> Gỡ đăng
              </Button>
            ) : (
              <Button disabled={busy || hidden} onClick={() => actions.publish.mutate(target)} className="font-semibold">
                <Send strokeWidth={1.75} /> Đăng truyện
              </Button>
            )}
          </div>
        </div>
      </header>

      {hidden && (
        <div role="alert" className="flex items-start gap-3 rounded-md bg-critical-soft px-4 py-3.5 text-label text-destructive">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 flex-none" strokeWidth={1.75} />
          <span>
            <b>Truyện đang bị quản trị viên ẩn</b>
            <br />
            <span className="text-foreground">
              {s.hiddenReason ? `Lý do: ${s.hiddenReason}` : 'Không có lý do kèm theo.'} Bạn vẫn sửa được nội dung, nhưng chưa đăng hay gỡ đăng được cho tới khi truyện được
              mở lại.
            </span>
          </span>
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(t) => {
          const p = new URLSearchParams(params);
          if (t === 'info') p.set('tab', 'info');
          else p.delete('tab');
          setParams(p, { replace: true });
        }}
      >
        <TabsList aria-label="Quản lý truyện">
          <TabsTrigger value="chapters">
            Chương &amp; tập
            {draftCount > 0 && <span className="num rounded-full bg-secondary px-1.5 text-caption text-muted-foreground">{draftCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
        </TabsList>

        <TabsContent value="chapters" className="pt-5">
          {volumes.isError || chapters.isError ? (
            <ErrorResult title="Chưa tải được chương và tập" onRetry={() => invalidateTree()} />
          ) : volumes.data && chapters.data ? (
            <ChapterList
              key={`${volumes.data.length}-${chapters.data.length}`}
              storyId={s.storyId}
              volumes={volumes.data}
              chapters={chapters.data}
              creating={newChapter.isPending}
              onCreateChapter={(v) => newChapter.mutate(v)}
              onCreateVolume={() => setVolumeForm({})}
              onRenameVolume={(v) => setVolumeForm({ volume: v })}
              onDeleteVolume={setDeletingVolume}
              onDeleteChapter={setDeletingChapter}
            />
          ) : (
            <Skeleton className="h-[360px] rounded-lg" />
          )}
        </TabsContent>

        <TabsContent value="info" className="flex flex-col gap-8 pt-5">
          {genres.data ? (
            <div className="max-w-[1000px]">
              <StoryForm
                mode="edit"
                storyId={s.storyId}
                genres={genres.data}
                penName={user?.author?.penName ?? ''}
                defaultValues={formValues}
                onSubmit={saveInfo}
                conflict={conflict}
                onReload={() => {
                  setConflict(false);
                  void story.refetch();
                }}
                cancelTo="/studio"
              />
            </div>
          ) : (
            <Skeleton className="h-[640px] max-w-[1000px] rounded-lg" />
          )}
          <section aria-labelledby="danger-h" className="flex max-w-[1000px] flex-wrap items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-card p-5">
            <div>
              <h2 id="danger-h" className="font-serif text-[18px] leading-6 font-semibold text-destructive">
                Xoá truyện
              </h2>
              <p className="text-label text-muted-foreground">Xoá vĩnh viễn truyện cùng toàn bộ tập và chương. Không hoàn tác được.</p>
            </div>
            <Button variant="destructive" onClick={() => setDeletingStory(true)}>
              <Trash2 strokeWidth={1.75} /> Xoá truyện
            </Button>
          </section>
        </TabsContent>
      </Tabs>

      <VolumeFormDialog
        open={volumeForm !== null}
        onOpenChange={(o) => !o && setVolumeForm(null)}
        volume={volumeForm?.volume}
        nextNo={(volumes.data?.length ?? 0) + 1}
        onSubmit={saveVolume}
      />
      <ConfirmDialog
        open={deletingVolume !== null}
        onOpenChange={(o) => !o && setDeletingVolume(null)}
        title={`Xoá tập ${deletingVolume?.volumeNo ?? ''}?`}
        description={`Tập “${deletingVolume?.title ?? ''}” sẽ bị xoá. Chỉ xoá được tập không còn chương.`}
        confirmLabel="Xoá tập"
        pendingLabel="Đang xoá…"
        destructive
        pending={removeVolume.isPending}
        onConfirm={() => deletingVolume && removeVolume.mutate(deletingVolume)}
      />
      <ConfirmDialog
        open={deletingChapter !== null}
        onOpenChange={(o) => !o && setDeletingChapter(null)}
        title={`Xoá chương ${deletingChapter?.chapterNo ?? ''}?`}
        description={
          deletingChapter?.status === 'PUBLISHED'
            ? 'Chương đã đăng sẽ biến khỏi trang truyện, lượt xem của chương không còn được tính. Không hoàn tác được.'
            : 'Chương và bản nháp của chương sẽ bị xoá. Không hoàn tác được.'
        }
        confirmLabel="Xoá chương"
        pendingLabel="Đang xoá…"
        destructive
        pending={removeChapter.isPending}
        onConfirm={() => deletingChapter && removeChapter.mutate(deletingChapter)}
      />
      <ConfirmDialog
        open={deletingStory}
        onOpenChange={setDeletingStory}
        title="Xoá truyện này?"
        description="Truyện, toàn bộ chương và tập sẽ bị xoá vĩnh viễn. Người đọc sẽ không còn thấy truyện. Không hoàn tác được."
        confirmLabel="Xoá truyện"
        pendingLabel="Đang xoá…"
        destructive
        pending={actions.remove.isPending}
        onConfirm={() => actions.remove.mutate(target)}
      />
    </div>
  );
}
