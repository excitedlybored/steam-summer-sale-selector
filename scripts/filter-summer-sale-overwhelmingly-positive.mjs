import fs from 'node:fs/promises';
import path from 'node:path';

const INPUT_PATH = path.resolve('steam_summer_sale_games.json');
const REVIEW_TIER = process.env.REVIEW_TIER || 'Overwhelmingly Positive';
const REVIEW_TIER_SLUG = REVIEW_TIER.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const SNAPSHOT_PATH = path.resolve(`.steam_summer_sale_${REVIEW_TIER_SLUG}.snapshot.json`);
const OUTPUT_JSON_PATH = path.resolve(`steam_summer_sale_games_${REVIEW_TIER_SLUG}.json`);
const OUTPUT_CSV_PATH = path.resolve(`steam_summer_sale_games_${REVIEW_TIER_SLUG}.csv`);
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 250);
const RETRY_LIMIT = Number(process.env.RETRY_LIMIT || 6);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS || 5000);
const SAVE_EVERY = Number(process.env.SAVE_EVERY || 25);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function extractAppId(item) {
  if (item.appid) return String(item.appid);
  const match = String(item.url || '').match(/\/app\/(\d+)/);
  return match?.[1] || null;
}

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function saveSnapshot(snapshot) {
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
}

async function fetchReviewSummary(appid) {
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
    const response = await fetch(
      `https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`,
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 (compatible; steam-review-filter/0.1)',
        },
      },
    );

    if (response.status === 429 || response.status === 403) {
      await sleep(RETRY_BASE_MS * (attempt + 1));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Review request failed for appid=${appid}: ${response.status}`);
    }

    const payload = await response.json();
    return payload.query_summary || null;
  }

  throw new Error(`Steam kept blocking review request for appid=${appid}`);
}

function buildReviewFields(summary) {
  if (!summary) {
    return {
      steam_review_desc: null,
      steam_review_count: null,
      steam_review_percent: null,
      review_tier: null,
    };
  }

  return {
    steam_review_desc: summary.review_score_desc || null,
    steam_review_count: summary.total_reviews ?? null,
    steam_review_percent: summary.total_positive && summary.total_reviews
      ? Math.round((summary.total_positive / summary.total_reviews) * 100)
      : null,
    review_tier: summary.review_score_desc || null,
  };
}

function toCsv(items) {
  const headers = [
    'title',
    'url',
    'appid',
    'item_type',
    'item_id',
    'price_currency',
    'original_price',
    'current_price',
    'discount_percent',
    'original_price_sgd',
    'current_price_sgd',
    'release_date_text',
    'rating_label',
    'rating_percent',
    'rating_count',
    'review_tier',
    'steam_review_percent',
    'steam_review_count',
    'steam_review_desc',
  ];

  const rows = items.map((item) => headers.map((header) => escapeCsv(item[header])).join(','));
  return [headers.join(','), ...rows].join('\n') + '\n';
}

function normalizeOutputItem(item) {
  return {
    ...item,
    price_currency: 'SGD',
    original_price: item.original_price_sgd ?? null,
    current_price: item.current_price_sgd ?? null,
    rating_label: item.review_tier ?? item.steam_review_desc ?? null,
    rating_percent: item.steam_review_percent ?? null,
    rating_count: item.steam_review_count ?? null,
  };
}

const inputPayload = await loadJson(INPUT_PATH, null);
if (!inputPayload) {
  throw new Error(`Missing input file: ${INPUT_PATH}`);
}

const sourceItems = Array.isArray(inputPayload) ? inputPayload : (inputPayload.items || []);
const snapshot = await loadJson(SNAPSHOT_PATH, {
  source_item_count: sourceItems.length,
  processed: {},
  last_index: -1,
  processed_count: 0,
});

let completedSinceSave = 0;

async function processItem(item, index) {
  const existing = snapshot.processed[index];
  if (existing) return;

  const appid = extractAppId(item);
  let reviewFields = {
    steam_review_desc: null,
    steam_review_count: null,
    steam_review_percent: null,
    review_tier: null,
  };

  if (appid) {
    const summary = await fetchReviewSummary(appid);
    reviewFields = buildReviewFields(summary);
  }

  snapshot.processed[index] = {
    ...item,
    appid,
    ...reviewFields,
  };
  snapshot.last_index = Math.max(snapshot.last_index, index);
  snapshot.processed_count += 1;
  completedSinceSave += 1;

  if (completedSinceSave >= SAVE_EVERY) {
    completedSinceSave = 0;
    await saveSnapshot(snapshot);
    console.log(`Processed ${snapshot.processed_count}/${sourceItems.length}`);
  }

  await sleep(REQUEST_DELAY_MS);
}

for (let start = 0; start < sourceItems.length; start += CONCURRENCY) {
  const chunk = sourceItems
    .slice(start, start + CONCURRENCY)
    .map((item, offset) => processItem(item, start + offset));
  await Promise.all(chunk);
}

await saveSnapshot(snapshot);

const processedItems = Object.entries(snapshot.processed)
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([, value]) => value);

const filteredItems = processedItems
  .map((item) => normalizeOutputItem(item))
  .filter((item) => item.review_tier === REVIEW_TIER);

const outputPayload = {
  collected_at: new Date().toISOString(),
  source_file: path.basename(INPUT_PATH),
  filter: {
    specials: true,
    category1: 998,
    review_tier: REVIEW_TIER,
  },
  source_item_count: sourceItems.length,
  processed_item_count: processedItems.length,
  item_count: filteredItems.length,
  items: filteredItems,
};

await fs.writeFile(OUTPUT_JSON_PATH, JSON.stringify(outputPayload, null, 2) + '\n', 'utf8');
await fs.writeFile(OUTPUT_CSV_PATH, toCsv(filteredItems), 'utf8');

console.log(JSON.stringify({
  output_json: OUTPUT_JSON_PATH,
  output_csv: OUTPUT_CSV_PATH,
  source_item_count: sourceItems.length,
  processed_item_count: processedItems.length,
  filtered_item_count: filteredItems.length,
}, null, 2));
