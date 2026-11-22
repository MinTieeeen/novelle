import { ChevronLeft, Menu, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { initials } from '@/utils/format';

export interface SideNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Also treat the item as active below this path (e.g. /studio/stories for "Truyện của tôi"). */
  matchPrefix?: string;
  /** Pending counter next to the label (admin: author requests). */
  count?: number;
}

interface SideNavProps {
  /** "Studio" or "Admin", shown in italic Literata next to the mark */
  area: string;
  homeTo: string;
  items: SideNavItem[];
  user: { name: string; roleLabel: string; tone?: 'cham' | 'nghe' };
}

/**
 * Sidebar of StudioLayout and AdminLayout (StudioSidebar / AdminSidebar designs): 248px, surface-raised
 * with a right border. The active item is cham on cham-soft with a nghe marker on the left.
 * Below 1024px it collapses into a Sheet opened from a top bar.
 */
export function SideNav(props: SideNavProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside
        aria-label={props.area}
        className="sticky top-0 hidden h-dvh w-sidebar shrink-0 border-r border-sidebar-border bg-sidebar lg:block"
      >
        <SideNavBody {...props} />
      </aside>

      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mở menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-sidebar gap-0 p-0">
            <SheetTitle className="sr-only">Menu {props.area}</SheetTitle>
            <SideNavBody {...props} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <AreaBrand area={props.area} homeTo={props.homeTo} />
      </div>
    </>
  );
}

function AreaBrand({ area, homeTo }: { area: string; homeTo: string }) {
  return (
    <Link to={homeTo} aria-label={`Novelle ${area}`} className="flex items-center gap-2.5 px-2">
      <Logo variant="mark" alt="" />
      <span className="font-serif text-[17px] leading-6 font-semibold italic">{area}</span>
    </Link>
  );
}

function SideNavBody({ area, homeTo, items, user, onNavigate }: SideNavProps & { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-5">
      <AreaBrand area={area} homeTo={homeTo} />

      <nav aria-label={`Menu ${area}`} className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon, end, matchPrefix, count }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'relative flex h-11 items-center gap-3 rounded-md px-3 text-body transition-colors',
                isActive || (matchPrefix && pathname.startsWith(matchPrefix))
                  ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground before:absolute before:top-[11px] before:-left-3 before:h-[22px] before:w-1 before:rounded-r-sm before:bg-nghe'
                  : 'font-medium text-sidebar-foreground hover:bg-secondary',
              )
            }
          >
            <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="flex-1">{label}</span>
            {count != null && count > 0 && (
              <span className="num min-w-[22px] rounded-full bg-primary px-1.5 text-center text-caption leading-[22px] font-semibold text-primary-foreground">
                {count}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <hr className="border-border" />

      <Link
        to="/"
        onClick={onNavigate}
        className="flex h-11 items-center gap-3 rounded-md px-3 text-body text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ChevronLeft className="size-[18px]" strokeWidth={1.75} aria-hidden />
        Về trang đọc
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-3 rounded-md bg-secondary p-3">
        <span
          aria-hidden
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full font-serif text-label font-semibold',
            user.tone === 'nghe' ? 'bg-nghe-soft text-nghe-ink' : 'bg-accent text-accent-foreground',
          )}
        >
          {initials(user.name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-label font-semibold">{user.name}</span>
          <span className="text-caption font-normal text-muted-foreground">{user.roleLabel}</span>
        </span>
      </div>
    </div>
  );
}
