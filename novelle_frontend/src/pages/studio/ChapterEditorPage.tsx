import { ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * S4 · Chapter editor (/studio/stories/:storyId/chapters/:chapterId). Full-screen with its own top bar
 * (back, story › chapter, volume select, autosave indicator, publish actions). Built with the studio module.
 */
export default function ChapterEditorPage() {
  const { storyId } = useParams();
  return (
    <div className="flex min-h-dvh flex-col bg-card">
      <header className="flex min-h-[60px] items-center gap-3 border-b border-border px-5 py-2">
        <Button variant="ghost" size="icon" asChild aria-label="Quay lại quản lý truyện">
          <Link to={`/studio/stories/${storyId}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <span className="font-semibold">Soạn chương · đang xây dựng</span>
      </header>
    </div>
  );
}
