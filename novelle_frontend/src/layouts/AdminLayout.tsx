import { ChartColumn, IdCard, ShieldCheck, Tag, Users } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { SideNav, type SideNavItem } from '@/components/layout/SideNav';

/** Admin frame (designed for ≥ 1024px first): sidebar + page column. */
export default function AdminLayout() {
  const { user } = useAuth();
  // The pending author-request counter is wired with the admin module.
  const items: SideNavItem[] = [
    { to: '/admin/dashboard', label: 'Thống kê', icon: ChartColumn },
    { to: '/admin/users', label: 'Người dùng', icon: Users },
    { to: '/admin/author-requests', label: 'Yêu cầu tác giả', icon: IdCard },
    { to: '/admin/stories', label: 'Kiểm duyệt truyện', icon: ShieldCheck },
    { to: '/admin/catalog', label: 'Danh mục', icon: Tag },
  ];

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <SideNav
        area="Admin"
        homeTo="/admin/dashboard"
        items={items}
        user={{ name: user?.displayName ?? 'Quản trị viên', roleLabel: 'Admin', tone: 'nghe' }}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 pt-8 pb-16 sm:px-6 lg:px-10">
        <Outlet />
      </main>
    </div>
  );
}
