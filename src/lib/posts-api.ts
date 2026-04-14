// Client-side fetch helpers for the posts API.
// All functions throw on non-OK responses so TanStack Query surfaces them as errors.

export interface PostAuthor {
  id: string;
  name: string;
}

export interface Post {
  id: string;
  brand_id: string;
  post_type: string;
  platform: string;
  status: string;
  headline: string | null;
  caption: string | null;
  cta: string | null;
  banner_text: string | null;
  image_prompt: string | null;
  source_type: string | null;
  source_id: string | null;
  tracking_id: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  rejected_reason: string | null;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  creator: PostAuthor;
  approver: PostAuthor | null;
}

export interface PostsPage {
  posts: Post[];
  total: number;
  page: number;
  per_page: number;
}

export interface PostFilters {
  status?: string;
  platform?: string;
  post_type?: string;
  page?: number;
  per_page?: number;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export function buildPostsUrl(filters: PostFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.post_type) params.set("post_type", filters.post_type);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.per_page) params.set("per_page", String(filters.per_page));
  const qs = params.toString();
  return qs ? `/api/posts?${qs}` : "/api/posts";
}

export const postsApi = {
  list: (filters: PostFilters = {}) =>
    apiFetch<PostsPage>(buildPostsUrl(filters)),

  get: (id: string) =>
    apiFetch<Post>(`/api/posts/${id}`),

  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<Post>(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  approve: (id: string) =>
    apiFetch<Post>(`/api/posts/${id}/approve`, { method: "POST" }),

  reject: (id: string, reason?: string) =>
    apiFetch<Post>(`/api/posts/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }),

  schedule: (id: string, scheduledAt: string) =>
    apiFetch<Post>(`/api/posts/${id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    }),
};
