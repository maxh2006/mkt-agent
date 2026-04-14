// Client-side fetch helpers for the channels API.
// All functions throw on non-OK responses so TanStack Query surfaces them as errors.

export interface Channel {
  id: string;
  brand_id: string;
  platform: string;
  account_name: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export const channelsApi = {
  list: () =>
    apiFetch<Channel[]>("/api/channels"),

  get: (id: string) =>
    apiFetch<Channel>(`/api/channels/${id}`),

  create: (data: { platform: string; account_name: string; status?: string; notes?: string }) =>
    apiFetch<Channel>("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { account_name?: string; status?: string; notes?: string }) =>
    apiFetch<Channel>(`/api/channels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};
