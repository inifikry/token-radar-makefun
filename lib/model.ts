// Token Radar, radar-2: the model behind the board.
//
// One idea, stated once: a protocol with no token yet is worth a share of the
// value it already holds, and that share grows with momentum, with the time it
// has run without issuing, and with the number of chains it runs on. Nothing
// here names a protocol: every number below comes from the snapshot's own
// fields, so the same code ranks any sealed snapshot the same way.
//
//   implied = round(TVL x 0.30
//                   x (1 + clamp(change_7d, -60, 120) / 100 x 0.6)
//                   x (0.5 + min(age_days, 1460) / 1460 x 0.5)
//                   x (1 + 0.02 x min(chains - 1, 5)))
//
// The board is the snapshot's 40-protocol watchlist plus the 138 largest
// pre-token protocols below the $50M floor that are not a wrapped, staked or
// bridged product of a token that already trades. A further 24 protocols whose
// token already trades are set aside, with their real market cap, for the
// dashboard's Live token tab: they are shown for contrast and never ranked.
//
// A farm plan is seven steps per row, each naming what it costs and how long
// it takes. The two working steps come from the protocol's category, the gas
// from its first chain, the capital from its TVL tier and the hold from its age.

/** One protocol as the sealed snapshot records it. Ten fields, no more. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot: every protocol at or above $5M of TVL, one object each. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** One row of the ranked board, exactly as board.json holds it. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** A board row with the model's own inputs, for the dashboard's detail view. */
export interface RadarRow extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  growth_pct: number;
  growth_mult: number;
  age_mult: number;
  chain_mult: number;
  watchlisted: boolean;
  farm_capital: string;
  farm_gas: string;
  farm_hold_days: number;
}

/** A protocol whose token already trades, shown with its real market cap. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

/** Everything the dashboard needs, carried to it as data.js. */
export interface Radar {
  as_of: string;
  floor_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
  watchlist_size: number;
  early_size: number;
  live_size: number;
  total_protocols: number;
  pre_token_count: number;
}

/** The share of TVL a launch is worth before the multipliers. */
const BASE_RATE = 0.3;
/** A protocol with no listing date gets 180 days of age, never a free middle. */
const UNKNOWN_AGE_DAYS = 180;
/** Age stops mattering after four years on the board. */
const MAX_AGE_DAYS = 1460;
/** How many early rows join the watchlist on the board. */
const EARLY_ROWS = 138;
/** How many live-token protocols the dashboard shows for contrast. */
const LIVE_ROWS = 24;

