import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LoginValues, RegisterValues } from '@/types/user';

export type AuthTab = 'login' | 'register';

interface AuthModalProps {
  open: boolean;
  tab: AuthTab;
  onTabChange: (tab: AuthTab) => void;
  onOpenChange: (open: boolean) => void;
  onLogin: (values: LoginValues) => Promise<unknown>;
  onRegister: (values: RegisterValues) => Promise<unknown>;
}

const tabClass =
  'pt-0 pb-3 font-serif text-[22px] leading-7 font-semibold text-input hover:text-foreground data-[state=active]:text-primary';

/**
 * Login / register popup (AuthModal board): 460px card, mark + wordmark, two serif tabs, one form each.
 * Presentational: the caller (auth/AuthModalProvider) calls the API and shows the toasts.
 */
export function AuthModal({ open, tab, onTabChange, onOpenChange, onLogin, onRegister }: AuthModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        // Focus the first field of the open tab, not the tab button (no focus frame on the tabs at open).
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const panel = (e.currentTarget as HTMLElement).querySelector('[role="tabpanel"][data-state="active"]');
          panel?.querySelector<HTMLInputElement>('input')?.focus();
        }}
        className="max-h-[calc(100dvh-48px)] max-w-[calc(100%-2rem)] gap-0 overflow-y-auto border-0 p-0 sm:max-w-[460px]"
      >
        <DialogTitle className="sr-only">{tab === 'register' ? 'Đăng ký tài khoản Novelle' : 'Đăng nhập Novelle'}</DialogTitle>
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as AuthTab)} className="gap-6 px-6 pt-8 pb-8 sm:px-10">
          <div className="flex items-center justify-center gap-3" aria-hidden>
            <img src="/brand/novelle-mark.svg" alt="" className="h-9 w-auto" />
            <img src="/brand/novelle-wordmark.svg" alt="" className="h-7 w-auto" />
          </div>
          <TabsList aria-label="Tài khoản" className="justify-center gap-10">
            <TabsTrigger value="login" className={tabClass}>
              Đăng nhập
            </TabsTrigger>
            <TabsTrigger value="register" className={tabClass}>
              Đăng ký
            </TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <LoginForm onSubmit={onLogin} />
          </TabsContent>
          <TabsContent value="register">
            <RegisterForm onSubmit={onRegister} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
