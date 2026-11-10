import { BookOpen, ChartColumn, UserRound } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { SideNav, type SideNavItem } from '@/components/layout/SideNav';

const ITEMS: SideNavItem[] = [
  // Also active on /studio/stories/** (see SideNav matchPrefix).
  { to: '/studio', label: 'Truyện của tôi', icon: BookOpen, end: true, matchPrefix: '/studio/stories' },
  { to: '/studio/dashboard', label: 'Thống kê', icon: ChartColumn },
  { to: '/studio/profile', label: 'Hồ sơ tác giả', icon: UserRound },
];

/** Studio frame (designed for ≥ 1024px first): sidebar + page column. */
export default function StudioLayout() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <SideNav
        area="Studio"
        homeTo="/studio"
        items={ITEMS}
        user={{ name: user?.author?.penName ?? user?.displayName ?? '', roleLabel: 'Tác giả' }}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 pt-8 pb-16 sm:px-6 lg:px-10">
        <Outlet />
      </main>
    </div>
  );
}
