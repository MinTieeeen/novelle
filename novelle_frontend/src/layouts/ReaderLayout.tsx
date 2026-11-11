import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Container } from '@/components/layout/Container';
import { GenreBar } from '@/components/layout/GenreBar';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { useGenres } from '@/hooks/useCatalog';
import { parseSearchParams } from '@/types/storySearch';

/**
 * Reader site frame: header + genre bar (one sticky block), a 1200px content column (mobile-first),
 * footer. The bar highlights the genre being filtered on /search (when exactly one is selected).
 */
export default function ReaderLayout() {
  const genres = useGenres();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onSearch = pathname === '/search';
  const selected = onSearch ? parseSearchParams(params).genres : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-label font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Bỏ qua tới nội dung chính
      </a>
      <div className="sticky top-0 z-40">
        <SiteHeader />
        {!genres.isError && (
          <GenreBar
            genres={genres.data}
            loading={genres.isPending}
            activeSlug={selected.length === 1 ? selected[0] : null}
            allActive={onSearch && selected.length === 0}
          />
        )}
      </div>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Container className="flex flex-col gap-12 pt-8 pb-16">
          <Outlet />
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
