import { LayoutGrid, List } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SORT_LABEL, type StorySort } from '@/types/story';
import type { SearchView } from '@/types/storySearch';

interface SortSelectProps {
  value: StorySort;
  onChange: (sort: StorySort) => void;
  /** "Liên quan nhất" only makes sense with a search text */
  allowRelevance?: boolean;
  id?: string;
}

/** "Sắp xếp" select of the Search and AuthorPage boards (options in board order). */
export function SortSelect({ value, onChange, allowRelevance = false, id = 'sort' }: SortSelectProps) {
  const options = (Object.keys(SORT_LABEL) as StorySort[]).filter((s) => allowRelevance || s !== 'relevance');
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="font-normal text-muted-foreground">
        Sắp xếp
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as StorySort)}>
        <SelectTrigger id={id} className="h-10 min-w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((s) => (
            <SelectItem key={s} value={s}>
              {SORT_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Grid / list toggle of the Search board (segmented, aria-pressed). */
export function ViewToggle({ value, onChange }: { value: SearchView; onChange: (view: SearchView) => void }) {
  const item = (view: SearchView, label: string, Icon: typeof List) => (
    <button
      type="button"
      aria-pressed={value === view}
      aria-label={label}
      title={label}
      onClick={() => onChange(view)}
      className={cn(
        'grid size-[34px] place-items-center rounded-[6px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
        value === view ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
    </button>
  );
  return (
    <div role="group" aria-label="Cách hiển thị" className="inline-flex rounded-md bg-secondary p-[3px]">
      {item('grid', 'Dạng lưới', LayoutGrid)}
      {item('list', 'Dạng danh sách', List)}
    </div>
  );
}
