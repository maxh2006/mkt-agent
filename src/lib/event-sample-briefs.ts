export interface EventSampleBrief {
  title: string;
  theme: string;
  objective: string;
  rules: string;
  reward: string;
  target_audience: string;
  cta: string;
  tone: string;
  notes_for_ai: string;
}

export const SAMPLE_EVENT_BRIEFS: readonly EventSampleBrief[] = [
  {
    title: "Top Fans VIP Week",
    theme: "VIP Loyalty Appreciation",
    objective: "Reward the most active VIP players and strengthen retention during a slower mid-month stretch.",
    rules: "Open to VIP level 5 and above. Top 10 players by total wagered bets from Mon 00:00 to Sun 23:59 win. Self-exclusion and bonus abuse flags disqualify automatically.",
    reward: "1st place ₱50,000 cash · 2nd–3rd ₱20,000 each · 4th–10th ₱5,000 each",
    target_audience: "VIP level 5+ players with at least one deposit in the last 30 days",
    cta: "Play now to climb the leaderboard",
    tone: "Exclusive, high-energy, premium",
    notes_for_ai: "Use leaderboard language. Emphasize exclusivity, not just the prize amount. Avoid hard-sell deposit wording — they are already VIPs.",
  },
  {
    title: "Summer Deposit Boost",
    theme: "Summer Seasonal Deposit Boost",
    objective: "Drive deposit volume over a 10-day summer window and reactivate recent-but-quiet players.",
    rules: "Single deposit of ₱1,000 or more during the promo window qualifies for a 50% bonus up to ₱5,000. One bonus per player. 20x wagering on slots only.",
    reward: "50% deposit bonus up to ₱5,000",
    target_audience: "Active + lightly-lapsed players who deposited at least once in the last 60 days",
    cta: "Deposit now and double your play",
    tone: "Bright, summery, urgent without being pushy",
    notes_for_ai: "Lean on summer imagery. Keep wagering terms visible but not the headline. Mention one-per-player to pre-empt repeat-deposit questions.",
  },
  {
    title: "Slot Tournament Showdown",
    theme: "Weekly Slot Tournament",
    objective: "Build weekend engagement on slot games and showcase three featured game providers.",
    rules: "Qualify by playing any featured slot between Fri 18:00 and Sun 23:59. Leaderboard ranks by highest single-spin multiplier. Minimum bet ₱20 per spin to qualify.",
    reward: "₱100,000 prize pool split among top 20 — 1st ₱30k, 2nd ₱15k, 3rd ₱10k, 4th–10th ₱3k, 11th–20th ₱2k",
    target_audience: "Slot-focused players active in the last 14 days",
    cta: "Join the leaderboard — biggest multiplier wins",
    tone: "Competitive, thrilling, fast-paced",
    notes_for_ai: "Use tournament framing. Call out the three featured providers by name if available. Keep minimum bet visible to set expectations.",
  },
  {
    title: "Lunar New Year Freeroll",
    theme: "Lunar New Year Celebration",
    objective: "Acquire new registrations and drive first-deposit conversion during the Lunar New Year holiday week.",
    rules: "New accounts registered during the holiday week are auto-entered. No deposit required for the freeroll. Top 50 entries on the holiday slot get a prize. One account per person.",
    reward: "Freeroll prize pool ₱200,000 — top 50 finishers. Additional ₱500 bonus on first deposit of ₱500+.",
    target_audience: "New sign-ups during the holiday week + unregistered visitors landing from seasonal campaigns",
    cta: "Sign up free and play for the prize pool",
    tone: "Festive, celebratory, welcoming",
    notes_for_ai: "Use red/gold cultural cues tastefully without stereotyping. Mention both the freeroll and the bonus on first deposit as a two-step hook.",
  },
  {
    title: "Welcome Back Reactivation",
    theme: "Lapsed Player Reactivation",
    objective: "Win back players who have not logged in for 30–90 days by offering a no-strings reactivation bonus.",
    rules: "Eligible accounts with zero activity between 30 and 90 days receive a one-click claim. Bonus credited immediately on claim. 10x wagering across any game.",
    reward: "₱300 no-deposit reactivation bonus + 50 free spins on the game of the month",
    target_audience: "Players inactive for 30–90 days (excluding self-excluded and fraud-flagged accounts)",
    cta: "Claim your ₱300 — we miss you",
    tone: "Warm, personal, low-pressure",
    notes_for_ai: "Avoid deposit asks in the primary message. Lead with the no-deposit bonus. Personal tone works better than a generic promo voice for this segment.",
  },
  {
    title: "New Game Launch Hype",
    theme: "Provider Spotlight + New Release",
    objective: "Introduce a newly-launched slot from a premium provider and drive first-play conversion.",
    rules: "Play the spotlight game during launch week. Highest win multiplier among all qualifying spins earns the top prize. Minimum bet ₱10 per spin. One claim per account.",
    reward: "Top multiplier wins ₱25,000 cash. Top 100 players get ₱500 in free play.",
    target_audience: "Slot players active in the last 30 days + followers of the spotlight provider",
    cta: "Try the new drop — first 100 players win",
    tone: "Hype, fresh, exploratory",
    notes_for_ai: "Treat like a product launch, not a promo. Game name, provider name, and visual should dominate the creative. Keep wagering rules secondary.",
  },
];

export interface PickResult {
  index: number;
  brief: EventSampleBrief;
}

export function pickRandomSample(excludeIndex?: number): PickResult {
  if (SAMPLE_EVENT_BRIEFS.length === 0) {
    throw new Error("No sample briefs available");
  }
  if (SAMPLE_EVENT_BRIEFS.length === 1) {
    return { index: 0, brief: SAMPLE_EVENT_BRIEFS[0] };
  }
  let idx = Math.floor(Math.random() * SAMPLE_EVENT_BRIEFS.length);
  if (excludeIndex !== undefined && idx === excludeIndex) {
    idx = (idx + 1) % SAMPLE_EVENT_BRIEFS.length;
  }
  return { index: idx, brief: SAMPLE_EVENT_BRIEFS[idx] };
}
