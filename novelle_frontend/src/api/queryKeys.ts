import type { AdminRequestsQuery } from '@/api/authorRequests';
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

  /* FE3 reading. Chapter reads count a view and move the position: never prefetch them. */
  chapters: {
    detail: (chapterId: number) => ['chapters', chapterId] as const,
  },
  readingProgress: (storyId: number) => ['reading-progress', storyId] as const,

  /* FE4 library + rating (logout drops every key but me, so personal data never survives it) */
  library: {
    all: ['library'] as const,
    history: (size: number) => ['library', 'history', size] as const,
    follows: ['library', 'follows'] as const,
    authors: ['library', 'authors'] as const,
  },
  follow: {
    story: (storyId: number) => ['follow', 'story', storyId] as const,
    author: (authorId: number) => ['follow', 'author', authorId] as const,
  },
  readingLists: {
    all: ['reading-lists'] as const,
    mine: ['reading-lists', 'mine'] as const,
    detail: (listId: number) => ['reading-lists', 'detail', listId] as const,
    page: (listId: number, page: number) => ['reading-lists', 'detail', listId, 'page', page] as const,
    allItems: (listId: number) => ['reading-lists', 'detail', listId, 'all'] as const,
    publicOf: (username: string) => ['reading-lists', 'public', username] as const,
  },
  ratings: {
    list: (storyId: number) => ['ratings', storyId] as const,
    mine: (storyId: number) => ['ratings', storyId, 'me'] as const,
  },

  /* FE5 author requests */
  authorRequests: {
    mine: ['author-requests', 'me'] as const,
  },
  admin: {
    authorRequests: {
      all: ['admin', 'author-requests'] as const,
      list: (query: AdminRequestsQuery) => ['admin', 'author-requests', 'list', query] as const,
      detail: (requestId: number) => ['admin', 'author-requests', 'detail', requestId] as const,
      pendingCount: ['admin', 'author-requests', 'pending-count'] as const,
    },
  },
} as const;
