import fs from 'node:fs/promises';
import path from 'node:path';

const INPUT_FILES = [
  'steam_summer_sale_games_overwhelmingly_positive.json',
  'steam_summer_sale_games_very_positive.json',
  'steam_summer_sale_games_mostly_positive.json',
];
const MY_LIST_PATH = path.resolve('my_flat_list.json');

const OUTPUT_JSON_PATH = path.resolve('steam_summer_sale_games_combined_review_tiers.json');
const OUTPUT_CSV_PATH = path.resolve('steam_summer_sale_games_combined_review_tiers.csv');

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
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

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.appid || ''}|${item.url || ''}|${item.title || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const REVIEW_TIER_ORDER = new Map([
  ['Overwhelmingly Positive', 0],
  ['Very Positive', 1],
  ['Mostly Positive', 2],
]);

function normalizeTitle(title) {
  return String(title || '').trim().toLowerCase();
}

function normalizeUrl(url) {
  return String(url || '').split('?', 1)[0].replace(/\/$/, '');
}

function buildMyListLookup(items) {
  const byAppId = new Map();
  const byUrl = new Map();
  const byTitle = new Map();

  for (const item of items) {
    const appid = item.appid ? String(item.appid) : (String(item.url || '').match(/\/app\/(\d+)/)?.[1] || null);
    const url = normalizeUrl(item.url);
    const title = normalizeTitle(item.title);

    const flags = {
      in_cart: Boolean(item.in_cart),
      in_wishlist: Boolean(item.in_wishlist),
      tags: Array.isArray(item.tags) ? item.tags : [],
    };

    if (appid) {
      const prev = byAppId.get(appid) || { in_cart: false, in_wishlist: false, tags: [] };
      byAppId.set(appid, {
        in_cart: prev.in_cart || flags.in_cart,
        in_wishlist: prev.in_wishlist || flags.in_wishlist,
        tags: [...new Set([...prev.tags, ...flags.tags])],
      });
    }

    if (url) {
      const prev = byUrl.get(url) || { in_cart: false, in_wishlist: false, tags: [] };
      byUrl.set(url, {
        in_cart: prev.in_cart || flags.in_cart,
        in_wishlist: prev.in_wishlist || flags.in_wishlist,
        tags: [...new Set([...prev.tags, ...flags.tags])],
      });
    }

    if (title) {
      const prev = byTitle.get(title) || { in_cart: false, in_wishlist: false, tags: [] };
      byTitle.set(title, {
        in_cart: prev.in_cart || flags.in_cart,
        in_wishlist: prev.in_wishlist || flags.in_wishlist,
        tags: [...new Set([...prev.tags, ...flags.tags])],
      });
    }
  }

  return { byAppId, byUrl, byTitle };
}

function attachMyListFlags(item, lookup) {
  const appid = item.appid ? String(item.appid) : null;
  const url = normalizeUrl(item.url);
  const title = normalizeTitle(item.title);

  const match =
    (appid && lookup.byAppId.get(appid)) ||
    (url && lookup.byUrl.get(url)) ||
    (title && lookup.byTitle.get(title)) ||
    { in_cart: false, in_wishlist: false, tags: [] };

  return {
    ...item,
    in_cart: match.in_cart,
    in_wishlist: match.in_wishlist,
    tags: match.tags,
  };
}

const sourcePayloads = await Promise.all(
  INPUT_FILES.map(async (file) => JSON.parse(await fs.readFile(path.resolve(file), 'utf8'))),
);
const myListItems = JSON.parse(await fs.readFile(MY_LIST_PATH, 'utf8'));
const myListLookup = buildMyListLookup(Array.isArray(myListItems) ? myListItems : []);

const combinedItems = dedupe(
  sourcePayloads
    .flatMap((payload) => payload.items || [])
    .map((item) => attachMyListFlags(item, myListLookup)),
);

combinedItems.sort((a, b) => {
  const tierDiff = (REVIEW_TIER_ORDER.get(a.review_tier) ?? 999) - (REVIEW_TIER_ORDER.get(b.review_tier) ?? 999);
  if (tierDiff !== 0) return tierDiff;

  const ratingCountDiff = (b.rating_count || 0) - (a.rating_count || 0);
  if (ratingCountDiff !== 0) return ratingCountDiff;

  const priceDiff = (a.current_price ?? Number.POSITIVE_INFINITY) - (b.current_price ?? Number.POSITIVE_INFINITY);
  if (priceDiff !== 0) return priceDiff;

  return String(a.title || '').localeCompare(String(b.title || ''));
});

const outputPayload = {
  collected_at: new Date().toISOString(),
  source_files: INPUT_FILES,
  review_tiers: ['Overwhelmingly Positive', 'Very Positive', 'Mostly Positive'],
  item_count: combinedItems.length,
  items: combinedItems,
};

await fs.writeFile(OUTPUT_JSON_PATH, JSON.stringify(outputPayload, null, 2) + '\n', 'utf8');
await fs.writeFile(OUTPUT_CSV_PATH, toCsv(combinedItems), 'utf8');

console.log(JSON.stringify({
  output_json: OUTPUT_JSON_PATH,
  output_csv: OUTPUT_CSV_PATH,
  item_count: combinedItems.length,
}, null, 2));
