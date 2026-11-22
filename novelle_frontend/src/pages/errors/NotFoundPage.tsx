import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="mx-auto grid min-h-[60vh] w-full max-w-content place-items-center px-4">
      <EmptyState
        title="Không tìm thấy trang này"
        description="Đường dẫn có thể đã đổi hoặc nội dung đã bị gỡ."
        action={
          <Button asChild>
            <Link to="/">Về trang chủ</Link>
          </Button>
        }
      />
    </div>
  );
}
