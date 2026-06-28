import fs from 'node:fs/promises';
import path from 'node:path';

const INPUT_JSON_PATH = path.resolve('steam_summer_sale_games_combined_review_tiers.json');
const OUTPUT_JSON_PATH = INPUT_JSON_PATH;
const OUTPUT_CSV_PATH = path.resolve('steam_summer_sale_games_combined_review_tiers.csv');

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
    'appids',
    'appid_raw',
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

function normalizeAppFields(item) {
  const raw = item.appid == null ? '' : String(item.appid).trim();
  const parsed = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^\d+$/.test(part));
  const uniqueParsed = [...new Set(parsed)];
  const cleanPrimary = uniqueParsed[0] || null;

  return {
    ...item,
    appid: cleanPrimary,
    appids: uniqueParsed,
    appid_raw: raw || null,
  };
}

const payload = JSON.parse(await fs.readFile(INPUT_JSON_PATH, 'utf8'));
const normalizedItems = (payload.items || []).map(normalizeAppFields);

const normalizedPayload = {
  ...payload,
  collected_at: new Date().toISOString(),
  appid_normalized_at: new Date().toISOString(),
  item_count: normalizedItems.length,
  items: normalizedItems,
};

await fs.writeFile(OUTPUT_JSON_PATH, JSON.stringify(normalizedPayload, null, 2) + '\n', 'utf8');
await fs.writeFile(OUTPUT_CSV_PATH, toCsv(normalizedItems), 'utf8');

const messyCount = normalizedItems.filter((item) => Array.isArray(item.appids) && item.appids.length > 1).length;

console.log(JSON.stringify({
  output_json: OUTPUT_JSON_PATH,
  output_csv: OUTPUT_CSV_PATH,
  item_count: normalizedItems.length,
  multi_appid_rows: messyCount,
}, null, 2));
