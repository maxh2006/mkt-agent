// Source normalizers turn per-source raw facts into NormalizedGenerationInput.
// One module per source_type keeps branch logic out of the prompt builder
// and orchestrator — they only ever see the normalized shape.
//
// Live-source adapters (BigQuery / Promotions API, not in this phase)
// will produce the same per-source `*Facts` inputs these normalizers take,
// so the fixtures in ../fixtures/ can be swapped one-for-one later.

export { normalizeBigWin } from "./big-win";
export { normalizePromo } from "./promo";
export { normalizeHotGames } from "./hot-games";
export { normalizeEvent } from "./event";
export { normalizeEducational } from "./educational";
export { defaultSampleCount } from "./defaults";
