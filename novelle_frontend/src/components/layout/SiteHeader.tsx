import { Menu, PenTool, Shield } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuthModal } from '@/auth/AuthModalProvider';
import { useAuth } from '@/auth/AuthProvider';
import { StudioIntroDialog } from '@/components/author/StudioIntroDialog';
import { Logo } from '@/components/brand/Logo';
import { Container } from '@/components/layout/Container';
import { HeaderSearch, MobileSearchRow, MobileSearchToggle } from '@/components/layout/HeaderSearch';
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
 * ReaderLayout header: wordmark → wide search box in the middle (search on Enter only) → Thư viện →
 * role link → avatar (guests: Đăng nhập / Đăng ký). Genres are in the GenreBar under the header, not in
 * the nav. On mobile the nav moves into a Sheet and the search box into a row opened by an icon.
 */
export function SiteHeader() {
  const { user, status } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const { pathname, search } = useLocation();
  // Close the mobile search row after a search or any navigation.
  useEffect(() => setSearchOpen(false), [pathname, search]);

  const navItems = [
    // { to: '/', label: 'Trang chủ', end: true },
    ...(user && user.role !== 'ADMIN' ? [{ to: '/library', label: 'Thư viện', end: false }] : []),
  ];

  return (
    <header className="border-b border-border bg-card">
      <Container className="flex min-h-header items-center gap-x-2 sm:gap-x-6">
        {navItems.length > 0 && (
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
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
                  <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={() => setMenuOpen(false)}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        )}

        <Link to="/" aria-label="Novelle — Trang chủ" className="flex shrink-0">
          <Logo alt="Novelle" className="h-6 sm:h-[30px]" />
        </Link>

        <div className="hidden min-w-0 flex-1 justify-center sm:flex">
          <HeaderSearch />
        </div>

        <MobileSearchToggle ref={searchToggle} open={searchOpen} onToggle={() => setSearchOpen((v) => !v)} />

        {navItems.length > 0 && (
          <nav aria-label="Chính" className="hidden gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        {status !== 'loading' && (user ? <SignedInActions /> : <GuestActions />)}
      </Container>
      {searchOpen && (
        <MobileSearchRow
          onClose={() => {
            setSearchOpen(false);
            searchToggle.current?.focus();
          }}
        />
      )}
    </header>
  );
}

function SignedInActions() {
  const { user } = useAuth();
  const [introOpen, setIntroOpen] = useState(false);
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
        // StudioIntro board: readers get the invitation popup instead of the Studio.
        <>
          <button
            type="button"
            title="Studio dành cho tác giả"
            aria-haspopup="dialog"
            onClick={() => setIntroOpen(true)}
            className={cn(pill, 'bg-cham-hover text-primary-foreground hover:bg-primary')}
          >
            <PenTool className="size-4" strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">Studio</span>
            <span className="sr-only sm:hidden">Studio</span>
          </button>
          <StudioIntroDialog open={introOpen} onOpenChange={setIntroOpen} />
        </>
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
