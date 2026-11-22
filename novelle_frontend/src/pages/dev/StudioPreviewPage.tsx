import { History, Star } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  chapterWithDraft,
  followers,
  overview,
  revisions,
  storyStats,
  studioCards,
  studioChapters,
  studioProfile,
  studioStory,
  viewSeries,
  volumes,
} from '../../../e2e/fixtures/studio';
import { genres } from '../../../e2e/fixtures/story';
import { PageHeader } from '@/components/common/PageHeader';
import { AuthorProfileForm } from '@/components/studio/AuthorProfileForm';
import { ChapterList, VolumeFormDialog } from '@/components/studio/ChapterList';
import { RecentFollowers, StatCard, StoryStatsTable, ViewsChart } from '@/components/studio/DashboardParts';
import { ConflictDialog, DraftBanner, SaveStatus } from '@/components/studio/EditorParts';
import { PublishPopover } from '@/components/studio/PublishPopover';
import { RevisionPanel, RevisionPreviewDialog } from '@/components/studio/RevisionPanel';
import { RichTextEditor } from '@/components/studio/RichTextEditor';
import { StoryForm } from '@/components/studio/StoryForm';
import { StudioStoryRow } from '@/components/studio/StudioStoryRow';
import { STUDIO_ROW_GRID } from '@/components/studio/studioStyles';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { rangeQueries, storyToValues, type ChapterStatus, type Revision } from '@/types/studio';
import { formatNumber, formatRating } from '@/utils/format';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 font-sans text-label font-semibold tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
const q30 = rangeQueries('30d');

