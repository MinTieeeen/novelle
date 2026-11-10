import { CircleAlert, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/app/ThemeProvider';
import { Logo } from '@/components/brand/Logo';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber, formatRating } from '@/utils/format';
import '@/styles/reader.css';

const SWATCHES = [
  ['bg-background', 'surface'],
  ['bg-card', 'surface-raised'],
  ['bg-secondary', 'surface-sunken'],
  ['bg-primary', 'cham'],
  ['bg-cham-hover', 'cham-hover'],
  ['bg-accent', 'cham-soft'],
  ['bg-nghe', 'nghe'],
  ['bg-nghe-soft', 'nghe-soft'],
  ['bg-success', 'success'],
  ['bg-warning', 'warning'],
  ['bg-destructive', 'critical'],
  ['bg-input', 'line-strong'],
] as const;

/**
 * Dev-only preview of the design system tokens and the adjusted shadcn components (/dev/design-system).
 * Not registered in production builds.
 */
export default function DesignSystemPage() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title="Novelle design system"
        description="Chàm và nghệ · bản xem trước token và component"
        actions={
          <Button variant="outline" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
            Đổi sang theme {resolvedTheme === 'dark' ? 'sáng' : 'tối'}
          </Button>
        }
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 font-semibold">Logo</h2>
        <div className="flex flex-wrap items-end gap-12">
          <Logo className="h-[72px]" />
          <Logo variant="mark" className="h-[88px]" />
          <Logo variant="mark" className="h-11" />
          <Logo variant="mark" className="h-[22px]" />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 font-semibold">Màu</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {SWATCHES.map(([cls, name]) => (
            <div key={name} className="flex flex-col gap-2">
              <div className={`h-14 rounded-md border border-border ${cls}`} />
              <span className="text-caption text-muted-foreground">{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-title-2 font-semibold">Chữ</h2>
        <p className="font-serif text-display font-[620]">Truyện dài kỳ, đọc từng chương</p>
        <p className="font-serif text-title-1 font-semibold">Truyện mới cập nhật</p>
        <p className="font-serif text-title-2 font-semibold">Mục lục</p>
        <p className="font-serif text-title-3 font-semibold">Kiếm Lai</p>
        <p className="font-serif text-chapter-title font-[560] italic">Chương 12: Người gác đèn</p>
        <p className="text-body">Truyện của bạn sẽ hiện công khai sau khi đăng chương đầu tiên.</p>
        <p className="text-small text-muted-foreground">
          Cập nhật 2 giờ trước · {formatNumber(48210)} lượt xem · {formatRating(4.6)} sao
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 font-semibold">Nút</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => toast.success('Đã đăng chương 12')}>
            <Plus /> Đăng chương
          </Button>
          <Button variant="outline">Lưu nháp</Button>
          <Button variant="ghost">Huỷ</Button>
          <Button variant="destructive">Xoá truyện</Button>
          <Button size="sm" variant="outline">
            Nhỏ
          </Button>
          <Button disabled>Đang lưu…</Button>
        </div>
        <Button variant="continue" className="w-fit">
          <b className="text-body font-semibold">Đọc tiếp: Chương 87</b>
          <span className="text-small text-nghe-ink">Đêm trăng trên đỉnh Thiên Sơn · 38%</span>
        </Button>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 font-semibold">Badge</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Đang ra</Badge>
          <Badge variant="success">Hoàn thành</Badge>
          <Badge variant="warning">Hẹn giờ</Badge>
          <Badge variant="critical">
            <span className="size-1.5 rounded-full bg-current" /> Bị ẩn
          </Badge>
          <Badge variant="outline">Bản nháp</Badge>
          <Badge variant="age">18+</Badge>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-title-3">Ô nhập</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex max-w-[360px] flex-col gap-1.5">
              <Label htmlFor="ds-pen">Bút danh</Label>
              <Input id="ds-pen" placeholder="Ví dụ: Mộc Lan" />
              <p className="text-small text-muted-foreground">Tên hiện trên truyện của bạn.</p>
            </div>
            <div className="flex max-w-[360px] flex-col gap-1.5">
              <Label htmlFor="ds-user">Tên đăng nhập</Label>
              <Input id="ds-user" aria-invalid="true" defaultValue="lananh" />
              <p className="text-small text-destructive">Tên đăng nhập này đã có người dùng. Chọn tên khác.</p>
            </div>
            <Textarea placeholder="Giới thiệu ngắn về bạn" />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Alert variant="destructive" className="border-transparent bg-critical-soft">
            <CircleAlert />
            <AlertTitle>Chương đã được sửa ở nơi khác</AlertTitle>
            <AlertDescription>Sao chép phần của bạn rồi tải lại bản mới nhất.</AlertDescription>
          </Alert>
          <Alert className="border-transparent bg-warning-soft [&>svg]:text-warning">
            <TriangleAlert />
            <AlertTitle>Yêu cầu đã được admin khác xử lý</AlertTitle>
            <AlertDescription>Danh sách đã được tải lại.</AlertDescription>
          </Alert>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 font-semibold">Tab</h2>
        <Tabs defaultValue="reading">
          <TabsList>
            <TabsTrigger value="reading">
              Đang đọc <span className="rounded-full bg-secondary px-1.5 text-caption text-muted-foreground">3</span>
            </TabsTrigger>
            <TabsTrigger value="follow">Theo dõi</TabsTrigger>
            <TabsTrigger value="lists">Tủ truyện</TabsTrigger>
          </TabsList>
          <TabsContent value="reading">
            <EmptyState
              title="Bạn chưa có tủ truyện nào"
              description="Gom các truyện muốn đọc vào một tủ để tìm lại nhanh."
              action={<Button>Tạo tủ truyện</Button>}
            />
          </TabsContent>
        </Tabs>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 font-semibold">Vùng đọc và bìa</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(['paper', 'sepia', 'night'] as const).map((t) => (
            <div key={t} className="reader rounded-lg border border-border p-6" data-theme={t}>
              <p className="mb-2 font-sans text-caption opacity-70">{t}</p>
              <p>Gió từ sông thổi vào, mang theo mùi bùn non và tiếng mái chèo khua nước.</p>
            </div>
          ))}
        </div>
        <div className="flex gap-6">
          <div className="book-cover relative flex aspect-[2/3] w-[168px] flex-col justify-between bg-primary p-4 text-primary-foreground">
            <span aria-hidden className="ribbon absolute top-0 right-4 h-9 w-3" />
            <span className="font-serif text-title-3 font-semibold italic">Người Gác Đèn Trên Sông Hương</span>
            <span className="text-caption">Mộc Lan</span>
          </div>
          <div className="book-cover relative flex aspect-[2/3] w-[168px] flex-col justify-between bg-accent p-4 text-accent-foreground">
            <span aria-hidden className="ribbon absolute top-0 right-4 h-9 w-3" />
            <span className="font-serif text-title-3 font-semibold italic">Mùa Nước Nổi</span>
            <span className="text-caption">Trần Vũ</span>
          </div>
        </div>
      </section>
    </div>
  );
}
