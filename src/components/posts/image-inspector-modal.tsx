"use client";

// Image Inspector — read-only modal that surfaces what happened in the
// visual/image pipeline for a single draft. Pulled from
// `Post.image_url` + `Post.generation_context_json.{visual_compiled,
// image_generation, composited_image}`. No write API, no regeneration —
// inspection only.
//
// Intentionally tolerant: every block is optional + nullable. The
// inspector never crashes when part of the pipeline is missing.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  CircleSlash,
  AlertTriangle,
  ImageIcon,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Post } from "@/lib/posts-api";
import { cn } from "@/lib/utils";

// ─── Types we read out of generation_context_json ────────────────────────────
//
// These mirror what `src/lib/ai/queue-inserter.ts` writes. We type the
// shapes loosely here (Record<string, unknown>) and narrow defensively
// at use-time — older drafts may have partial / older shapes.

type Json = Record<string, unknown>;

interface VisualCompiledLite {
  layout_key?: string;
  platform_format?: string;
  visual_emphasis?: string;
  subject_focus?: string;
  render_intent?: string;
  safe_zone_config?: { zones?: unknown[]; gradient_overlay?: { enabled?: boolean } | boolean | null };
  effective_inputs?: {
    visual_style?: string;
    visual_emphasis?: string;
    main_subject_type?: string;
    layout_family?: string;
    overridden_by_event?: string[];
  };
  background_image_prompt?: string;
  negative_prompt?: string;
}

interface ImageGenerationLite {
  provider?: string;
  model?: string | null;
  status?: "ok" | "skipped" | "error" | string;
  artifact_url?: string | null;
  provider_asset_id?: string | null;
  width?: number | null;
  height?: number | null;
  skipped_reason?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  generated_at?: string;
  duration_ms?: number;
  render_version?: string;
}

interface CompositedImageLite {
  status?: "ok" | "error" | string;
  artifact_url?: string | null;
  width?: number | null;
  height?: number | null;
  layout_key?: string;
  platform_format?: string;
  visual_emphasis?: string;
  background_fallback?: boolean;
  logo_drawn?: boolean;
  bucket?: string | null;
  object_path?: string | null;
  mime_type?: string | null;
  byte_length?: number | null;
  uploaded_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  generated_at?: string;
  duration_ms?: number;
  render_version?: string;
}

