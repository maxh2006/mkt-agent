"use client";

import { useRef, useState } from "react";
import { Upload, Image as ImageIcon, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LogoUploadZoneProps {
  label: string;
  helperText: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}

const MIN_DIMENSION = 500;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/png";

interface FilePreview {
  dataUrl: string;
  width: number;
  height: number;
  sizeKB: number;
}

/**
 * Single-slot brand logo uploader.
 *
 * Intended UX: drag-and-drop OR click-to-select a PNG that is at least
 * 500x500 and no larger than 5 MB. On drop we validate fully on the client
 * (MIME + byte size + decoded width/height).
 *
 * Important MVP caveat: direct upload storage is NOT wired yet. The
 * preview shown below the zone is client-memory only (FileReader data URL)
 * and is NOT what persists. Operators must paste a publicly hosted URL
 * into the URL input under each zone — that URL is the stored value.
 * When upload storage lands (separate task), the URL input can be hidden
 * without any schema change.
 */
export function LogoUploadZone({
  label,
  helperText,
  value,
  onChange,
  disabled,
}: LogoUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.type !== ACCEPT) {
      setError("PNG only");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Max size is 5 MB");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Could not read file");
      return null;
    });
    if (!dataUrl) return;

    const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
    if (!dims) {
      setError("Could not decode image");
      return;
    }
    if (dims.w < MIN_DIMENSION || dims.h < MIN_DIMENSION) {
      setError(`Must be at least ${MIN_DIMENSION}×${MIN_DIMENSION} (got ${dims.w}×${dims.h})`);
      return;
    }

    setPreview({
      dataUrl,
      width: dims.w,
      height: dims.h,
      sizeKB: Math.round(file.size / 1024),
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    void handleFile(e.dataTransfer.files?.[0]);
  }

  function clearPreview() {
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const displayUrl = value?.trim() || null;

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{helperText}</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-muted/20 px-4 py-6 text-center transition-colors",
          !disabled && "cursor-pointer hover:bg-muted/40",
          dragOver && "border-primary bg-primary/5",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        {preview || displayUrl ? (
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview?.dataUrl ?? displayUrl ?? ""}
                alt={label}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="text-left text-xs leading-tight">
              {preview ? (
                <>
                  <p className="font-medium">
                    {preview.width}×{preview.height}
                    <span className="text-muted-foreground"> · {preview.sizeKB} KB</span>
                  </p>
                  <p className="text-muted-foreground">
                    Preview only — paste hosted URL below to persist.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Logo set</p>
                  <p className="text-muted-foreground truncate max-w-[240px]">{displayUrl}</p>
                </>
              )}
            </div>
            {preview && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clearPreview(); }}
                className="ml-auto text-muted-foreground hover:text-foreground"
                aria-label="Clear preview"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <>
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs font-medium">
              <span className="text-foreground">Click or drag PNG</span>
              <span className="text-muted-foreground"> · min 500×500 · max 5 MB</span>
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3" />
          <span>Direct upload storage is not yet wired — paste a hosted URL to persist.</span>
        </div>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://cdn.example.com/logo.png"
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
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

export { MIN_DIMENSION as LOGO_MIN_DIMENSION, MAX_BYTES as LOGO_MAX_BYTES };

// Convenience: the 4 slot definitions + helper copy exactly as specified.
export const LOGO_SLOTS: ReadonlyArray<{
  key: "main" | "square" | "horizontal" | "vertical";
  label: string;
  helper: string;
}> = [
  {
    key: "main",
    label: "Main Logo",
    helper: "Default logo for most creatives.",
  },
  {
    key: "square",
    label: "Square Logo",
    helper: "Best for compact or profile-style placements.",
  },
  {
    key: "horizontal",
    label: "Horizontal Logo",
    helper: "Best for wide banners and horizontal layouts.",
  },
  {
    key: "vertical",
    label: "Vertical Logo",
    helper: "Best for portrait and stacked layouts.",
  },
];

/**
 * Shared upload-constraints callout shown once at the top of the
 * Identity tab, so each individual zone's helper text stays short.
 */
export function LogoUploadConstraints() {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 flex items-start gap-2 text-xs text-muted-foreground">
      <Upload className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        <p className="text-foreground font-medium">Logo upload constraints</p>
        <p>PNG only · minimum 500×500 · max 5 MB · click or drag-and-drop.</p>
        <p>
          File storage isn&apos;t wired in this build — paste a publicly
          hosted URL below each zone to persist. Preview images are
          client-side only.
        </p>
      </div>
    </div>
  );
}
