import { BookOpen, Eye, Star, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { adminGenres, adminStories, adminTags, adminUserDetail, adminUsers, genreStats, statsOverview, topAuthors, userGrowth } from '../../../e2e/fixtures/admin';
import { ratings } from '../../../e2e/fixtures/library';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { GenreBars, TopAuthorsTable, UserGrowthChart, type GenreMetric } from '@/components/admin/AdminCharts';
import { RoleBadge, UserStatusBadge } from '@/components/admin/AdminBadges';
import { GenreBlockedDialog, GenreFormDialog, GenreTable, TagRenameDialog, TagTable } from '@/components/admin/CatalogParts';
import { CreateAdminDialog } from '@/components/admin/CreateAdminDialog';
import { ReasonDialog } from '@/components/admin/ReasonDialog';
import { AuthorFilter, ModerationRow, StoryDetailSheet } from '@/components/admin/StoryParts';
import { UserDetailSheet, UserRow } from '@/components/admin/UserParts';
import { STORY_GRID, TABLE, TABLE_HEAD_XL, USER_GRID } from '@/components/admin/adminStyles';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/studio/DashboardParts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BAN_REASONS, HIDE_REASONS, type AdminGenre, type AdminStoryItem, type AdminTag, type AdminUserItem } from '@/types/admin';
import { ApiError } from '@/api/http';
import { formatCompact, formatNumber } from '@/utils/format';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 font-sans text-label font-semibold tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
const taken = (code: string) => new ApiError({ status: 409, code, message: code } as ConstructorParameters<typeof ApiError>[0]);

type UserTab = 'ALL' | 'READER' | 'AUTHOR' | 'ADMIN' | 'BANNED';

