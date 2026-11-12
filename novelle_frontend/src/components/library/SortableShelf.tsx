import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { StoryCover } from '@/components/story/StoryCover';
import { cn } from '@/lib/utils';
import { moveItem, type ReadingListItem } from '@/types/library';
import { STATUS_LABEL } from '@/types/story';
import { formatNumber } from '@/utils/format';

interface ShelfItemRowProps {
  item: ReadingListItem;
  /** 1-based position shown on the left */
  position: number;
  editing?: boolean;
  onRemove?: () => void;
  removing?: boolean;
  /** drag handle attributes from useSortable (edit mode) */
  handleProps?: HTMLAttributes<HTMLButtonElement>;
  dragging?: boolean;
}

/**
 * One story of a list (board Shelf): position, cover, title, "author · genre · N chương", the owner's
 * note (nghe left border, italic). Edit mode adds the drag handle and "Bỏ khỏi tủ".
 */
export function ShelfItemRow({ item, position, editing, onRemove, removing, handleProps, dragging }: ShelfItemRowProps) {
  const s = item.story;
  const meta = [
    s.author.penName,
    s.primaryGenre?.name,
    s.completionStatus === 'COMPLETED' ? STATUS_LABEL.COMPLETED : `${formatNumber(s.chapterCount)} chương`,
  ].filter(Boolean);
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-border bg-card px-4 py-4 first:border-t-0 sm:gap-4 sm:px-5',
        dragging && 'relative z-10 shadow-overlay',
      )}
    >
      {editing && (
        <button
          type="button"
          aria-label={`Kéo để đổi vị trí “${s.title}”`}
          className="flex-none cursor-grab touch-none rounded-sm px-0.5 py-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid active:cursor-grabbing"
          {...handleProps}
        >
          <GripVertical aria-hidden className="size-5" strokeWidth={1.75} />
        </button>
      )}
      <span className="num w-5 flex-none text-center font-serif text-body font-semibold text-muted-foreground sm:w-6">{position}</span>
      <StoryCover storyId={s.storyId} title={s.title} coverUrl={s.coverUrl} size="xs" className="w-12 flex-none sm:w-14" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link to={`/stories/${s.slug}`} className="font-serif text-[17px] leading-6 font-semibold hover:text-primary sm:text-[18px]">
          {s.title}
        </Link>
        <span className="text-label text-muted-foreground">{meta.join(' · ')}</span>
        {editing && onRemove && <RemoveButton title={s.title} onRemove={onRemove} removing={removing} className="self-start sm:hidden" />}
        {item.note && (
          <span className="mt-1 rounded-r-md border-l-[3px] border-nghe bg-secondary px-3 py-2 font-serif text-label italic">
            {item.note}
          </span>
        )}
      </div>
      {editing && onRemove && <RemoveButton title={s.title} onRemove={onRemove} removing={removing} className="max-sm:hidden" />}
    </div>
  );
}

function RemoveButton({ title, onRemove, removing, className }: { title: string; onRemove: () => void; removing?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      disabled={removing}
      aria-label={`Bỏ “${title}” khỏi tủ`}
      className={cn(
        'flex-none rounded-sm text-label font-medium text-destructive underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:opacity-50',
        className,
      )}
    >
      Bỏ khỏi tủ
    </button>
  );
}

function SortableRow(props: Omit<ShelfItemRowProps, 'handleProps' | 'dragging'>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.story.storyId,
  });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <ShelfItemRow
        {...props}
        dragging={isDragging}
        handleProps={{ ...attributes, ...listeners, ref: setActivatorNodeRef } as HTMLAttributes<HTMLButtonElement>}
      />
    </div>
  );
}

interface SortableShelfProps {
  items: ReadingListItem[];
  onChange: (items: ReadingListItem[]) => void;
  onRemove: (item: ReadingListItem) => void;
  removingId?: number | null;
}

/** Vietnamese texts for screen readers while dragging with the keyboard (Space, arrows, Space / Esc). */
const instructions: ScreenReaderInstructions = {
  draggable:
    'Nhấn Space để nhấc truyện lên, dùng phím mũi tên lên xuống để đổi vị trí, nhấn Space lần nữa để đặt xuống hoặc Esc để huỷ.',
};

/**
 * Edit mode of a list: rows reorderable with @dnd-kit by mouse, touch (press and hold) or keyboard on the
 * handle. Changes stay local until the page saves them with one PUT …/items/order.
 */
export function SortableShelf({ items, onChange, onRemove, removingId }: SortableShelfProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const title = (id: unknown) => items.find((i) => i.story.storyId === id)?.story.title ?? 'truyện';
  const pos = (id: unknown) => items.findIndex((i) => i.story.storyId === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Đã nhấc “${title(active.id)}”, đang ở vị trí ${pos(active.id)} trên ${items.length}.`,
    onDragOver: ({ active, over }) => (over ? `“${title(active.id)}” sang vị trí ${pos(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Đã đặt “${title(active.id)}” ở vị trí ${pos(over.id)}.` : `Đã đặt “${title(active.id)}”.`),
    onDragCancel: ({ active }) => `Huỷ di chuyển “${title(active.id)}”.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.story.storyId === active.id);
    const to = items.findIndex((i) => i.story.storyId === over.id);
    onChange(moveItem(items, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      accessibility={{ announcements, screenReaderInstructions: instructions }}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map((i) => i.story.storyId)} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => (
          <SortableRow
            key={item.story.storyId}
            item={item}
            position={i + 1}
            editing
            onRemove={() => onRemove(item)}
            removing={removingId === item.story.storyId}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
