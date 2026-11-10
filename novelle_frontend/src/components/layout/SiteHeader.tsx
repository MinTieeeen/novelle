import { ChevronDown, Menu, PenTool, Search, Shield } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthModal } from '@/auth/AuthModalProvider';
import { useAuth } from '@/auth/AuthProvider';
import { Logo } from '@/components/brand/Logo';
import { Container } from '@/components/layout/Container';
import { UserMenu } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-1 rounded-md px-3 py-2 whitespace-nowrap text-label font-medium transition-colors hover:bg-secondary',
    isActive ? 'bg-accent text-accent-foreground hover:bg-accent' : 'text-foreground',
  );

/**
 * ReaderLayout header (SiteHeader design): wordmark → nav → search → role link → avatar.
 * Guests see "Đăng nhập" (ghost) and "Đăng ký" (primary). On mobile the nav moves into a Sheet.
 * The genre mega-menu and the quick-search dropdown are added with the catalog/search module.
 */
export function SiteHeader() {
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [mobileOpen, setMobileOpen] = useState(false);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const keyword = q.trim();
    navigate(keyword ? `/search?q=${encodeURIComponent(keyword)}` : '/search');
  }

  const navItems = [
    // { to: '/', label: 'Trang chủ', end: true },
    { to: '/search', label: 'Thể loại', end: false, chevron: true },
    ...(user && user.role !== 'ADMIN' ? [{ to: '/library', label: 'Thư viện', end: false }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card">
      <Container className="flex min-h-header items-center gap-x-2 gap-y-3 sm:gap-x-6">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Mở menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>
                <Logo />
              </SheetTitle>
            </SheetHeader>
            <nav aria-label="Chính" className="flex flex-col gap-1 px-4">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={() => setMobileOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <Link to="/" aria-label="Novelle — Trang chủ" className="flex shrink-0">
          <Logo alt="Novelle" className="h-6 sm:h-[30px]" />
        </Link>

        <nav aria-label="Chính" className="hidden gap-1 md:flex">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              {item.label}
              {item.chevron && <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden />}
            </NavLink>
          ))}
        </nav>

        {/* Below sm the search box collapses into an icon button (SiteHeader spec). */}
        <Button variant="ghost" size="icon" asChild className="ml-auto sm:hidden">
          <Link to="/search" aria-label="Tìm truyện, tác giả">
            <Search />
          </Link>
        </Button>
        <form role="search" onSubmit={submitSearch} className="hidden flex-1 justify-end sm:flex">
          <label className="flex h-10 w-full max-w-[360px] items-center gap-2 rounded-md bg-secondary px-3 text-muted-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring focus-within:outline-solid">
            <Search className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm truyện, tác giả"
              aria-label="Tìm truyện, tác giả"
              className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </form>

        {status !== 'loading' && (user ? <SignedInActions /> : <GuestActions />)}
      </Container>
    </header>
  );
}

function SignedInActions() {
  const { user } = useAuth();
  const pill =
    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-label font-semibold whitespace-nowrap transition-colors';

  return (
    <div className="flex items-center gap-3">
      {user?.role === 'AUTHOR' && (
        <Link to="/studio" title="Vào Studio" className={cn(pill, 'bg-nghe text-on-nghe hover:brightness-95')}>
          <PenTool className="size-4" strokeWidth={2} aria-hidden />
          <span className="hidden sm:inline">Studio</span>
        </Link>
      )}
      {user?.role === 'READER' && (
        // The design opens the "StudioIntro" invitation popup here; it is added with the author-request module.
        <Link
          to="/become-author"
          title="Studio dành cho tác giả"
          className={cn(pill, 'bg-cham-hover text-primary-foreground hover:bg-primary')}
        >
          <PenTool className="size-4" strokeWidth={2} aria-hidden />
          <span className="hidden sm:inline">Studio</span>
        </Link>
      )}
      {user?.role === 'ADMIN' && (
        <Link to="/admin" className={cn(pill, 'bg-accent text-accent-foreground hover:bg-secondary')}>
          <Shield className="size-4" strokeWidth={2} aria-hidden />
          <span className="hidden sm:inline">Quản trị</span>
        </Link>
      )}
      <UserMenu />
    </div>
  );
}

/** Guests open the login/register popup over the current page (they stay on it after logging in). */
function GuestActions() {
  const authModal = useAuthModal();
  return (
    <div className="flex items-center gap-2">
      {/* Below sm only one button fits; the popup has the Đăng ký tab. */}
      <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => authModal.open('login')}>
        Đăng nhập
      </Button>
      <Button className="sm:hidden" onClick={() => authModal.open('login')}>
        Đăng nhập
      </Button>
      <Button className="hidden sm:inline-flex" onClick={() => authModal.open('register')}>
        Đăng ký
      </Button>
    </div>
  );
}
