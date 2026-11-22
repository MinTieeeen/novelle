import { BookOpen, Check, Eye, FileText, Heart, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge, AgeBadge } from '@/components/story/StoryBadges';
import { StoryCover } from '@/components/story/StoryCover';
import { Button } from '@/components/ui/button';
import type { StoryDetail } from '@/types/story';
import { formatNumber, formatRating, formatRelative, initials } from '@/utils/format';

interface StoryHeroProps {
  story: StoryDetail;
  /** chapterId of the first chapter, null when nothing is published yet */
  firstChapterId: number | null;
  /** "Đọc tiếp" button (FE3), placed before "Đọc từ đầu" */
  continueSlot?: ReactNode;
  /** Theo dõi / Thêm vào tủ (FE4), after "Đọc từ đầu" */
  actionsSlot?: ReactNode;
}

/**
 * Top of the story page (StoryHero board): book cover, breadcrumb by primary genre, title, author with
 * the verified tick, status, last update, genres (primary filled) and tags, five stats, read buttons.
 */
export function StoryHero({ story, firstChapterId, continueSlot, actionsSlot }: StoryHeroProps) {
  const primary = story.genres.find((g) => g.isPrimary) ?? story.genres[0];
  const stats: { icon: typeof Star; label: string; value: ReactNode }[] = [
    {
      icon: Star,
      label: 'Đánh giá',
      value:
        story.ratingCount > 0 ? (
          <>
            {formatRating(story.ratingAvg)}{' '}
            <span className="font-sans text-small font-normal text-muted-foreground">({formatNumber(story.ratingCount)})</span>
          </>
        ) : (
          <span className="font-sans text-label font-normal text-muted-foreground">Chưa có</span>
        ),
    },
    { icon: BookOpen, label: 'Chương', value: formatNumber(story.chapterCount) },
    { icon: Eye, label: 'Lượt xem', value: formatNumber(story.viewCount) },
    { icon: Heart, label: 'Theo dõi', value: formatNumber(story.followCount) },
    { icon: FileText, label: 'Số chữ', value: formatNumber(story.wordCount) },
  ];

  return (
    <section aria-labelledby="story-title" className="flex flex-col gap-8 sm:flex-row sm:gap-10">
      <div className="mx-auto w-[200px] shrink-0 sm:mx-0 sm:w-[240px]">
        <StoryCover storyId={story.storyId} title={story.title} penName={story.author.penName} coverUrl={story.coverUrl} size="lg" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <nav aria-label="Đường dẫn" className="text-small text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Trang chủ
          </Link>
          {primary && (
            <>
              {' › '}
              <Link to={`/search?genres=${primary.slug}`} className="hover:text-foreground">
                {primary.name}
              </Link>
            </>
          )}
        </nav>

        <h1 id="story-title" className="text-[32px] leading-[38px] font-[620] tracking-[-0.02em] sm:text-display sm:leading-[50px]">
          {story.title}
        </h1>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link to={`/authors/${story.author.authorId}`} className="inline-flex items-center gap-2 font-semibold hover:text-primary">
            <span aria-hidden className="grid size-7 place-items-center rounded-full bg-accent text-caption font-semibold text-accent-foreground">
              {initials(story.author.penName)}
            </span>
            {story.author.penName}
            {story.author.isVerified && (
              <span
                role="img"
                aria-label="Tác giả đã xác minh"
                title="Tác giả đã xác minh"
                className="grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                <Check className="size-2.5" strokeWidth={3} aria-hidden />
              </span>
            )}
          </Link>
          <span aria-hidden className="text-input">
            ·
          </span>
          <StatusBadge status={story.completionStatus} />
          <AgeBadge ageRating={story.ageRating} />
          {story.lastChapterAt && <span className="text-small text-muted-foreground">Cập nhật {formatRelative(story.lastChapterAt)}</span>}
        </div>

        {(story.genres.length > 0 || story.tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {story.genres.map((g) => (
              <Link
                key={g.genreId}
                to={`/search?genres=${g.slug}`}
                className={
                  g.isPrimary
                    ? 'inline-flex h-[30px] items-center rounded-full bg-primary px-3 text-small font-medium text-primary-foreground hover:bg-cham-hover'
                    : 'inline-flex h-[30px] items-center rounded-full border border-input px-3 text-small font-medium hover:bg-secondary'
                }
              >
                {g.name}
              </Link>
            ))}
            {story.genres.length > 0 && story.tags.length > 0 && <span aria-hidden className="mx-1 h-[30px] w-px bg-border" />}
            {story.tags.map((t) => (
              <Link key={t.tagId} to={`/search?tags=${t.slug}`} className="inline-flex h-[30px] items-center px-2 text-small text-link hover:underline">
                #{t.name}
              </Link>
            ))}
          </div>
        )}

        <dl className="mt-1 grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-4 border-y border-border py-4">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="flex items-center gap-1.5 text-small text-muted-foreground">
                <Icon aria-hidden className={label === 'Đánh giá' ? 'size-4 fill-nghe text-nghe' : 'size-4'} strokeWidth={1.75} />
                {label}
              </dt>
              <dd className="num font-serif text-[22px] leading-7 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center gap-3">
          {continueSlot}
          {firstChapterId != null ? (
            <Button asChild size="lg" variant={continueSlot ? 'outline' : 'default'} className="h-11 px-5 font-semibold">
              <Link to={`/chapters/${firstChapterId}`}>Đọc từ đầu</Link>
            </Button>
          ) : (
            <p className="text-small text-muted-foreground">Truyện chưa có chương nào được đăng.</p>
          )}
          {actionsSlot}
        </div>
      </div>
    </section>
  );
}
