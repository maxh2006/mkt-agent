"use client";

import { useRef, useState } from "react";
import { Plus, X, Image as ImageIcon, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BenchmarkAsset } from "@/lib/validations/brand";

interface BenchmarkAssetsProps {
  value: BenchmarkAsset[];
  onChange: (value: BenchmarkAsset[]) => void;
  disabled?: boolean;
  max?: number;
}

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Repeater for "benchmark" / reference brand images — mascots, existing
 * banner samples, recurring visual cues. Same MVP storage caveat as
 * LogoUploadZone: drag-drop + preview are client-side only. URL input
 * under each card is what actually persists.
 */
export function BenchmarkAssets({
  value,
  onChange,
  disabled,
  max = 20,
}: BenchmarkAssetsProps) {
  function addAsset() {
    onChange([
      ...value,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url: "",
        label: "",
        notes: "",
      },
    ]);
  }

  function updateAsset(id: string, patch: Partial<BenchmarkAsset>) {
    onChange(value.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeAsset(id: string) {
    onChange(value.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="text-foreground font-medium">Benchmark assets</p>
          <p>
            Upload existing banner samples for benchmarking. Include site
            elements, mascots, or recurring visual cues so the AI can match
            brand style in generated imagery.
          </p>
          <p>
            File storage isn&apos;t wired in this build — previews are
            client-side only. Paste a hosted URL to persist each asset.
          </p>
        </div>
      </div>

      {value.length === 0 && (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          No benchmark assets yet. Add one below.
        </p>
      )}

      {value.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          disabled={disabled}
          onPatch={(patch) => updateAsset(asset.id, patch)}
          onRemove={() => removeAsset(asset.id)}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addAsset}
        disabled={disabled || value.length >= max}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add benchmark asset
      </Button>
    </div>
  );
}

function AssetCard({
  asset,
  onPatch,
  onRemove,
  disabled,
}: {
  asset: BenchmarkAsset;
  onPatch: (patch: Partial<BenchmarkAsset>) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Image files only");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Max size is 5 MB");
      return;
    }
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!dataUrl) {
      setError("Could not read file");
      return;
    }
    setPreview(dataUrl);
  }

  const displayUrl = asset.url?.trim() || null;

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-start gap-3">
        <div
          onClick={() => !disabled && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!disabled) void handleFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed bg-muted/20",
            !disabled && "cursor-pointer hover:bg-muted/40",
          )}
        >
          {preview || displayUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview ?? displayUrl ?? ""}
              alt={asset.label ?? "Benchmark asset"}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={asset.label ?? ""}
              onChange={(e) => onPatch({ label: e.target.value })}
              placeholder="Label (e.g. Mascot, Homepage banner)"
              disabled={disabled}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove asset"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            type="url"
            value={asset.url}
            onChange={(e) => onPatch({ url: e.target.value })}
            placeholder="https://cdn.example.com/benchmark.png"
            disabled={disabled}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
          />
        </div>
      </div>
      <input
        type="text"
        value={asset.notes ?? ""}
        onChange={(e) => onPatch({ notes: e.target.value })}
        placeholder="Notes — what to mimic, what to avoid"
        disabled={disabled}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          if (e.target) e.target.value = "";
        }}
        disabled={disabled}
      />
    </div>
  );
}
