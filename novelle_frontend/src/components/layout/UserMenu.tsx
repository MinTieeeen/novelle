import { BookMarked, LogOut, Monitor, Moon, PenTool, Shield, Sun, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme, type Theme } from '@/app/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials } from '@/utils/format';

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Sáng', icon: Sun },
  { value: 'dark', label: 'Tối', icon: Moon },
  { value: 'system', label: 'Theo hệ thống', icon: Monitor },
];

/** Avatar button that opens the account menu: profile, library, role areas, site theme, log out. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  if (!user) return null;

  const name = user.author?.penName ?? user.displayName;

  async function handleLogout() {
    await logout();
    toast.success('Đã đăng xuất');
    navigate('/');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Tài khoản của ${user.displayName}`}
        className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      >
        <Avatar className="size-9">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
          <AvatarFallback className="bg-accent text-small font-semibold text-accent-foreground">
            {initials(user.displayName)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-semibold">{name}</span>
          <span className="truncate text-caption font-normal text-muted-foreground">@{user.username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserRound /> Hồ sơ
        </DropdownMenuItem>
        {user.role !== 'ADMIN' && (
          <DropdownMenuItem onSelect={() => navigate('/library')}>
            <BookMarked /> Thư viện
          </DropdownMenuItem>
        )}
        {user.role === 'AUTHOR' && (
          <DropdownMenuItem onSelect={() => navigate('/studio')}>
            <PenTool /> Studio
          </DropdownMenuItem>
        )}
        {user.role === 'ADMIN' && (
          <DropdownMenuItem onSelect={() => navigate('/admin')}>
            <Shield /> Quản trị
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-caption font-normal text-muted-foreground">Giao diện</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon /> {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleLogout}>
          <LogOut /> Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