/** Categories that are a wrapped, staked or bridged product, never a launch. */
const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A name ending in a version marker: a space, then V2, v2, 2.0 or the like. */
const VERSION_SUFFIX = /\s([Vv]\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a wrapped or staked product of a traded token. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Chains the model prices as layer-2 gas. Everything else pays the default. */
const LAYER2_CHAINS = new Set([
  'Arbitrum',
  'Optimism',
  'Base',
  'Linea',
  'Blast',
  'Scroll',
  'zkSync Era',
  'Mode',
  'Manta',
  'Starknet',
  'Taiko',
  'Zora',
  'World Chain',
  'Unichain',
  'Abstract',
  'Berachain',
  'Soneium',
  'Ink',
  'Katana',
  'Corn',
  'Arc',
  'Plasma',
]);

/** Parse the sealed snapshot's text into the shape the model reads. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('token radar: the snapshot holds no protocols array or watchlist');
  }
  const protocols = (raw.protocols as Record<string, unknown>[]).map((p) => {
    const tvl = Number(p.tvl_usd);
    if (!Number.isFinite(tvl) || tvl < 0) {
      throw new Error(`token radar: the snapshot carries a bad TVL for ${String(p.slug)}`);
    }
    if (String(p.slug).length === 0 || String(p.name).length === 0) {
      throw new Error('token radar: the snapshot carries a protocol with no slug or name');
    }
    return {
      slug: String(p.slug),
      name: String(p.name),
      category: p.category === null || p.category === undefined ? null : String(p.category),
      chains: Array.isArray(p.chains) ? (p.chains as unknown[]).map((c) => String(c)) : [],
      tvl_usd: tvl,
      change_7d: p.change_7d === null || p.change_7d === undefined ? null : Number(p.change_7d),
      mcap_usd: p.mcap_usd === null || p.mcap_usd === undefined ? null : Number(p.mcap_usd),
      listed_at: p.listed_at === null || p.listed_at === undefined ? null : String(p.listed_at),
      gecko_id: p.gecko_id === null || p.gecko_id === undefined ? null : String(p.gecko_id),
      symbol: p.symbol === null || p.symbol === undefined ? null : String(p.symbol),
    };
  });
  return {
    as_of: String(raw.as_of),
    source: String(raw.source),
    floor_usd: Number(raw.floor_usd),
    protocols,
    watchlist: (raw.watchlist as unknown[]).map((w) => String(w)),
  };
}

/** Whole days between two UTC dates, never below zero. */
function daysBetween(asOf: string, listedAt: string): number {
  const span = Date.parse(asOf) - Date.parse(listedAt);
  return Math.max(0, Math.floor(span / 86_400_000));
}

/** How long a protocol has run: its listing age, or 180 days when unknown. */
export function ageDays(p: Protocol, asOf: string): number {
  return p.listed_at === null ? UNKNOWN_AGE_DAYS : daysBetween(asOf, p.listed_at);
}

/** Seven-day growth in per cent, clamped to the model's window, 0 when unreported. */
export function clampedGrowth(p: Protocol): number {
  const growth = p.change_7d === null ? 0 : p.change_7d;
  return Math.max(-60, Math.min(120, growth));
}

/** The growth multiplier: momentum is worth up to 60% of itself, never more. */
export function growthMultiplier(p: Protocol): number {
  return 1 + (clampedGrowth(p) / 100) * 0.6;
}

/** The age multiplier: half the weight at listing, the full weight at four years. */
export function ageMultiplier(p: Protocol, asOf: string): number {
  return 0.5 + (Math.min(ageDays(p, asOf), MAX_AGE_DAYS) / MAX_AGE_DAYS) * 0.5;
}

/** The chain multiplier: 2% per extra chain, capped at five extras. */
export function chainMultiplier(p: Protocol): number {
  return 1 + 0.02 * Math.min(Math.max(p.chains.length - 1, 0), 5);
}

/** The model's claim for one protocol, in whole dollars. */
export function impliedValue(p: Protocol, asOf: string): number {
  return Math.round(
    p.tvl_usd * BASE_RATE * growthMultiplier(p) * ageMultiplier(p, asOf) * chainMultiplier(p),
  );
}

/** The seven-day growth rounded to two decimals, for the detail view. */
export function growthPct(p: Protocol): number {
  return Math.round((p.change_7d === null ? 0 : p.change_7d) * 100) / 100;
}

/** A protocol records no token when both of DefiLlama's token fields are null. */
export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** True when the name ends in a version marker such as V2 or 2.0. */
function isVersioned(name: string): boolean {
  return VERSION_SUFFIX.test(name);
}

/** True when the name carries a whole wrapped, staked or staking word. */
function hasWrappedWord(name: string): boolean {
  return WRAPPED_WORD.test(name);
}

/**
 * An early-radar protocol: pre-token, below the floor, and not a wrapped,
 * staked or bridged product of a token that already trades. The watchlist's
 * own rule, applied to the protocols the list leaves out.
 */
export function isRankableEarly(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (isVersioned(p.name)) return false;
  if (hasWrappedWord(p.name)) return false;
  return true;
}

/** The early radar: the largest rankable protocols below the floor. */
function selectEarly(snapshot: Snapshot): Protocol[] {
  const watchlisted = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(
    (p) => !watchlisted.has(p.slug) && isRankableEarly(p) && p.tvl_usd < snapshot.floor_usd,
  );
  candidates.sort((a, b) => {
    if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
    const growthA = a.change_7d === null ? 0 : a.change_7d;
    const growthB = b.change_7d === null ? 0 : b.change_7d;
    if (growthB !== growthA) return growthB - growthA;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  return candidates.slice(0, EARLY_ROWS);
}

/** The gas a single transaction costs on a chain, as the plan quotes it. */
export function gasFor(chain: string): string {
  if (chain === 'Ethereum') return '$6 to $12';
  if (chain === 'Solana') return '$0.05';
  if (chain === 'Binance' || chain === 'Polygon') return '$0.50';
  if (LAYER2_CHAINS.has(chain)) return '$0.30';
  return '$1 to $3';
}

/** The capital a farm starts with, by the protocol's TVL tier. */
export function capitalFor(tvlUsd: number): string {
  if (tvlUsd >= 1_000_000_000) return '$250';
  if (tvlUsd >= 100_000_000) return '$200';
  if (tvlUsd >= 50_000_000) return '$150';
  if (tvlUsd >= 10_000_000) return '$100';
  return '$50';
}

/** How long a farm holds, by the protocol's age: 30, 45 or 60 days. */
export function holdDays(age: number): number {
  if (age >= 730) return 60;
  if (age >= 365) return 45;
  return 30;
}

/** The two working actions and the short verb for the weekly repeat, by category. */
function actionsFor(category: string | null): [string, string, string] {
  switch (category) {
    case 'Lending':
      return ['supply it as collateral', 'borrow 30% of the supplied value', 'supply'];
    case 'Dexs':
      return ['add it to a liquidity pool', 'swap a small amount through the pool', 'pool deposit'];
    case 'Risk Curators':
      return ['place it in a curated vault', 'move a third of it to a second vault', 'vault deposit'];
    case 'Yield':
    case 'Yield Aggregator':
      return ['place it in the top vault', 'claim the yield and restake it', 'vault deposit'];
    case 'Derivatives':
      return ['open a small hedged position', 'close half after the first funding cycle', 'hedged position'];
    case 'RWA':
      return ['mint the tokenised asset', 'redeem a third after the lock window', 'mint'];
    case 'CDP':
      return ['lock it and mint the stablecoin', 'repay a third of the minted debt', 'lock-up'];
    case 'Restaking':
      return ['restake it through the protocol', 'delegate a third to a second operator', 'restake'];
    case 'Launchpad':
      return ['stake it to qualify for launches', 'claim the allocation at launch', 'stake'];
    default:
      return ['deposit it in the protocol', 'top it up by a third', 'deposit'];
  }
}

/**
 * Seven concrete steps to farm one protocol. Every step names a cost and a
 * duration: the capital and gas come from the protocol's own TVL and chain,
 * the hold from its age, and the two working steps from its category.
 */
export function farmSteps(p: Protocol, asOf: string): string[] {
  const [first, second, repeat] = actionsFor(p.category);
  const chain = p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
  const gas = gasFor(chain);
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDays(ageDays(p, asOf));
  const topUp = capital === '$50' || capital === '$100' ? '$25' : '$50';
  return [
    `Deposit ${capital} of USDC into ${p.name} on ${chain} to ${first}, for about ${gas} gas, then check it shows within 10 minutes.`,
    `Use the same deposit to ${second} on ${chain} within 24 hours, spending about ${gas} in gas, and keep exposure at ${capital} for ${hold} days.`,
    `Repeat the ${repeat} once a week for ${hold} days, adding ${topUp} of USDC each time at about ${gas} in gas, so the log shows steady activity.`,
    `Finish the protocol's on-chain quests on ${chain} every week for ${hold} days, budgeting about ${gas} per quest and keeping ${capital} deployed throughout.`,
    `Leave the position alone for ${hold} days after the last top-up, checking it once a week; the only cost left is about ${gas} for the final withdrawal.`,
    `Spend 30 minutes a week for ${hold} days reading the docs and community updates, note any snapshot dates, and keep the ${capital} working the whole time.`,
    `After ${hold} days, withdraw the ${capital} plus any yield from ${p.name} on ${chain}, for about ${gas} gas, and keep receipts for 90 days for any claim.`,
  ];
}

/** The live-token contrast: the largest traded-token protocols by market cap. */
function selectLive(snapshot: Snapshot): LiveRow[] {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null);
  live.sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number));
  return live.slice(0, LIVE_ROWS).map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd as number,
    change_7d: p.change_7d,
  }));
}

