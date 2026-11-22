import { PenTool } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useReturnFocus } from '@/hooks/useReturnFocus';

interface StudioIntroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Invitation shown when a READER clicks "Studio" in the header (board StudioIntro): nghe circle with a pen,
 * italic title, one sentence, "Để sau" / "Trở thành tác giả" (→ /become-author).
 */
export function StudioIntroDialog({ open, onOpenChange }: StudioIntroDialogProps) {
  const returnFocus = useReturnFocus(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={returnFocus} className="flex max-w-[480px] flex-col items-center gap-5 px-9 pt-10 pb-8 text-center sm:max-w-[480px]">
        <span aria-hidden className="grid size-16 place-items-center rounded-full bg-nghe text-foreground">
          <PenTool className="size-7" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col gap-2.5">
          <DialogTitle className="font-serif text-[26px] leading-[34px] font-semibold tracking-[-0.01em] italic sm:text-[28px] sm:leading-9">
            Câu chuyện của bạn đang chờ được viết
          </DialogTitle>
          <DialogDescription className="font-serif text-[17px] leading-7 text-muted-foreground">
            Mỗi bộ truyện đều bắt đầu bằng một dòng đầu tiên. Hãy để độc giả Novelle gặp thế giới bạn đang nghĩ tới.
          </DialogDescription>
        </div>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Để sau
          </Button>
          <Button asChild className="font-semibold">
            <Link to="/become-author" onClick={() => onOpenChange(false)}>
              Trở thành tác giả
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
