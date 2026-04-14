// Client-side fetch helpers for the audit logs API.

export interface AuditLogUser {
  id: string;
  name: string;
  email: string;
}

export interface AuditLogEntry {
  id: string;
  brand_id: string | null;
  user_id: string;
  user: AuditLogUser;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: unknown;
  after_json: unknown;
  created_at: string;
}

export interface AuditLogsResponse {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  per_page: number;
}

export interface ListAuditLogsParams {
  action?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export const auditLogsApi = {
  list: (params?: ListAuditLogsParams) => {
    const q = new URLSearchParams();
    if (params?.action) q.set("action", params.action);
    if (params?.entity_type) q.set("entity_type", params.entity_type);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.page) q.set("page", String(params.page));
    if (params?.per_page) q.set("per_page", String(params.per_page));
    const qs = q.toString();
    return apiFetch<AuditLogsResponse>(`/api/audit-logs${qs ? `?${qs}` : ""}`);
  },
};
