import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useSearchBox } from '@/hooks/useSearchBox';
import { cn } from '@/lib/utils';

interface AdminSearchProps {
  /** the value on the URL */
  value: string;
  onSearch: (q: string) => void;
  label: string;
  placeholder: string;
  className?: string;
}

/** Search box of the admin lists: debounced 300 ms, Enter searches at once, ≤ 100 characters. */
export function AdminSearch({ value, onSearch, label, placeholder, className }: AdminSearchProps) {
  const box = useSearchBox(value, onSearch);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        box.flush();
      }}
      className={cn('relative block w-[300px] max-w-full', className)}
    >
      <Search aria-hidden className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" strokeWidth={1.75} />
      <Input type="search" value={box.text} onChange={(e) => box.setText(e.target.value)} maxLength={100} placeholder={placeholder} aria-label={label} className="pl-10" />
    </form>
  );
}
