import type { AdminStoriesQuery, AdminUsersQuery } from '@/api/admin';
import type { AdminRequestsQuery } from '@/api/authorRequests';
import type { AuthorStoriesQuery } from '@/api/authors';
import type { StudioStoriesQuery, ViewsQuery } from '@/api/studio';
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
  tagsAll: ['tags'] as const,
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
    /* FE7 */
    users: {
      all: ['admin', 'users'] as const,
      lists: ['admin', 'users', 'list'] as const,
      list: (query: AdminUsersQuery) => ['admin', 'users', 'list', query] as const,
      detail: (userId: number) => ['admin', 'users', 'detail', userId] as const,
    },
    stories: {
      all: ['admin', 'stories'] as const,
      lists: ['admin', 'stories', 'list'] as const,
      list: (query: AdminStoriesQuery) => ['admin', 'stories', 'list', query] as const,
    },
    genres: ['admin', 'genres'] as const,
    tagsAll: ['admin', 'tags'] as const,
    tags: (query: { q?: string; page?: number }) => ['admin', 'tags', query] as const,
    stats: {
      all: ['admin', 'stats'] as const,
      overview: ['admin', 'stats', 'overview'] as const,
      views: (query: Omit<ViewsQuery, 'storyId'>) => ['admin', 'stats', 'views', query] as const,
      genres: ['admin', 'stats', 'genres'] as const,
      users: ['admin', 'stats', 'users'] as const,
      topAuthors: ['admin', 'stats', 'top-authors'] as const,
    },
    authorRequests: {
      all: ['admin', 'author-requests'] as const,
      list: (query: AdminRequestsQuery) => ['admin', 'author-requests', 'list', query] as const,
      detail: (requestId: number) => ['admin', 'author-requests', 'detail', requestId] as const,
      pendingCount: ['admin', 'author-requests', 'pending-count'] as const,
    },
  },

  /* FE6 Studio (AUTHOR): dropped on logout like every personal key */
  studio: {
    all: ['studio'] as const,
    stories: (query: StudioStoriesQuery = {}) => ['studio', 'stories', query] as const,
    story: (storyId: number) => ['studio', 'story', storyId] as const,
    volumes: (storyId: number) => ['studio', 'story', storyId, 'volumes'] as const,
    chapters: (storyId: number) => ['studio', 'story', storyId, 'chapters'] as const,
    chapter: (chapterId: number) => ['studio', 'chapter', chapterId] as const,
    revisions: (chapterId: number) => ['studio', 'chapter', chapterId, 'revisions'] as const,
    profile: ['studio', 'profile'] as const,
    dashboard: {
      overview: ['studio', 'dashboard', 'overview'] as const,
      views: (query: ViewsQuery) => ['studio', 'dashboard', 'views', query] as const,
      stories: ['studio', 'dashboard', 'stories'] as const,
      followers: ['studio', 'dashboard', 'followers'] as const,
    },
  },
} as const;
