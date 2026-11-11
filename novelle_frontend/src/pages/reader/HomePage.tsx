import { useQuery } from '@tanstack/react-query';
import { getHome } from '@/api/catalog';
import { queryKeys } from '@/api/queryKeys';
import { ErrorResult } from '@/components/common/ErrorResult';
import { GenreGrid, TopList, UpdatedList } from '@/components/story/HomeLists';
import { StoryShelf } from '@/components/story/StoryShelf';
import { StoryGridSkeleton, StoryRowsSkeleton } from '@/components/story/StorySkeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle, useGenres } from '@/hooks/useCatalog';

/**
 * R1 · Trang chủ (Main board): Mới cập nhật + Xem nhiều nhất side by side, then the shelves Truyện mới,
 * Đánh giá cao, Đã hoàn thành, then the genre grid. The "Đọc tiếp" block above them comes with FE4.
 * An empty block is hidden.
 */
export default function HomePage() {
  useDocumentTitle(null);
  const home = useQuery({ queryKey: queryKeys.home, queryFn: getHome, staleTime: 2 * 60_000 });
  const genres = useGenres();

  if (home.isError) {
    return (
      <ErrorResult
        title="Chưa tải được trang chủ"
        description="Kiểm tra kết nối rồi thử lại."
        onRetry={() => home.refetch()}
      />
    );
  }

  const data = home.data;
  return (
    <>
      <h1 className="sr-only">Novelle: truyện dài kỳ, đọc từng chương</h1>

      <div className="flex flex-wrap items-start gap-8">
        <div className="min-w-0 flex-[999_1_560px]">
          {data ? <UpdatedList stories={data.latestUpdated.slice(0, 8)} moreTo="/search?sort=updated" /> : <BlockSkeleton rows={8} />}
        </div>
        <div className="min-w-0 flex-[1_1_300px]">
          {data ? <TopList stories={data.mostViewed.slice(0, 10)} moreTo="/search?sort=views" /> : <BlockSkeleton rows={10} />}
        </div>
      </div>

      {data ? (
        <>
          <StoryShelf id="h-newest" title="Truyện mới" stories={data.newest} moreTo="/search?sort=newest" />
          <StoryShelf id="h-top-rated" title="Đánh giá cao" stories={data.topRated} moreTo="/search?sort=rating" />
          <StoryShelf id="h-completed" title="Đã hoàn thành" stories={data.completed} moreTo="/search?status=COMPLETED" />
        </>
      ) : (
        [0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-4">
            <Skeleton className="h-[30px] w-48" />
            <StoryGridSkeleton count={6} />
          </div>
        ))
      )}

      {genres.data && <GenreGrid genres={genres.data} />}
    </>
  );
}

function BlockSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[30px] w-48" />
      <StoryRowsSkeleton count={rows} />
    </div>
  );
}