function asObject(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function extractBlocks(post: Post): {
  visual: VisualCompiledLite | null;
  image: ImageGenerationLite | null;
  composited: CompositedImageLite | null;
} {
  const ctx = asObject(post.generation_context_json);
  return {
    visual: ctx ? (asObject(ctx.visual_compiled) as VisualCompiledLite | null) : null,
    image: ctx ? (asObject(ctx.image_generation) as ImageGenerationLite | null) : null,
    composited: ctx ? (asObject(ctx.composited_image) as CompositedImageLite | null) : null,
  };
}

// ─── Public: does this draft have anything worth inspecting? ─────────────────

export function postHasImageInspectorData(post: Post): boolean {
  if (post.image_url) return true;
  const blocks = extractBlocks(post);
  return !!(blocks.visual || blocks.image || blocks.composited);
}

// ─── Preview URL resolution (priority: image_url → composited → image_gen) ──

interface PreviewSource {
  url: string | null;
  origin: "post.image_url" | "composited_image" | "image_generation" | null;
  isDataUri: boolean;
}

function resolvePreview(post: Post, c: CompositedImageLite | null, i: ImageGenerationLite | null): PreviewSource {
  const candidates: Array<{ url: string | null | undefined; origin: PreviewSource["origin"] }> = [
    { url: post.image_url, origin: "post.image_url" },
    { url: c?.artifact_url, origin: "composited_image" },
    { url: i?.artifact_url, origin: "image_generation" },
  ];
  for (const { url, origin } of candidates) {
    if (url && typeof url === "string" && url.length > 0) {
      const ok = url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:image/");
      if (ok) return { url, origin, isDataUri: url.startsWith("data:image/") };
    }
  }
  return { url: null, origin: null, isDataUri: false };
}

// ─── Outcome summary (top-of-modal headline) ─────────────────────────────────

interface OutcomeSummary {
  label: string;
  tone: "ok" | "warn" | "error" | "neutral";
}

function computeOutcome(post: Post, blocks: ReturnType<typeof extractBlocks>): OutcomeSummary {
  const { visual, image, composited } = blocks;
  const compositeOk = composited?.status === "ok";
  const compositeErr = composited?.status === "error";
  const imageErr = image?.status === "error";
  const hosted = !!(post.image_url && post.image_url.startsWith("https://"));

  if (compositeOk && hosted) {
    return { label: "Final composite ready and hosted", tone: "ok" };
  }
  if (compositeOk && composited?.background_fallback) {
    return { label: "Composite generated with brand-color fallback background", tone: "warn" };
  }
  if (compositeOk && !hosted) {
    return { label: "Composite generated but not yet uploaded to GCS", tone: "warn" };
  }
  if (compositeErr && imageErr) {
    return { label: "Image pipeline failed (both background and composite)", tone: "error" };
  }
  if (compositeErr) {
    return { label: "Composite render failed", tone: "error" };
  }
  if (imageErr && !composited) {
    return { label: "Background generation failed", tone: "error" };
  }
  if (!visual && !image && !composited && !post.image_url) {
    return { label: "No image artifact available yet", tone: "neutral" };
  }
  return { label: "Image pipeline ran with partial output", tone: "neutral" };
}

// ─── Tiny presentational helpers ─────────────────────────────────────────────

function StatusChip({ status }: { status: string | undefined }) {
  if (!status) {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
        <CircleSlash className="h-3 w-3" />
        not run
      </Badge>
    );
  }
  if (status === "ok") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" />
        ok
      </Badge>
    );
  }
  if (status === "skipped") {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
        <CircleSlash className="h-3 w-3" />
        skipped
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
        <XCircle className="h-3 w-3" />
        error
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
      {status}
    </Badge>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 text-xs">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium break-all">{value ?? <span className="text-muted-foreground italic font-normal">—</span>}</p>
    </div>
  );
}

function SectionCard({
  title,
  status,
  children,
}: {
  title: string;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {status !== undefined && <StatusChip status={status} />}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard access may be denied; silently no-op.
        }
      }}
      className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ExternalUrlLine({ url, label }: { url: string | null | undefined; label?: string }) {
  if (!url) return <span className="text-muted-foreground italic">—</span>;
  const isData = url.startsWith("data:");
  if (isData) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground" title={`${url.slice(0, 80)}…`}>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">data: URI</span>
        <span className="text-[11px]">({Math.round(url.length / 1024)} KB)</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 max-w-full">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline text-xs truncate max-w-[400px]"
        title={url}
      >
        <ExternalLink className="h-3 w-3 shrink-0" />
        {label ?? url}
      </a>
      <CopyButton value={url} />
    </span>
  );
}

