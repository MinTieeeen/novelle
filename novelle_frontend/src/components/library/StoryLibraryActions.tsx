import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { queryKeys } from '@/api/queryKeys';
import { addListItem, createList, getMyLists } from '@/api/readingLists';
import { useAuth } from '@/auth/AuthProvider';
import { AddToListPopover } from '@/components/library/AddToListPopover';
import { ReadingListFormDialog } from '@/components/library/ReadingListFormDialog';
import { FollowButton } from '@/components/story/FollowButton';
import { useRequireLogin, useStoryFollow } from '@/hooks/useFollow';
import { LIBRARY_MSG, type ReadingListSummary, type ReadingListValues } from '@/types/library';
import type { StoryDetail } from '@/types/story';
import { errorMessage, hasCode } from '@/utils/errors';

/**
 * StoryHero actions (FE4): "Theo dõi" and "Thêm vào tủ". Hidden for admins. A guest's click opens the
 * login popup, then the action continues. A list created from the popover gets the story right away.
 */
export function StoryLibraryActions({ story }: { story: StoryDetail }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const requireLogin = useRequireLogin();
  const follow = useStoryFollow(story);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [addedTo, setAddedTo] = useState<Set<number>>(new Set());
  const [addingTo, setAddingTo] = useState<number | null>(null);

  const lists = useQuery({
    queryKey: queryKeys.readingLists.mine,
    queryFn: getMyLists,
    enabled: open && !!user,
  });

  if (user?.role === 'ADMIN') return null;

  async function add(list: ReadingListSummary) {
    setAddingTo(list.listId);
    try {
      await addListItem(list.listId, story.storyId);
      setAddedTo((s) => new Set(s).add(list.listId));
      toast.success(`Đã thêm vào tủ “${list.name}”.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.readingLists.all });
    } catch (e) {
      if (hasCode(e, 'STORY_ALREADY_IN_LIST')) {
        setAddedTo((s) => new Set(s).add(list.listId));
        toast.info(`Truyện đã có trong tủ “${list.name}”.`);
      } else if (hasCode(e, 'READING_LIST_LIMIT')) toast.error(LIBRARY_MSG.itemLimit);
      else if (!hasCode(e, 'RATE_LIMITED')) toast.error(errorMessage(e));
    } finally {
      setAddingTo(null);
    }
  }

  async function createAndAdd(values: ReadingListValues) {
    try {
      const list = await createList({ name: values.name, description: values.description, isPublic: values.isPublic });
      await add(list);
    } catch (e) {
      if (hasCode(e, 'READING_LIST_LIMIT')) toast.error(LIBRARY_MSG.listLimit);
      else if (!hasCode(e, 'READING_LIST_NAME_TAKEN', 'VALIDATION_FAILED')) toast.error(errorMessage(e));
      throw e;
    }
  }

  return (
    <>
      <FollowButton following={follow.following} onToggle={follow.toggle} disabled={follow.pending || !follow.ready} target="truyện" />
      <AddToListPopover
        open={open}
        onOpenChange={setOpen}
        lists={lists.data}
        error={lists.isError}
        addedTo={addedTo}
        addingTo={addingTo}
        onAdd={(l) => void add(l)}
        onCreate={() => {
          setOpen(false);
          setCreating(true);
        }}
        onTriggerClick={() => {
          if (user) return false;
          requireLogin(() => setOpen(true));
          return true;
        }}
      />
      <ReadingListFormDialog open={creating} onOpenChange={setCreating} mode="create" onSubmit={createAndAdd} />
    </>
  );
}
