import { PageHeader } from '@/components/common/PageHeader';

interface PlaceholderPageProps {
  title: string;
  /** Design board id, e.g. "R2", so the page can be matched to the screen design. */
  screen?: string;
}

/**
 * Temporary body for routes whose module is not built yet. Each module replaces its placeholders.
 */
export function PlaceholderPage({ title, screen }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={screen ? `Màn hình ${screen} · đang xây dựng` : 'Đang xây dựng'} />
    </div>
  );
}
