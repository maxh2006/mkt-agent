// Client-side fetch helpers for the automations API.
// All functions throw on non-OK responses so TanStack Query surfaces them as errors.

export interface AutomationRule {
  id: string;
  brand_id: string;
  rule_name: string;
  rule_type: string;
  enabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export const automationsApi = {
  list: () =>
    apiFetch<AutomationRule[]>("/api/automations"),

  update: (id: string, data: { enabled?: boolean; config_json?: Record<string, unknown> }) =>
    apiFetch<AutomationRule>(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};
