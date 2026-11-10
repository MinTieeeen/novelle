import { Logo } from '@/components/brand/Logo';
import { Container } from '@/components/layout/Container';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <Container className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-8">
        <Logo className="h-6" />
        <p className="text-small text-muted-foreground">Đồ án môn Hệ quản trị cơ sở dữ liệu, học kỳ 261.</p>
      </Container>
    </footer>
  );
}