/** Dev-only preview of the FE6 Studio components with fixtures (/dev/studio). No API calls. */
export default function StudioPreviewPage() {
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [status, setStatus] = useState<ChapterStatus>('DRAFT');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [preview, setPreview] = useState<Revision | null>(null);
  const [dirty, setDirty] = useState(false);
  const [banner, setBanner] = useState(true);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 py-8 sm:px-8">
      <PageHeader title="FE6 · Studio" description="Bản xem trước component với dữ liệu mẫu" />

      <Block title="S1 · StudioStoryRow">
        <section className="overflow-visible rounded-lg border border-border bg-card">
          <div className={cn('rounded-t-lg bg-secondary px-5 py-3 text-small font-semibold text-muted-foreground max-lg:hidden', STUDIO_ROW_GRID)}>
            <span>Truyện</span>
            <span>Trạng thái</span>
            <span>Chương</span>
            <span>Lượt xem</span>
            <span>Cập nhật</span>
            <span />
          </div>
          <ul>
            {studioCards.map((s) => (
              <StudioStoryRow key={s.storyId} story={s} onPublish={() => toast('Đăng truyện')} onUnpublish={() => toast('Gỡ đăng')} onDelete={() => toast('Xoá truyện?')} />
            ))}
          </ul>
        </section>
      </Block>

      <Block title="S2 · StoryForm (tạo mới)">
        <StoryForm
          mode="create"
          genres={genres}
          penName="Mộc Lan"
          cancelTo="/dev/studio"
          onSubmit={async (v) => {
            await wait();
            toast.success(`Tạo “${v.title}”`);
          }}
        />
      </Block>

      <Block title="S3 · StoryForm (chỉnh sửa, xung đột)">
        <StoryForm
          mode="edit"
          genres={genres}
          penName="Mộc Lan"
          storyId={studioStory.storyId}
          defaultValues={storyToValues(studioStory)}
          conflict
          onReload={() => toast('Tải lại')}
          cancelTo="/dev/studio"
          onSubmit={async () => {
            await wait();
          }}
        />
      </Block>

      <Block title="S3 · ChapterList + VolumeFormDialog">
        <ChapterList
          storyId={studioStory.storyId}
          volumes={volumes}
          chapters={studioChapters}
          onCreateChapter={(v) => toast(`Tạo chương trong tập ${v ?? 'lẻ'}`)}
          onCreateVolume={() => setVolumeOpen(true)}
          onRenameVolume={() => setVolumeOpen(true)}
          onDeleteVolume={(v) => toast(`Xoá tập ${v.volumeNo}`)}
          onDeleteChapter={(c) => toast(`Xoá chương ${c.chapterNo}`)}
        />
        <VolumeFormDialog
          open={volumeOpen}
          onOpenChange={setVolumeOpen}
          nextNo={volumes.length + 1}
          onSubmit={async (t) => {
            await wait();
            toast.success(`Tập “${t}”`);
          }}
        />
      </Block>

      <Block title="S4 · Trình soạn chương">
        <div className="overflow-hidden rounded-lg border border-border">
          <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-small text-muted-foreground">{studioStory.title}</span>
              <span className="truncate text-label font-semibold">{chapterWithDraft.title}</span>
            </div>
            <SaveStatus dirty={dirty} saving={false} autosave={dirty ? 'saved' : 'idle'} draftSavedAt="2026-11-12T07:32:00Z" savedAt="2026-11-12T07:20:00Z" />
            <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
              <History strokeWidth={1.75} /> Lịch sử
            </Button>
            <Button variant="outline" onClick={() => setConflict(true)}>
              Lưu (giả lập 409)
            </Button>
            <PublishPopover
              status={status}
              scheduledAt={status === 'SCHEDULED' ? '2026-11-14T13:00:00Z' : null}
              open={publishOpen}
              onOpenChange={setPublishOpen}
              onPublishNow={() => {
                setStatus('PUBLISHED');
                setPublishOpen(false);
              }}
              onSchedule={() => {
                setStatus('SCHEDULED');
                setPublishOpen(false);
              }}
              onUnschedule={() => {
                setStatus('DRAFT');
                setPublishOpen(false);
              }}
            />
          </header>
          {banner && <DraftBanner savedAt={chapterWithDraft.draft!.savedAt} diff={66} onRestore={() => setBanner(false)} onDiscard={() => setBanner(false)} />}
          <RichTextEditor initialContent={chapterWithDraft.content} onChange={() => setDirty(true)} onSave={() => toast('Ctrl+S')} />
        </div>
        <ConflictDialog open={conflict} onLoadLatest={() => setConflict(false)} onOverwrite={() => setConflict(false)} />
        <RevisionPanel
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          revisions={revisions}
          onView={(r) => setPreview({ ...r, content: chapterWithDraft.content })}
          onRestore={(r) => toast(`Khôi phục bản ${r.revisionNo}`)}
        />
        <RevisionPreviewDialog revision={preview} onClose={() => setPreview(null)} onRestore={() => setPreview(null)} />
      </Block>

      <Block title="S5 · Dashboard">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          <StatCard label="Lượt xem" value={formatNumber(142_380)} note="+8,1% so với kỳ trước" trend="up" />
          <StatCard label="Người theo dõi" value={formatNumber(overview.followerCount)} note={`+${followers.newFollowers30d} trong 30 ngày`} trend="up" />
          <StatCard
            label="Điểm trung bình"
            value={formatRating(overview.ratingAvg)}
            icon={<Star aria-hidden className="size-6 fill-nghe text-nghe" strokeWidth={1.75} />}
            note={`trên ${formatNumber(overview.ratingCount)} đánh giá`}
          />
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <ViewsChart series={viewSeries(q30.current.from, q30.current.to, 'day')} />
          <RecentFollowers followers={followers} />
        </div>
        <StoryStatsTable stories={storyStats} />
      </Block>

      <Block title="S6 · AuthorProfileForm">
        <AuthorProfileForm
          profile={studioProfile}
          stats={{ storyCount: overview.storyCount, chapterCount: overview.chapterCount }}
          onSubmit={async () => {
            await wait();
            toast.success('Đã lưu hồ sơ');
          }}
        />
      </Block>
    </div>
  );
}