/**
 * Score the snapshot into the ranked board and the radar the dashboard reads.
 * The watchlist and the early radar are scored together, then ordered by
 * implied value, highest first; ties break on TVL, then on slug, so the
 * order is the same on every run.
 */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const watchlisted = new Set(snapshot.watchlist);
  const early = selectEarly(snapshot);
  const scored = [
    ...snapshot.protocols.filter((p) => watchlisted.has(p.slug)),
    ...early,
  ].map((p) => ({ protocol: p, value: impliedValue(p, snapshot.as_of) }));
  scored.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    if (b.protocol.tvl_usd !== a.protocol.tvl_usd) return b.protocol.tvl_usd - a.protocol.tvl_usd;
    return a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0;
  });
  const rows: RadarRow[] = scored.map((entry, index) => {
    const p = entry.protocol;
    const age = ageDays(p, snapshot.as_of);
    return {
      slug: p.slug,
      name: p.name,
      rank: index + 1,
      implied_value_usd: entry.value,
      farm_steps: farmSteps(p, snapshot.as_of),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      growth_pct: growthPct(p),
      growth_mult: growthMultiplier(p),
      age_mult: ageMultiplier(p, snapshot.as_of),
      chain_mult: chainMultiplier(p),
      watchlisted: watchlisted.has(p.slug),
      farm_capital: capitalFor(p.tvl_usd),
      farm_gas: gasFor(p.chains.length > 0 ? p.chains[0]! : 'Ethereum'),
      farm_hold_days: holdDays(age),
    };
  });
  const live = selectLive(snapshot);
  const radar: Radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    rows,
    live,
    watchlist_size: snapshot.watchlist.length,
    early_size: early.length,
    live_size: live.length,
    total_protocols: snapshot.protocols.length,
    pre_token_count: snapshot.protocols.filter(isPreToken).length,
  };
  const board: BoardRow[] = rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    rank: row.rank,
    implied_value_usd: row.implied_value_usd,
    farm_steps: row.farm_steps,
  }));
  return { board, radar };
}

