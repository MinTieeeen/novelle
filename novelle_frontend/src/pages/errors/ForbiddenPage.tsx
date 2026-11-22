import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';

export default function ForbiddenPage() {
  return (
    <div className="mx-auto grid min-h-[60vh] w-full max-w-content place-items-center px-4">
      <EmptyState
        title="Bạn không có quyền xem trang này"
        description="Trang này dành cho vai trò khác. Đăng nhập bằng tài khoản phù hợp hoặc quay về trang chủ."
        action={
          <Button asChild>
            <Link to="/">Về trang chủ</Link>
          </Button>
        }
      />
    </div>
  );
}
