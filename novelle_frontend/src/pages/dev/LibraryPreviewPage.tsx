import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  followedAuthors,
  history,
  listDetail,
  listItems,
  myLists,
  myRating,
  storyRatings,
} from '../../../e2e/fixtures/library';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { AddToListPopover } from '@/components/library/AddToListPopover';
import { ContinueCard } from '@/components/library/ContinueCard';
import { FollowedAuthorRow, HistoryCard, ShelfCard } from '@/components/library/LibraryItems';
import { ReadingListFormDialog } from '@/components/library/ReadingListFormDialog';
import { ShelfHeader } from '@/components/library/ShelfHeader';
import { ShelfItemRow, SortableShelf } from '@/components/library/SortableShelf';
import { FollowButton } from '@/components/story/FollowButton';
import { RatingSection, type RatingMode } from '@/components/story/RatingSection';
import { Button } from '@/components/ui/button';
import type { ReadingListValues } from '@/types/library';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 font-sans text-label font-semibold tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));

/** Dev-only preview of the FE4 components with fixtures (/dev/library). No API calls. */
export default function LibraryPreviewPage() {
  const [following, setFollowing] = useState(false);
  const [authorsOn, setAuthorsOn] = useState<Record<number, boolean>>({});
  const [formOpen, setFormOpen] = useState<'create' | 'edit' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addedTo, setAddedTo] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState(false);
  const detail = listDetail();
  const [draft, setDraft] = useState<ReadingListValues>({ name: detail.name, description: detail.description ?? '', isPublic: detail.isPublic });
  const [order, setOrder] = useState(listItems);
  const [mode, setMode] = useState<RatingMode>('form');

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="FE4 · Thư viện, tủ truyện, đánh giá" description="Bản xem trước component với dữ liệu mẫu" />

      <Block title="ContinueCard (trang chủ)">
        <div className="grid gap-4 md:grid-cols-3">
          {history.slice(0, 3).map((h) => (
            <ContinueCard key={h.story.storyId} item={h} />
          ))}
        </div>
      </Block>

      <Block title="HistoryCard (Đang đọc)">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-x-6 gap-y-8">
          {history.map((h) => (
            <HistoryCard key={h.story.storyId} item={h} onRemove={() => toast('Đã xoá khỏi lịch sử')} />
          ))}
        </div>
      </Block>

      <Block title="FollowedAuthorRow">
        <ul className="flex flex-col">
          {followedAuthors.map((a) => (
            <FollowedAuthorRow
              key={a.authorId}
              author={a}
              following={authorsOn[a.authorId] ?? true}
              onToggle={() => setAuthorsOn((s) => ({ ...s, [a.authorId]: !(s[a.authorId] ?? true) }))}
            />
          ))}
        </ul>
      </Block>

      <Block title="ShelfCard + ReadingListFormDialog + ConfirmDialog">
        <div className="flex justify-end">
          <Button onClick={() => setFormOpen('create')}>Tạo tủ mới</Button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {myLists.map((l) => (
            <ShelfCard key={l.listId} list={l} onRename={() => setFormOpen('edit')} onDelete={() => setConfirm(true)} />
          ))}
        </div>
        <ReadingListFormDialog
          open={formOpen !== null}
          onOpenChange={(o) => !o && setFormOpen(null)}
          mode={formOpen ?? 'create'}
          defaultValues={formOpen === 'edit' ? { name: myLists[0].name, description: myLists[0].description ?? '', isPublic: true } : undefined}
          onSubmit={async (v) => {
            await wait();
            toast.success(`Đã lưu tủ “${v.name}”`);
          }}
        />
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Xoá tủ “${myLists[0].name}”?`}
          description="Tủ bị xoá, các truyện bên trong vẫn nằm trong danh sách theo dõi của bạn. Không hoàn tác được."
          confirmLabel="Xoá tủ"
          destructive
          onConfirm={() => setConfirm(false)}
        />
      </Block>

      <Block title="FollowButton + AddToListPopover">
        <div className="flex flex-wrap gap-3">
          <FollowButton following={following} onToggle={() => setFollowing((f) => !f)} target="truyện" />
          <AddToListPopover
            open={addOpen}
            onOpenChange={setAddOpen}
            lists={myLists}
            addedTo={addedTo}
            onAdd={(l) => setAddedTo((s) => new Set(s).add(l.listId))}
            onCreate={() => setFormOpen('create')}
          />
          <FollowButton following={!following} onToggle={() => setFollowing((f) => !f)} target="tác giả" size="default" />
        </div>
      </Block>

      <Block title="R8 · ShelfHeader + hàng truyện / kéo thả">
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-7">
          <ShelfHeader
            list={detail}
            editing={editing}
            draft={draft}
            onDraftChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            onEdit={() => setEditing(true)}
            onCancel={() => setEditing(false)}
            onSave={() => setEditing(false)}
          />
          {editing && <p className="text-small text-muted-foreground">Nhấn giữ tay cầm bên trái rồi kéo lên hoặc xuống để đổi vị trí truyện.</p>}
          <section aria-label="Truyện trong tủ" className="overflow-hidden rounded-lg border border-border bg-card">
            {editing ? (
              <SortableShelf items={order} onChange={setOrder} onRemove={(i) => setOrder((o) => o.filter((x) => x !== i))} />
            ) : (
              order.map((item, i) => <ShelfItemRow key={item.story.storyId} item={item} position={i + 1} />)
            )}
          </section>
        </div>
      </Block>

      <Block title="RatingSection">
        <div className="flex gap-2">
          {(['form', 'guest', 'own-story', 'admin'] as const).map((m) => (
            <Button key={m} size="sm" variant={mode === m ? 'default' : 'outline'} onClick={() => setMode(m)}>
              {m}
            </Button>
          ))}
        </div>
        <div className="max-w-[760px]">
          <RatingSection
            ratings={storyRatings}
            hasMore
            mode={mode}
            mine={myRating}
            onSave={async () => {
              await wait();
              toast.success('Đã lưu đánh giá');
            }}
            onDelete={() => toast('Xoá đánh giá?')}
            onLogin={() => toast('Mở popup đăng nhập')}
          />
        </div>
        <div className="max-w-[760px]">
          <RatingSection mode="form" mine={null} />
        </div>
      </Block>
    </div>
  );
}
