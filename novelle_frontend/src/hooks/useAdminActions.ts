import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { banUser, createAdmin, deleteAdminStory, deleteUserRating, hideStory, setAuthorVerified, unbanUser, unhideStory } from '@/api/admin';
import { queryKeys } from '@/api/queryKeys';
import { isApiError } from '@/api/http';
import { ADMIN_ERROR, type AdminStoryItem, type AdminUserDetail, type AdminUserItem, type CreateAdminValues } from '@/types/admin';
import type { PageResponse } from '@/types/api';
import { errorMessage, handledGlobally, hasCode } from '@/utils/errors';

/** Toast an admin action error unless http.ts already did. */
export function toastAdminError(e: unknown) {
  if (handledGlobally(e)) return;
  toast.error(isApiError(e) && ADMIN_ERROR[e.code] ? ADMIN_ERROR[e.code] : errorMessage(e));
}

/** Replace one row in every cached page of a list (instant feedback before the refetch). */
function patchRows<T>(qc: QueryClient, key: readonly unknown[], match: (row: T) => boolean, patch: (row: T) => T) {
  qc.setQueriesData<PageResponse<T>>({ queryKey: key }, (page) => (page ? { ...page, items: page.items.map((r) => (match(r) ? patch(r) : r)) } : page));
}

const STALE = ['ALREADY_PROCESSED', 'USER_NOT_FOUND', 'STORY_NOT_FOUND', 'NOT_FOUND'];

/** AD2: ban (U3), unban (U4), verify author (U6, optimistic), create admin (U5). */
export function useAdminUserActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.admin.users.lists });
    void qc.invalidateQueries({ queryKey: queryKeys.admin.stats.overview });
  };
  const applied = (d: AdminUserDetail) => {
    qc.setQueryData(queryKeys.admin.users.detail(d.userId), d);
    patchRows<AdminUserItem>(qc, queryKeys.admin.users.lists, (r) => r.userId === d.userId, (r) => ({ ...r, status: d.status, bannedAt: d.ban?.bannedAt ?? null }));
    refresh();
  };
  const failed = (userId: number) => (e: unknown) => {
    toastAdminError(e);
    if (hasCode(e, ...STALE)) {
      refresh();
      void qc.invalidateQueries({ queryKey: queryKeys.admin.users.detail(userId) });
    }
  };

  const ban = useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason: string }) => banUser(userId, reason),
    onSuccess: (d) => {
      applied(d);
      toast.success(`Đã khoá tài khoản @${d.username}`, { description: 'Người dùng đã bị đăng xuất khỏi mọi thiết bị.' });
    },
    onError: (e, v) => failed(v.userId)(e),
  });

  const unban = useMutation({
    mutationFn: (userId: number) => unbanUser(userId),
    onSuccess: (d) => {
      applied(d);
      toast.success(`Đã mở khoá tài khoản @${d.username}`);
    },
    onError: (e, userId) => failed(userId)(e),
  });

  const verify = useMutation({
    mutationFn: ({ userId, isVerified }: { userId: number; isVerified: boolean }) => setAuthorVerified(userId, isVerified),
    onMutate: async ({ userId, isVerified }) => {
      const key = queryKeys.admin.users.detail(userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AdminUserDetail>(key);
      if (prev?.author) qc.setQueryData<AdminUserDetail>(key, { ...prev, author: { ...prev.author, isVerified } });
      return { prev };
    },
    onError: (e, { userId }, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.admin.users.detail(userId), ctx.prev);
      failed(userId)(e);
    },
    onSuccess: (d, { userId }) => {
      const pen = qc.getQueryData<AdminUserDetail>(queryKeys.admin.users.detail(userId))?.author?.penName ?? '';
      toast.success(d.isVerified ? `Đã cấp tích xanh cho “${pen}”` : `Đã gỡ tích xanh của “${pen}”`);
      void qc.invalidateQueries({ queryKey: queryKeys.authors.detail(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.stats.topAuthors });
    },
  });

  /** Rejections go back to CreateAdminDialog (USERNAME_TAKEN / EMAIL_TAKEN under the field). */
  const create = useMutation({
    mutationFn: (v: CreateAdminValues) => createAdmin({ ...v, username: v.username.trim(), email: v.email.trim(), displayName: v.displayName.trim() }),
    onSuccess: (d) => {
      refresh();
      toast.success(`Đã tạo tài khoản admin @${d.username}`);
    },
  });

  return { ban, unban, verify, create };
}

/** AD5: hide (C2), unhide (C3), delete story (C4), delete a rating (C5). */
export function useAdminStoryActions(handlers: { onStory?: (s: AdminStoryItem) => void; onDeleted?: (storyId: number) => void } = {}) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.admin.stories.lists });
    void qc.invalidateQueries({ queryKey: queryKeys.admin.stats.overview });
  };
  const publicChanged = (slug?: string) => {
    if (slug) void qc.invalidateQueries({ queryKey: queryKeys.stories.detail(slug) });
    void qc.invalidateQueries({ queryKey: queryKeys.home });
    void qc.invalidateQueries({ queryKey: queryKeys.stories.all });
  };
  const applied = (d: AdminStoryItem) => {
    patchRows<AdminStoryItem>(qc, queryKeys.admin.stories.lists, (r) => r.storyId === d.storyId, () => d);
    handlers.onStory?.(d);
    refresh();
    publicChanged(d.slug);
  };
  const failed = (e: unknown) => {
    toastAdminError(e);
    if (hasCode(e, ...STALE, 'CONFLICT')) refresh();
  };

  const hide = useMutation({
    mutationFn: ({ storyId, reason }: { storyId: number; reason: string }) => hideStory(storyId, reason),
    onSuccess: (d) => {
      applied(d);
      toast.success(`Đã ẩn “${d.title}”`, { description: 'Tác giả thấy lý do trong Studio.' });
    },
    onError: failed,
  });

  const unhide = useMutation({
    mutationFn: (storyId: number) => unhideStory(storyId),
    onSuccess: (d) => {
      applied(d);
      toast.success(`Đã bỏ ẩn “${d.title}”`);
    },
    onError: failed,
  });

  const remove = useMutation({
    mutationFn: (s: Pick<AdminStoryItem, 'storyId' | 'slug' | 'title'>) => deleteAdminStory(s.storyId),
    onSuccess: (_, s) => {
      handlers.onDeleted?.(s.storyId);
      refresh();
      void qc.invalidateQueries({ queryKey: queryKeys.admin.stats.all });
      publicChanged(s.slug);
      toast.success(`Đã xoá “${s.title}”`);
    },
    onError: failed,
  });

  const removeRating = useMutation({
    mutationFn: ({ storyId, userId }: { storyId: number; userId: number; username: string }) => deleteUserRating(storyId, userId),
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: queryKeys.ratings.list(v.storyId), exact: true });
      refresh();
      toast.success(`Đã xoá đánh giá của @${v.username}`, { description: 'Điểm trung bình của truyện đã được tính lại.' });
    },
    onError: (e, v) => {
      toastAdminError(e);
      if (hasCode(e, 'NOT_FOUND')) void qc.invalidateQueries({ queryKey: queryKeys.ratings.list(v.storyId), exact: true });
    },
  });

  return { hide, unhide, remove, removeRating };
}
