import fs from 'node:fs/promises';
import path from 'node:path';

const INPUT_JSON_PATH = path.resolve('steam_summer_sale_games_combined_review_tiers.json');
const OUTPUT_JSON_PATH = path.resolve('steam_summer_sale_games_combined_review_tiers.json');
const OUTPUT_CSV_PATH = path.resolve('steam_summer_sale_games_combined_review_tiers.csv');
const SNAPSHOT_PATH = path.resolve('.steam_summer_sale_combined_tags.snapshot.json');
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 400);
const RETRY_LIMIT = Number(process.env.RETRY_LIMIT || 6);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS || 5000);
const SAVE_EVERY = Number(process.env.SAVE_EVERY || 25);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) value = value.join('|');
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
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
    'in_cart',
    'in_wishlist',
    'tags',
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

function decodeHtml(text) {
  return text
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .trim();
}

function normalizeUrl(url) {
  return String(url || '').split('?', 1)[0].replace(/\/$/, '');
}

function parseTagsFromHtml(html) {
  const matches = [...html.matchAll(/<a[^>]*class="app_tag[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
  const tags = matches
    .map((match) => decodeHtml(match[1]).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return [...new Set(tags)];
}

async function loadSnapshot(itemCount) {
  try {
    return JSON.parse(await fs.readFile(SNAPSHOT_PATH, 'utf8'));
  } catch {
    return {
      source_item_count: itemCount,
      processed: {},
      processed_count: 0,
    };
  }
}

async function saveSnapshot(snapshot) {
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
}

async function fetchTags(url) {
  const normalizedUrl = normalizeUrl(url);

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
    const response = await fetch(normalizedUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (compatible; steam-tag-enricher/0.1)',
      },
    });

    if (response.status === 429 || response.status === 403) {
      await sleep(RETRY_BASE_MS * (attempt + 1));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Tag request failed for ${normalizedUrl}: ${response.status}`);
    }

    const html = await response.text();
    return parseTagsFromHtml(html);
  }

  throw new Error(`Steam kept blocking tag request for ${normalizedUrl}`);
}

const payload = JSON.parse(await fs.readFile(INPUT_JSON_PATH, 'utf8'));
const items = payload.items || [];
const snapshot = await loadSnapshot(items.length);

let completedSinceSave = 0;

async function processItem(item, index) {
  if (snapshot.processed[index]) return;

  const fetchedTags = await fetchTags(item.url);
  const existingTags = Array.isArray(item.tags) ? item.tags : [];
  const mergedTags = [...new Set([...existingTags, ...fetchedTags])];

  snapshot.processed[index] = {
    ...item,
    tags: mergedTags,
  };
  snapshot.processed_count += 1;
  completedSinceSave += 1;

  if (completedSinceSave >= SAVE_EVERY) {
    completedSinceSave = 0;
    await saveSnapshot(snapshot);
    console.log(`Processed ${snapshot.processed_count}/${items.length}`);
  }

  await sleep(REQUEST_DELAY_MS);
}

for (let start = 0; start < items.length; start += CONCURRENCY) {
  const chunk = items
    .slice(start, start + CONCURRENCY)
    .map((item, offset) => processItem(item, start + offset));
  await Promise.all(chunk);
}

await saveSnapshot(snapshot);

const enrichedItems = items.map((item, index) => snapshot.processed[index] || item);
const outputPayload = {
  ...payload,
  collected_at: new Date().toISOString(),
  tag_enriched_at: new Date().toISOString(),
  item_count: enrichedItems.length,
  items: enrichedItems,
};

await fs.writeFile(OUTPUT_JSON_PATH, JSON.stringify(outputPayload, null, 2) + '\n', 'utf8');
await fs.writeFile(OUTPUT_CSV_PATH, toCsv(enrichedItems), 'utf8');

console.log(JSON.stringify({
  output_json: OUTPUT_JSON_PATH,
  output_csv: OUTPUT_CSV_PATH,
  snapshot: SNAPSHOT_PATH,
  item_count: enrichedItems.length,
}, null, 2));
