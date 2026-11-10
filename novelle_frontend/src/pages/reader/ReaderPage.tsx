import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useReaderSettings } from '@/hooks/useReaderSettings';
import '@/styles/reader.css';

/**
 * R6 · Chapter reader (/chapters/:chapterId). Full-screen: no site header, its own toolbar with a 3px
 * nghe progress bar. Content, TOC sheet, settings and progress saving come with the reading module.
 */
export default function ReaderPage() {
  const { readerProps } = useReaderSettings();
  return (
    <div className="reader min-h-dvh" {...readerProps}>
      <div className="flex h-[60px] items-center gap-3 border-b border-current/10 px-4">
        <Button variant="ghost" size="icon" asChild aria-label="Quay lại" className="text-inherit hover:bg-current/10">
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="font-sans text-small opacity-75">Đọc chương · đang xây dựng</span>
      </div>
      <article className="reader-column px-6 pt-14 pb-16">
        <h1 className="mb-10 text-chapter-title font-[560] italic">Chương mẫu</h1>
        <p>Gió từ sông thổi vào, mang theo mùi bùn non và tiếng mái chèo khua nước.</p>
      </article>
    </div>
  );
}