/**
 * The gate's own shape, checked before anything is written: ranks 1 to N
 * once each, implied values never rising with rank and never repeated, every
 * watchlist slug covered, and every farm plan 3 to 12 steps of 20 to 600
 * characters. The first problem found, or null when the board is sound.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows, the gate needs at least 100`;
  const seenSlugs = new Set<string>();
  const seenRanks = new Set<number>();
  const seenValues = new Set<number>();
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  let previous = Number.POSITIVE_INFINITY;
  for (const row of board) {
    if (!known.has(row.slug)) return `row ${row.slug} is not one of the snapshot's protocols`;
    if (seenSlugs.has(row.slug)) return `row ${row.slug} appears twice`;
    seenSlugs.add(row.slug);
    if (!Number.isInteger(row.rank) || row.rank < 1 || row.rank > board.length) {
      return `row ${row.slug} carries rank ${row.rank}, outside 1 to ${board.length}`;
    }
    if (seenRanks.has(row.rank)) return `rank ${row.rank} appears twice`;
    seenRanks.add(row.rank);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} carries implied value ${row.implied_value_usd}`;
    }
    if (row.implied_value_usd > previous) return `implied value rises at rank ${row.rank}`;
    if (seenValues.has(row.implied_value_usd)) return `implied value ${row.implied_value_usd} repeats`;
    seenValues.add(row.implied_value_usd);
    previous = row.implied_value_usd;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} carries ${row.farm_steps.length} farm steps, the gate needs 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `row ${row.slug} carries a farm step of ${trimmed.length} characters, outside 20 to 600`;
      }
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seenSlugs.has(slug)) return `the watchlist slug ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data file: one global the page reads, no network involved. */
export function dataScript(radar: Radar): string {
  return `window.TOKEN_RADAR = ${JSON.stringify(radar)};\n`;
}
