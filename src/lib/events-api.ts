// Client-side fetch helpers for the events API.
// All functions throw on non-OK responses so TanStack Query surfaces them as errors.

export interface EventCreator {
  id: string;
  name: string;
}

export interface Event {
  id: string;
  brand_id: string;
  event_type: string;
  title: string;
  objective: string | null;
  rules: string | null;
  reward: string | null;
  start_at: string | null;
  end_at: string | null;
  theme: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator: EventCreator;
}

export interface EventsPage {
  events: Event[];
  total: number;
  page: number;
  per_page: number;
}

export interface EventFilters {
  status?: string;
  event_type?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export function buildEventsUrl(filters: EventFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.event_type) params.set("event_type", filters.event_type);
  if (filters.search) params.set("search", filters.search);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.per_page) params.set("per_page", String(filters.per_page));
  const qs = params.toString();
  return qs ? `/api/events?${qs}` : "/api/events";
}

export const eventsApi = {
  list: (filters: EventFilters = {}) =>
    apiFetch<EventsPage>(buildEventsUrl(filters)),

  get: (id: string) =>
    apiFetch<Event>(`/api/events/${id}`),

  create: (data: Record<string, unknown>) =>
    apiFetch<Event>("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<Event>(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};
