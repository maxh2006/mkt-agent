import type { EducationalFacts } from "../types";

/**
 * Mock educational content packet. The structured shape (topic + angle +
 * key_point + cta_goal) is what the live educational-cadence layer will
 * emit once it lands in a later phase.
 */
export function educationalFixture(overrides?: Partial<EducationalFacts>): EducationalFacts {
  return {
    kind: "educational",
    topic: "Responsible gaming — set a budget before you play",
    angle:
      "Reassuring and practical, not preachy. Frame budgeting as part of enjoying the game.",
    key_point:
      "Decide a fixed play budget before you start. Treat it like the cost of a night out — if it's gone, you stop.",
    cta_goal: "Invite the player to set a deposit limit in their account settings.",
    ...overrides,
  };
}