/** Dev-only preview of the FE7 Admin components with fixtures (/dev/admin). No API calls. */
export default function AdminPreviewPage() {
  const [tab, setTab] = useState<UserTab>('ALL');
  const [user, setUser] = useState<AdminUserItem | null>(null);
  const [banOpen, setBanOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [story, setStory] = useState<AdminStoryItem | null>(null);
  const [hideOpen, setHideOpen] = useState(false);
  const [author, setAuthor] = useState<{ authorId: number; penName: string } | null>(null);
  const [authorQ, setAuthorQ] = useState('');
  const [genre, setGenre] = useState<AdminGenre | undefined>();
  const [genreOpen, setGenreOpen] = useState(false);
  const [blocked, setBlocked] = useState<AdminGenre | null>(null);
  const [tag, setTag] = useState<AdminTag | null>(null);
  const [metric, setMetric] = useState<GenreMetric>('stories');
  const o = statsOverview;
  const authors = adminUsers.filter((u) => u.role === 'AUTHOR' && u.displayName.toLowerCase().includes(authorQ.toLowerCase()));

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 py-8 sm:px-8">
      <PageHeader title="FE7 · Admin" description="Bản xem trước component với dữ liệu mẫu" />

      <Block title="AdminFilterTabs · RoleBadge · UserStatusBadge">
        <AdminFilterTabs
          label="Lọc người dùng"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'ALL', label: 'Tất cả', count: o.users.total },
            { value: 'READER', label: 'Người đọc', count: o.users.byRole.READER },
            { value: 'AUTHOR', label: 'Tác giả', count: o.users.byRole.AUTHOR },
            { value: 'ADMIN', label: 'Admin', count: o.users.byRole.ADMIN },
            { value: 'BANNED', label: 'Bị khoá', count: o.users.banned },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <RoleBadge role="READER" />
          <RoleBadge role="AUTHOR" />
          <RoleBadge role="ADMIN" />
          <UserStatusBadge status="ACTIVE" />
          <UserStatusBadge status="BANNED" />
        </div>
      </Block>

      <Block title="UserRow · UserDetailSheet · ReasonDialog (khoá) · CreateAdminDialog">
        <div>
          <Button onClick={() => setCreateOpen(true)}>Tạo admin</Button>
        </div>
        <section className={TABLE} aria-label="Người dùng">
          <div className={cn(TABLE_HEAD_XL, USER_GRID)}>
            <span>Người dùng</span>
            <span>Vai trò</span>
            <span>Trạng thái</span>
            <span>Tham gia</span>
            <span />
          </div>
          <ul>
            {adminUsers.slice(0, 6).map((u, i) => (
              <UserRow key={u.userId} user={u} self={i === 0 && u.role === 'ADMIN'} onOpen={() => setUser(u)} onToggleLock={() => (setUser(null), setBanOpen(true))} />
            ))}
          </ul>
        </section>
        <UserDetailSheet
          open={user !== null}
          onOpenChange={(v) => !v && setUser(null)}
          user={user ? adminUserDetail(user) : undefined}
          self={false}
          onToggleLock={() => setBanOpen(true)}
          onVerify={(v) => toast.success(v ? 'Đã cấp tích xanh' : 'Đã gỡ tích xanh')}
        />
        <ReasonDialog
          open={banOpen}
          onOpenChange={setBanOpen}
          title="Khoá tài khoản"
          description="Người dùng sẽ bị đăng xuất và không đăng nhập được cho tới khi mở khoá."
          reasons={BAN_REASONS}
          notePlaceholder="Ghi chú thêm (không bắt buộc)"
          confirmLabel="Khoá tài khoản"
          pendingLabel="Đang khoá…"
          onConfirm={(r) => (toast.success(`Lý do: ${r}`), setBanOpen(false))}
        />
        <CreateAdminDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSubmit={async (v) => {
            await wait();
            if (v.username === 'taken') throw taken('USERNAME_TAKEN');
            toast.success(`Đã tạo admin ${v.displayName}`);
          }}
        />
      </Block>

      <Block title="AuthorFilter · ModerationRow · StoryDetailSheet · ReasonDialog (ẩn)">
        <AuthorFilter value={author ?? undefined} onChange={setAuthor} results={authors} query={authorQ} onQueryChange={setAuthorQ} />
        <section className={TABLE} aria-label="Truyện">
          <div className={cn(TABLE_HEAD_XL, STORY_GRID)}>
            <span>Truyện</span>
            <span>Tác giả</span>
            <span>Trạng thái</span>
            <span>Chương</span>
            <span>Lượt xem</span>
            <span>Đánh giá</span>
            <span />
          </div>
          <ul>
            {adminStories.map((s) => (
              <ModerationRow
                key={s.storyId}
                story={s}
                onOpen={() => setStory(s)}
                onToggleHide={() => (s.publishStatus === 'HIDDEN' ? toast.success(`Đã bỏ ẩn “${s.title}”`) : setHideOpen(true))}
                onAuthor={() => setAuthor({ authorId: s.author.authorId, penName: s.author.penName })}
              />
            ))}
          </ul>
        </section>
        <StoryDetailSheet
          open={story !== null}
          onOpenChange={(v) => !v && setStory(null)}
          story={story ?? undefined}
          onToggleHide={() => setHideOpen(true)}
          onDelete={() => toast.error('Xoá truyện (xem trước)')}
          reviews={ratings}
          reviewCount={ratings.length + 4}
          hasMoreReviews
          onMoreReviews={() => toast('Tải thêm đánh giá')}
          onDeleteReview={(r) => toast.success(`Đã xoá đánh giá của @${r.user.username}`)}
        />
        <ReasonDialog
          open={hideOpen}
          onOpenChange={setHideOpen}
          title="Ẩn truyện"
          description="Truyện sẽ không hiện với độc giả. Tác giả vẫn thấy lý do trong Studio."
          reasons={HIDE_REASONS}
          notePlaceholder="Ghi chú cho tác giả (không bắt buộc)"
          confirmLabel="Ẩn truyện"
          pendingLabel="Đang ẩn…"
          onConfirm={(r) => (toast.success(`Lý do: ${r}`), setHideOpen(false))}
        />
      </Block>

      <Block title="GenreTable · GenreFormDialog · GenreBlockedDialog">
        <div>
          <Button onClick={() => (setGenre(undefined), setGenreOpen(true))}>Thêm thể loại</Button>
        </div>
        <GenreTable
          genres={adminGenres}
          onEdit={(g) => (setGenre(g), setGenreOpen(true))}
          onDelete={(g) => (g.storyCount > 0 ? setBlocked(g) : toast.success(`Đã xoá “${g.name}”`))}
        />
        <GenreFormDialog
          open={genreOpen}
          onOpenChange={setGenreOpen}
          genre={genre}
          nextOrder={adminGenres.length + 1}
          onSubmit={async (v) => {
            await wait();
            if (v.name.trim().toLowerCase() === 'kiếm hiệp') throw taken('GENRE_NAME_TAKEN');
            toast.success(`Đã lưu “${v.name}”`);
          }}
        />
        <GenreBlockedDialog genre={blocked} onClose={() => setBlocked(null)} />
      </Block>

      <Block title="TagTable · TagRenameDialog">
        <TagTable tags={adminTags} onRename={setTag} onDelete={(t) => toast.success(`Đã xoá #${t.name}`)} />
        <TagRenameDialog
          tag={tag}
          onClose={() => setTag(null)}
          onSubmit={async (name) => {
            await wait();
            if (adminTags.some((t) => t.name === name && t.tagId !== tag?.tagId)) throw taken('TAG_NAME_TAKEN');
            toast.success(`Đã đổi thành #${name}`);
          }}
        />
      </Block>

      <Block title="StatCard · GenreBars · UserGrowthChart · TopAuthorsTable">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Người dùng" value={formatNumber(o.users.total)} note={`${formatNumber(o.users.banned)} bị khoá`} icon={<Users strokeWidth={1.75} />} />
          <StatCard label="Truyện" value={formatNumber(o.stories.total)} note={`${formatNumber(o.stories.byStatus.PUBLISHED ?? 0)} đã xuất bản`} icon={<BookOpen strokeWidth={1.75} />} />
          <StatCard label="Lượt xem" value={formatCompact(o.totalViews)} note={`${formatCompact(o.totalWords)} chữ`} icon={<Eye strokeWidth={1.75} />} />
          <StatCard label="Đánh giá" value={formatNumber(o.totalRatings)} icon={<Star strokeWidth={1.75} />} />
        </div>
        <div className="flex flex-wrap gap-4">
          <UserGrowthChart growth={userGrowth} />
          <GenreBars genres={genreStats} metric={metric} onMetric={setMetric} />
        </div>
        <div className="flex">
          <TopAuthorsTable top={topAuthors} />
        </div>
      </Block>
    </div>
  );
}
