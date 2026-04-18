import { db } from "@/lib/db";
import { parsePostingInstance, formatPostingInstance } from "@/lib/posting-instance";

export interface EventBriefContext {
  event_id: string;
  event_title: string;
  theme: string | null;
  objective: string | null;
  rules: string | null;
  reward: string | null;
  target_audience: string | null;
  cta: string | null;
  tone: string | null;
  platform_scope: string[] | null;
  notes_for_ai: string | null;
  posting_instance_summary: string | null;
  occurrence_datetime: string | null;
}

export async function resolveEventBriefContext(
  sourceType: string | null,
  sourceId: string | null,
  sourceInstanceKey?: string | null,
): Promise<EventBriefContext | null> {
  if (sourceType !== "event" || !sourceId) return null;

  const event = await db.event.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      title: true,
      theme: true,
      objective: true,
      rules: true,
      reward: true,
      target_audience: true,
      cta: true,
      tone: true,
      platform_scope: true,
      notes_for_ai: true,
      posting_instance_json: true,
    },
  });

  if (!event) return null;

  const piConfig = parsePostingInstance(event.posting_instance_json);

  return {
    event_id: event.id,
    event_title: event.title,
    theme: event.theme,
    objective: event.objective,
    rules: event.rules,
    reward: event.reward,
    target_audience: event.target_audience,
    cta: event.cta,
    tone: event.tone,
    platform_scope: Array.isArray(event.platform_scope) ? (event.platform_scope as string[]) : null,
    notes_for_ai: event.notes_for_ai,
    posting_instance_summary: piConfig ? formatPostingInstance(piConfig) : null,
    occurrence_datetime: sourceInstanceKey ?? null,
  };
}
