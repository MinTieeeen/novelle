import { Outlet } from 'react-router-dom';
import { Container } from '@/components/layout/Container';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

/** Reader site frame: header, a 1200px content column (mobile-first), footer. */
export default function ReaderLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Container className="flex flex-col gap-12 pt-8 pb-16">
          <Outlet />
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
