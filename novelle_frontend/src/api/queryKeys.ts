import type { AuthorStoriesQuery } from '@/api/authors';
import type { StorySearchParams } from '@/types/storySearch';

/**
 * Every TanStack Query key in one place. Mutations invalidate these keys (or their prefixes) so lists
 * and details refresh. Add a key here before using it in a page.
 */
export const queryKeys = {
  me: ['me'] as const,
  users: {
    all: ['users'] as const,
    profile: (username: string) => ['users', username] as const,
  },

  /* FE2 catalog + story (public, no mutation) */
  genres: ['genres'] as const,
  tags: (q: string) => ['tags', q] as const,
  home: ['home'] as const,
  stories: {
    all: ['stories'] as const,
    /** /search results; `view` is UI only and not part of the key */
    search: ({ view: _view, ...params }: StorySearchParams) => ['stories', 'search', params] as const,
    detail: (slug: string) => ['stories', 'detail', slug] as const,
  },
  authors: {
    detail: (authorId: number) => ['authors', authorId] as const,
    stories: (authorId: number, query: AuthorStoriesQuery = {}) => ['authors', authorId, 'stories', query] as const,
  },
} as const;
