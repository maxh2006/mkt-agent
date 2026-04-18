"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Info } from "lucide-react";
import { postsApi, type Post, type EventBriefContext } from "@/lib/posts-api";

interface EditPostModalProps {
  post: Post | null;
  open: boolean;
  onClose: () => void;
}

interface ContentSection {
  label: string;
  value: string;
}

function buildContentSections(post: Post): ContentSection[] {
  const sections: ContentSection[] = [];
  if (post.headline)    sections.push({ label: "Headline",    value: post.headline });
  if (post.caption)     sections.push({ label: "Caption",     value: post.caption });
  if (post.cta)         sections.push({ label: "CTA",         value: post.cta });
  if (post.banner_text) sections.push({ label: "Banner Text", value: post.banner_text });
  if (post.image_prompt)sections.push({ label: "Image Prompt",value: post.image_prompt });
  return sections;
}

export function EditPostModal({ post, open, onClose }: EditPostModalProps) {
  const [instruction, setInstruction] = useState("");
  const [applied, setApplied] = useState(false);
  const [eventContext, setEventContext] = useState<EventBriefContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const isEventDerived = post?.source_type === "event" && !!post?.source_id;

  useEffect(() => {
    if (open && isEventDerived && post) {
      setLoadingContext(true);
      postsApi.getEventContext(post.id)
        .then((ctx) => setEventContext(ctx))
        .catch(() => setEventContext(null))
        .finally(() => setLoadingContext(false));
    } else {
      setEventContext(null);
    }
  }, [open, isEventDerived, post?.id]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setInstruction("");
      setApplied(false);
      setEventContext(null);
      onClose();
    }
  }

  function handleApply() {
    setApplied(true);
  }

  if (!post) return null;

  const sections = buildContentSections(post);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event context banner */}
          {isEventDerived && (
            <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2.5 space-y-1">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  {loadingContext ? (
                    <span className="text-muted-foreground">Loading event context…</span>
                  ) : eventContext ? (
                    <>
                      <p className="font-medium text-blue-900">
                        Generated from event: {eventContext.event_title}
                      </p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        Refinement will use the original event brief and posting schedule.
                      </p>
                    </>
                  ) : (
                    <p className="text-blue-800">This post was generated from an event.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Current content preview */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Current Content
            </p>
            <div className="space-y-2 rounded-lg border bg-muted/30 px-4 py-3">
              {sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">(no content)</p>
              ) : (
                sections.map(({ label, value }) => (
                  <div key={label}>
                    <span className="text-xs font-medium text-muted-foreground">
                      {label}:{" "}
                    </span>
                    <span className="text-sm">{value}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Instruction input */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Edit Instruction
            </label>
            <textarea
              value={instruction}
              onChange={(e) => {
                setInstruction(e.target.value);
                setApplied(false);
              }}
              placeholder="e.g. Make the tone more exciting, add urgency to the CTA, shorten the caption to 2 lines..."
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {isEventDerived && (
              <p className="mt-1 text-xs text-muted-foreground">
                Event rules and posting schedule cannot be changed here. Edit the source event to modify those settings.
              </p>
            )}
          </div>

          {/* Placeholder feedback after applying */}
          {applied && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              AI editing is not yet available. Your instruction has been noted and will be
              applied when the AI generation step is implemented.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={handleApply}
            disabled={!instruction.trim() || applied}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Apply Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
