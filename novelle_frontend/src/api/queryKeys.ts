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
} as const;
