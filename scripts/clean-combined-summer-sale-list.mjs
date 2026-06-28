import fs from 'node:fs/promises';
import path from 'node:path';

const INPUT_JSON_PATH = path.resolve('steam_summer_sale_games_combined_review_tiers.json');
const OUTPUT_JSON_PATH = path.resolve('steam_summer_sale_games_combined_cleaned.json');
const OUTPUT_CSV_PATH = path.resolve('steam_summer_sale_games_combined_cleaned.csv');

const CATEGORY_TAG_CANDIDATES = [
  'Action',
  'Adventure',
  'RPG',
  'Strategy',
  'Simulation',
  'Sports',
  'Racing',
  'Indie',
  'Casual',
  'Puzzle',
  'Horror',
  'Survival',
  'Sandbox',
  'Open World',
  'Story Rich',
  'Exploration',
  'Platformer',
  'FPS',
  'Shooter',
  'Co-op',
  'Online Co-Op',
  'Multiplayer',
  'Singleplayer',
  'PvP',
  'Turn-Based',
  'Building',
  'Crafting',
  'Farming Sim',
  'Life Sim',
  'Visual Novel',
  'Roguelike',
  'Roguelite',
  'Deckbuilding',
];

const GENRE_TAG_CANDIDATES = [
  'Action',
  'Adventure',
  'RPG',
  'Strategy',
  'Simulation',
  'Sports',
  'Racing',
  'Indie',
  'Casual',
  'Puzzle',
  'Platformer',
  'FPS',
  'Shooter',
  'Visual Novel',
];

const PLAY_MODE_TAG_CANDIDATES = [
  'Singleplayer',
  'Multiplayer',
  'Co-op',
  'Online Co-Op',
  'PvP',
];

const MECHANIC_TAG_CANDIDATES = [
  'Open World',
  'Sandbox',
  'Exploration',
  'Building',
  'Crafting',
  'Survival',
  'Turn-Based',
  'Deckbuilding',
  'Roguelike',
  'Roguelite',
  'Farming Sim',
  'Life Sim',
];

const THEME_TAG_CANDIDATES = [
  'Horror',
  'Story Rich',
];

const OUTPUT_HEADERS = [
  'title',
  'appid',
  'url',
  'item_type',
  'item_id',
  'in_cart',
  'in_wishlist',
  'current_price',
  'original_price',
  'discount_percent',
  'price_currency',
  'rating_label',
  'rating_percent',
  'rating_count',
  'release_date_text',
  'primary_genre',
  'category_tags',
  'genre_tags',
  'play_mode_tags',
  'mechanic_tags',
  'theme_tags',
  'other_tags',
  'tags',
  'tag_count',
];

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) value = value.join('|');
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function toCsv(items) {
  const rows = items.map((item) => OUTPUT_HEADERS.map((header) => escapeCsv(item[header])).join(','));
  return [OUTPUT_HEADERS.join(','), ...rows].join('\n') + '\n';
}

function buildCategoryTags(tags) {
  const set = new Set(Array.isArray(tags) ? tags : []);
  return CATEGORY_TAG_CANDIDATES.filter((tag) => set.has(tag));
}

function selectTags(tags, candidates) {
  const set = new Set(Array.isArray(tags) ? tags : []);
  return candidates.filter((tag) => set.has(tag));
}

function cleanItem(item) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const categoryTags = buildCategoryTags(tags);
  const genreTags = selectTags(tags, GENRE_TAG_CANDIDATES);
  const playModeTags = selectTags(tags, PLAY_MODE_TAG_CANDIDATES);
  const mechanicTags = selectTags(tags, MECHANIC_TAG_CANDIDATES);
  const themeTags = selectTags(tags, THEME_TAG_CANDIDATES);
  const classified = new Set([
    ...genreTags,
    ...playModeTags,
    ...mechanicTags,
    ...themeTags,
  ]);
  const otherTags = tags.filter((tag) => !classified.has(tag));

  return {
    title: item.title ?? null,
    appid: item.appid ?? null,
    url: item.url ?? null,
    item_type: item.item_type ?? null,
    item_id: item.item_id ?? null,
    in_cart: Boolean(item.in_cart),
    in_wishlist: Boolean(item.in_wishlist),
    current_price: item.current_price ?? null,
    original_price: item.original_price ?? null,
    discount_percent: item.discount_percent ?? null,
    price_currency: item.price_currency ?? 'SGD',
    rating_label: item.rating_label ?? item.review_tier ?? null,
    rating_percent: item.rating_percent ?? null,
    rating_count: item.rating_count ?? null,
    release_date_text: item.release_date_text ?? null,
    primary_genre: genreTags[0] ?? null,
    category_tags: categoryTags,
    genre_tags: genreTags,
    play_mode_tags: playModeTags,
    mechanic_tags: mechanicTags,
    theme_tags: themeTags,
    other_tags: otherTags,
    tags,
    tag_count: tags.length,
  };
}

const payload = JSON.parse(await fs.readFile(INPUT_JSON_PATH, 'utf8'));
const cleanedItems = (payload.items || []).map(cleanItem);

const outputPayload = {
  collected_at: new Date().toISOString(),
  source_file: path.basename(INPUT_JSON_PATH),
  item_count: cleanedItems.length,
  columns: OUTPUT_HEADERS,
  items: cleanedItems,
};

await fs.writeFile(OUTPUT_JSON_PATH, JSON.stringify(outputPayload, null, 2) + '\n', 'utf8');
await fs.writeFile(OUTPUT_CSV_PATH, toCsv(cleanedItems), 'utf8');

console.log(JSON.stringify({
  output_json: OUTPUT_JSON_PATH,
  output_csv: OUTPUT_CSV_PATH,
  item_count: cleanedItems.length,
  columns: OUTPUT_HEADERS,
}, null, 2));
