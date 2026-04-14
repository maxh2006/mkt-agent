import type {
  IntegrationSettings,
  VoiceSettings,
  DesignSettings,
  SampleCaption,
} from "@/lib/validations/brand";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Brand {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  domain: string | null;
  active: boolean;
  integration_settings_json: IntegrationSettings | Record<string, unknown>;
  voice_settings_json: VoiceSettings | Record<string, unknown>;
  design_settings_json: Record<string, unknown>;
  sample_captions_json: SampleCaption[];
  created_at: string;
  updated_at: string;
}

export interface ListBrandsParams {
  search?: string;
  active?: "true" | "false";
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  const json = await res.json();
  return json.data as T;
}

export const brandsApi = {
  list(params: ListBrandsParams = {}): Promise<Brand[]> {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.active) q.set("active", params.active);
    const qs = q.toString();
    return fetch(`/api/brands${qs ? `?${qs}` : ""}`, { credentials: "include" }).then(
      (r) => handleResponse<Brand[]>(r)
    );
  },

  get(id: string): Promise<Brand> {
    return fetch(`/api/brands/${id}`, { credentials: "include" }).then((r) =>
      handleResponse<Brand>(r)
    );
  },

  create(data: {
    identity: {
      name: string;
      domain?: string;
      logo_url?: string;
      primary_color?: string;
      secondary_color?: string;
      accent_color?: string;
      active?: boolean;
    };
    integration?: Partial<IntegrationSettings>;
    voice?: Partial<VoiceSettings>;
    design?: Record<string, string>;
    sample_captions?: SampleCaption[];
  }): Promise<Brand> {
    return fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    }).then((r) => handleResponse<Brand>(r));
  },

  update(
    id: string,
    data: {
      identity?: Partial<{
        name: string;
        domain: string;
        logo_url: string;
        primary_color: string;
        secondary_color: string;
        accent_color: string;
        active: boolean;
      }>;
      integration?: Partial<IntegrationSettings>;
      voice?: Partial<VoiceSettings>;
      design?: Record<string, string>;
      sample_captions?: SampleCaption[];
    }
  ): Promise<Brand> {
    return fetch(`/api/brands/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    }).then((r) => handleResponse<Brand>(r));
  },
};
