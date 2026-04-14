// Client-side fetch helpers for the templates API.
// All functions throw on non-OK responses so TanStack Query surfaces them as errors.

import type { TemplateType, TextTemplateConfig, AssetConfig } from "@/lib/validations/template";

export interface Template {
  id: string;
  brand_id: string | null;
  template_type: TemplateType;
  name: string;
  active: boolean;
  config_json: TextTemplateConfig | AssetConfig | Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export interface ListTemplatesParams {
  template_type?: TemplateType;
  active?: boolean;
  include_global?: boolean;
}

export const templatesApi = {
  list: (params?: ListTemplatesParams) => {
    const q = new URLSearchParams();
    if (params?.template_type) q.set("template_type", params.template_type);
    if (params?.active !== undefined) q.set("active", String(params.active));
    if (params?.include_global === false) q.set("include_global", "false");
    const qs = q.toString();
    return apiFetch<Template[]>(`/api/templates${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) => apiFetch<Template>(`/api/templates/${id}`),

  create: (data: {
    template_type: TemplateType;
    name: string;
    active?: boolean;
    config: TextTemplateConfig | AssetConfig;
  }) =>
    apiFetch<Template>("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: {
      name?: string;
      active?: boolean;
      config?: Partial<TextTemplateConfig> | Partial<AssetConfig>;
    }
  ) =>
    apiFetch<Template>(`/api/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};
