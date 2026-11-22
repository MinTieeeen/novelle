import { http } from '@/api/http';
import type { PublicProfile } from '@/types/user';

/** GET /api/users/{username}: public profile; 404 USER_NOT_FOUND also for banned users. */
export async function getPublicProfile(username: string): Promise<PublicProfile> {
  const { data } = await http.get<PublicProfile>(`/users/${encodeURIComponent(username)}`);
  return data;
}
