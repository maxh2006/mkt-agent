// Client-side fetch helpers for the posts API.
// All functions throw on non-OK responses so TanStack Query surfaces them as errors.

export interface PostAuthor {
  id: string;
  name: string;
}

export interface BrandRef {
  id: string;
  name: string;
  primary_color?: string | null;
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
  source_instance_key: string | null;
  generation_context_json?: Record<string, unknown> | null;
  tracking_id: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  rejected_reason: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  creator: PostAuthor;
  approver: PostAuthor | null;
  brand?: BrandRef;
  event_posting_summary?: string | null;
  event_title?: string | null;
  schedule_summary?: string | null;
  sample_group?: { id: string; index: number; total: number } | null;
}

export interface PostsPage {
  posts: Post[];
  total: number;
  page: number;
  per_page: number;
  mode?: string;
}

export interface PostFilters {
  status?: string;
  statuses?: string;
  platform?: string;
  post_type?: string;
  date_from?: string;
  date_to?: string;
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
  if (filters.statuses) params.set("statuses", filters.statuses);
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.post_type) params.set("post_type", filters.post_type);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
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

  getEventContext: (id: string) =>
    apiFetch<EventBriefContext | null>(`/api/posts/${id}/event-context`),

  getDeliveries: (id: string) =>
    apiFetch<{
      post: { id: string; status: string; scheduled_at: string | null; platform: string };
      deliveries: PlatformDelivery[];
    }>(`/api/posts/${id}/deliveries`),

  retryDelivery: (id: string, platform: string) =>
    apiFetch<PlatformDelivery>(`/api/posts/${id}/deliveries/${platform}/retry`, {
      method: "POST",
    }),
};

export interface PlatformDelivery {
  id: string;
  post_id: string;
  platform: string;
  status: "queued" | "scheduled" | "publishing" | "posted" | "failed";
  scheduled_for: string | null;
  publish_requested_at: string | null;
  publish_attempted_at: string | null;
  posted_at: string | null;
  external_post_id: string | null;
  retry_count: number;
  last_error: string | null;
  worker: string | null;
  created_at: string;
  updated_at: string;
  /** Server-side classification derived from `last_error`. Null for
   *  non-failed rows. See `src/lib/manus/retryability.ts`. */
  failure_class: DeliveryFailureClass | null;
}

export interface DeliveryFailureClass {
  retryable: boolean;
  code: string | null;
  source: "classified" | "default";
  label: string;
  hint: string;
}

export interface EventBriefContext {
  event_id: string;
  event_title: string;
  theme: string | null;
  objective: string | null;
  rules: string | null;
  reward: string | null;
  target_audience: string | null;
  cta: string | null;
  tone: string | null;
  platform_scope: string[] | null;
  notes_for_ai: string | null;
  posting_instance_summary: string | null;
  occurrence_datetime: string | null;
}
