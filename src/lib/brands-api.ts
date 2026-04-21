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
  /**
   * Legacy top-level logo column. Superseded by
   * `design_settings_json.logos.{main,square,horizontal,vertical}` since
   * 2026-04-21. Kept for backward read compatibility; the form migrates
   * this value into `design.logos.main` on load if the new slot is empty.
   */
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  domain: string | null;
  active: boolean;
  integration_settings_json: IntegrationSettings | Record<string, unknown>;
  voice_settings_json: VoiceSettings | Record<string, unknown>;
  design_settings_json: DesignSettings | Record<string, unknown>;
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

export interface BrandIdentityInput {
  name: string;
  domain: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  active?: boolean;
}

export interface BrandCreateInput {
  identity: BrandIdentityInput;
  integration?: Partial<IntegrationSettings>;
  voice: VoiceSettings;
  design?: Partial<DesignSettings>;
  sample_captions?: SampleCaption[];
}

export interface BrandUpdateInput {
  identity?: Partial<BrandIdentityInput>;
  integration?: Partial<IntegrationSettings>;
  voice?: Partial<VoiceSettings>;
  design?: Partial<DesignSettings>;
  sample_captions?: SampleCaption[];
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

  create(data: BrandCreateInput): Promise<Brand> {
    return fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    }).then((r) => handleResponse<Brand>(r));
  },

  update(id: string, data: BrandUpdateInput): Promise<Brand> {
    return fetch(`/api/brands/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    }).then((r) => handleResponse<Brand>(r));
  },
};
