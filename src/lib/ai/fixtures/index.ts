// Mock source fixtures for AI generation development.
//
// These exist so the generation pipeline (normalizer → prompt → client →
// queue insert) can be exercised end-to-end without live BigQuery or
// Promotions API integrations. Live-source adapters will produce the
// same per-source *Facts shapes these fixtures return, so swapping in
// real data is a one-call change in the orchestrator.

export { bigWinFixture } from "./big-win";
export { promoFixture } from "./promo";
export { hotGamesFixture } from "./hot-games";
export { educationalFixture } from "./educational";
