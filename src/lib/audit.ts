import { db } from "@/lib/db";

interface WriteAuditLogParams {
  brand_id?: string | null; // null/omit for system-level events (e.g. login)
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before?: object | null;
  after?: object | null;
}

/**
 * Write an entry to the audit log. Fire-and-forget safe — errors are logged
 * but never thrown, so they never block the calling operation.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        brand_id: params.brand_id ?? null,
        user_id: params.user_id,
        action: params.action,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        before_json: params.before ?? undefined,
        after_json: params.after ?? undefined,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}

// ─── Typed action constants ───────────────────────────────────────────────────

export const AuditAction = {
  // Auth
  LOGIN: "login",
  LOGOUT: "logout",

  // Posts
  POST_CREATED: "post.created",
  POST_UPDATED: "post.updated",
  POST_APPROVED: "post.approved",
  POST_REJECTED: "post.rejected",
  POST_SCHEDULED: "post.scheduled",
  POST_PUBLISHED: "post.published",

  // Channels
  CHANNEL_CREATED: "channel.created",
  CHANNEL_UPDATED: "channel.updated",
  CHANNEL_STATUS_CHANGED: "channel.status_changed",

  // Automations
  AUTOMATION_CREATED: "automation.created",
  AUTOMATION_UPDATED: "automation.updated",
  AUTOMATION_VALUE_DISPLAY_CHANGED: "automation.value_display_changed",

  // Events
  EVENT_CREATED: "event.created",
  EVENT_UPDATED: "event.updated",
  EVENT_STATUS_CHANGED: "event.status_changed",

  // Users / roles
  ROLE_CHANGED: "role.changed",
  USER_DEACTIVATED: "user.deactivated",

  // Templates
  TEMPLATE_CREATED: "template.created",
  TEMPLATE_UPDATED: "template.updated",
  TEMPLATE_TOGGLED: "template.toggled", // active → inactive or vice versa

  // Brand management
  BRAND_CREATED: "brand.created",
  BRAND_UPDATED: "brand.updated",
  BRAND_ACTIVATED: "brand.activated",     // active toggled on
  BRAND_DEACTIVATED: "brand.deactivated", // active toggled off
  BRAND_INTEGRATION_CHANGED: "brand.integration_changed",

  // Legacy — kept so existing audit log entries remain readable
  BRAND_SETTINGS_UPDATED: "brand_settings.updated",
  CHANNEL_CONNECTED: "channel.connected",
  CHANNEL_DISCONNECTED: "channel.disconnected",
  AUTOMATION_RULE_CHANGED: "automation_rule.changed",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