function fmtIso(iso: string | undefined | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtBytes(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Main modal ──────────────────────────────────────────────────────────────

interface ImageInspectorModalProps {
  post: Post | null;
  open: boolean;
  onClose: () => void;
}

export function ImageInspectorModal({ post, open, onClose }: ImageInspectorModalProps) {
  const [showRaw, setShowRaw] = useState(false);

  if (!post) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Image Inspector</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">No post loaded.</p>
        </DialogContent>
      </Dialog>
    );
  }

  const blocks = extractBlocks(post);
  const { visual, image, composited } = blocks;
  const preview = resolvePreview(post, composited, image);
  const outcome = computeOutcome(post, blocks);

  const outcomeTone =
    outcome.tone === "ok"
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
      : outcome.tone === "warn"
      ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
      : outcome.tone === "error"
      ? "bg-destructive/10 text-destructive border-destructive/20"
      : "bg-muted text-muted-foreground border-border";

  const safeZoneCount = Array.isArray(visual?.safe_zone_config?.zones)
    ? (visual!.safe_zone_config!.zones as unknown[]).length
    : 0;
  const gradientOverlay =
    typeof visual?.safe_zone_config?.gradient_overlay === "boolean"
      ? visual.safe_zone_config.gradient_overlay
      : !!(visual?.safe_zone_config?.gradient_overlay as { enabled?: boolean } | undefined)?.enabled;
  const overrides = visual?.effective_inputs?.overridden_by_event ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Image Inspector</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Outcome summary banner */}
          <div className={cn("rounded-lg border px-4 py-3 flex items-center gap-2 text-sm", outcomeTone)}>
            {outcome.tone === "ok" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {outcome.tone === "warn" && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {outcome.tone === "error" && <XCircle className="h-4 w-4 shrink-0" />}
            {outcome.tone === "neutral" && <CircleSlash className="h-4 w-4 shrink-0" />}
            <span>{outcome.label}</span>
          </div>

          {/* Preview area */}
          <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
            <div className="relative aspect-square max-h-[420px] flex items-center justify-center bg-muted">
              {preview.url ? (
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-full w-full"
                  title="Open in new tab"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.url}
                    alt="Image preview"
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </a>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-8 w-8" aria-hidden />
                  <span className="text-xs">No image artifact available yet</span>
                </div>
              )}
            </div>
            {preview.origin && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground bg-background border-t border-border">
                Preview source:{" "}
                <span className="font-medium text-foreground">
                  {preview.origin === "post.image_url"
                    ? "Post.image_url (hosted)"
                    : preview.origin === "composited_image"
                    ? `composited_image.artifact_url${preview.isDataUri ? " (inline data URI)" : ""}`
                    : `image_generation.artifact_url${preview.isDataUri ? " (inline data URI)" : ""}`}
                </span>
              </p>
            )}
          </div>

          {/* A. Final Composite */}
          <SectionCard title="Final composite" status={composited?.status ?? (post.image_url ? "ok" : undefined)}>
            <MetaRow label="Post.image_url" value={<ExternalUrlLine url={post.image_url} />} />
            {composited && (
              <>
                <MetaRow label="Artifact URL" value={<ExternalUrlLine url={composited.artifact_url} />} />
                <MetaRow
                  label="Dimensions"
                  value={
                    composited.width && composited.height
                      ? `${composited.width} × ${composited.height} px`
                      : "—"
                  }
                />
                {composited.bucket && (
                  <MetaRow
                    label="GCS bucket"
                    value={
                      <span className="font-mono text-[11px]">
                        {composited.bucket}/{composited.object_path}
                      </span>
                    }
                  />
                )}
                <MetaRow
                  label="Background"
                  value={
                    composited.background_fallback
                      ? "Brand-color fallback (no AI artifact)"
                      : "AI-generated background"
                  }
                />
                <MetaRow label="Logo drawn" value={composited.logo_drawn ? "Yes" : "No"} />
                {typeof composited.byte_length === "number" && (
                  <MetaRow label="Size" value={fmtBytes(composited.byte_length)} />
                )}
                {composited.uploaded_at && (
                  <MetaRow label="Uploaded at" value={fmtIso(composited.uploaded_at)} />
                )}
                {composited.generated_at && (
                  <MetaRow label="Rendered at" value={fmtIso(composited.generated_at)} />
                )}
                {typeof composited.duration_ms === "number" && (
                  <MetaRow label="Render duration" value={`${composited.duration_ms} ms`} />
                )}
                {composited.render_version && (
                  <MetaRow label="Render version" value={composited.render_version} />
                )}
                {composited.error_code && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 mt-2 space-y-1">
                    <p className="text-xs font-medium text-destructive">
                      Render error: {composited.error_code}
                    </p>
                    {composited.error_message && (
                      <p className="text-[11px] text-destructive/80 break-words">
                        {composited.error_message}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {!composited && !post.image_url && (
              <p className="text-xs text-muted-foreground italic">
                No final composite has been produced for this draft.
              </p>
            )}
          </SectionCard>

          {/* B. Visual Direction */}
          {visual ? (
            <SectionCard title="Visual direction">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <MetaRow label="Layout" value={visual.layout_key} />
                <MetaRow label="Format" value={visual.platform_format} />
                <MetaRow label="Emphasis" value={visual.visual_emphasis} />
                <MetaRow label="Subject" value={visual.subject_focus} />
                <MetaRow label="Render intent" value={visual.render_intent} />
                <MetaRow
                  label="Safe zones"
                  value={`${safeZoneCount} zone${safeZoneCount === 1 ? "" : "s"}${
                    gradientOverlay ? " · gradient overlay" : ""
                  }`}
                />
                {visual.effective_inputs?.visual_style && (
                  <MetaRow label="Style" value={visual.effective_inputs.visual_style} />
                )}
                {visual.effective_inputs?.main_subject_type && (
                  <MetaRow label="Subject type" value={visual.effective_inputs.main_subject_type} />
                )}
              </div>
              {overrides.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Overridden by event:</span>
                  {overrides.map((k) => (
                    <Badge
                      key={k}
                      variant="outline"
                      className="text-[10px] bg-violet-500/10 text-violet-700 border-violet-500/20"
                    >
                      {k}
                    </Badge>
                  ))}
                </div>
              )}
            </SectionCard>
          ) : (
            <SectionCard title="Visual direction">
              <p className="text-xs text-muted-foreground italic">
                No compiled visual direction was persisted for this draft. (May predate the visual chain rollout on 2026-04-27.)
              </p>
            </SectionCard>
          )}

          {/* C. Background Generation */}
          <SectionCard title="Background generation" status={image?.status}>
            {image ? (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <MetaRow label="Provider" value={image.provider} />
                  <MetaRow label="Model" value={image.model} />
                  {image.width && image.height && (
                    <MetaRow label="Dimensions" value={`${image.width} × ${image.height} px`} />
                  )}
                  <MetaRow label="Asset id" value={image.provider_asset_id} />
                  {image.generated_at && (
                    <MetaRow label="Generated at" value={fmtIso(image.generated_at)} />
                  )}
                  {typeof image.duration_ms === "number" && (
                    <MetaRow label="Duration" value={`${image.duration_ms} ms`} />
                  )}
                  {image.render_version && (
                    <MetaRow label="Render version" value={image.render_version} />
                  )}
                </div>
                <MetaRow label="Artifact URL" value={<ExternalUrlLine url={image.artifact_url} />} />
                {image.skipped_reason && (
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 mt-2">
                    <p className="text-xs text-muted-foreground">
                      Skipped reason: <span className="text-foreground">{image.skipped_reason}</span>
                    </p>
                  </div>
                )}
                {image.error_code && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 mt-2 space-y-1">
                    <p className="text-xs font-medium text-destructive">
                      Provider error: {image.error_code}
                    </p>
                    {image.error_message && (
                      <p className="text-[11px] text-destructive/80 break-words">
                        {image.error_message}
                      </p>
                    )}
                  </div>
                )}
                {image.provider === "stub" && image.status === "ok" && !image.artifact_url && (
                  <p className="text-[11px] text-muted-foreground italic mt-1">
                    Stub provider returned a placeholder result with no real artifact. The overlay renderer falls back to a brand-color background in this mode.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No background-image provider was invoked for this draft.
              </p>
            )}
          </SectionCard>

          {/* D. Composited Image (separate from "Final composite" — emphasizes the renderer step) */}
          {composited && (
            <SectionCard title="Compositing details" status={composited.status}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <MetaRow label="Layout" value={composited.layout_key} />
                <MetaRow label="Format" value={composited.platform_format} />
                <MetaRow label="Emphasis" value={composited.visual_emphasis} />
                <MetaRow label="MIME" value={composited.mime_type} />
              </div>
            </SectionCard>
          )}

          {/* E. Raw JSON expander (secondary affordance per brief) */}
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {showRaw ? "Hide raw generation_context_json" : "Show raw generation_context_json"}
          </button>
          {showRaw && (
            <pre className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] font-mono overflow-x-auto max-h-[320px]">
              {JSON.stringify(post.generation_context_json ?? {}, null, 2)}
            </pre>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
