import { Dataset } from 'crawlee';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_PATH = path.resolve('steam_summer_sale_games.json');
const SNAPSHOT_PATH = path.resolve('.steam_summer_sale_games.snapshot.json');
const SEARCH_ENDPOINT = 'https://store.steampowered.com/search/results/';
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 2000);
const MAX_PAGES = Number(process.env.MAX_PAGES || Math.ceil(MAX_ITEMS / PAGE_SIZE));
const PAGE_DELAY_MS = Number(process.env.PAGE_DELAY_MS || 1500);
const RETRY_LIMIT = Number(process.env.RETRY_LIMIT || 20);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS || 15000);

function parseMoney(text) {
  if (!text) return null;
  const match = text.match(/S\$\s*([0-9][0-9,]*\.?[0-9]*)/);
  return match ? Number(match[1].replaceAll(',', '')) : null;
}

function decodeHtml(text) {
  return text
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function parseRows(resultsHtml) {
  const rows = resultsHtml.split('<a href="').slice(1);
  return rows
    .map((row) => {
      const href = row.split('"', 1)[0].split('?', 1)[0].replace(/\/$/, '');
      const title = decodeHtml(row.match(/<span class="title">([\s\S]*?)<\/span>/)?.[1] || '').trim() || null;
      const appid = row.match(/data-ds-appid="([^"]*)"/)?.[1] || null;
      const itemKey = row.match(/data-ds-itemkey="([^"]*)"/)?.[1] || null;
      const releaseDate = decodeHtml(row.match(/<div class="search_released responsive_secondrow">\s*([\s\S]*?)\s*<\/div>/)?.[1] || '').trim() || null;
      const discountText = decodeHtml(row.match(/<div class="discount_pct">([\s\S]*?)<\/div>/)?.[1] || '').trim() || null;
      const originalPriceText = decodeHtml(row.match(/<div class="discount_original_price">([\s\S]*?)<\/div>/)?.[1] || '').trim() || null;
      const finalPriceText = decodeHtml(row.match(/<div class="discount_final_price">([\s\S]*?)<\/div>/)?.[1] || '').trim() || null;
      const itemType = itemKey?.includes('_') ? itemKey.split('_', 1)[0].toLowerCase() : 'app';
      const itemId = itemKey?.includes('_') ? itemKey.split('_')[1] : appid;

      return {
        title,
        url: href || null,
        item_type: itemType,
        item_id: itemId || null,
        appid,
        discount_percent: discountText ? Number(discountText.replace(/[^0-9]/g, '')) : 0,
        original_price_sgd: parseMoney(originalPriceText),
        current_price_sgd: parseMoney(finalPriceText || originalPriceText),
        release_date_text: releaseDate,
      };
    })
    .filter((item) => item.title && item.url);
}

function buildSearchUrl(start) {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set('query', '');
  url.searchParams.set('start', String(start));
  url.searchParams.set('count', String(PAGE_SIZE));
  url.searchParams.set('dynamic_data', '');
  url.searchParams.set('sort_by', '_ASC');
  url.searchParams.set('supportedlang', 'english');
  url.searchParams.set('snr', '1_7_7_230_7');
  url.searchParams.set('specials', '1');
  url.searchParams.set('infinite', '1');
  url.searchParams.set('ndl', '1');
  url.searchParams.set('category1', '998');
  return url.toString();
}

async function loadSnapshot() {
  try {
    return JSON.parse(await fs.readFile(SNAPSHOT_PATH, 'utf8'));
  } catch {
    return {
      total_count_reported: null,
      pages_completed: [],
      items: [],
    };
  }
}

async function saveSnapshot(snapshot) {
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.url}|${item.item_type}|${item.item_id}|${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const snapshot = await loadSnapshot();

const dataset = await Dataset.open('steam-summer-sale-games');

for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
  const start = pageIndex * PAGE_SIZE;
  if (snapshot.pages_completed.includes(start)) continue;

  let payload = null;
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
    const response = await fetch(buildSearchUrl(start), {
      headers: {
        'accept': 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; steam-sale-scraper/0.1)',
      },
    });

    if (response.status === 429 || response.status === 403) {
      const sleepMs = RETRY_BASE_MS * (attempt + 1);
      console.log(`Blocked at start=${start} status=${response.status}; sleeping ${sleepMs}ms before retry ${attempt + 1}/${RETRY_LIMIT}`);
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Steam search request failed at start=${start}: ${response.status}`);
    }

    payload = await response.json();
    break;
  }

  if (!payload) {
    throw new Error(`Steam kept blocking start=${start} after ${RETRY_LIMIT} retries. Progress is saved.`);
  }

  const parsedItems = parseRows(payload.results_html || '');
  snapshot.total_count_reported ??= payload.total_count ?? null;
  snapshot.pages_completed.push(start);
  snapshot.items.push(...parsedItems);
  snapshot.items = dedupeItems(snapshot.items);

  await dataset.pushData(
    parsedItems.map((item) => ({
      start,
      ...item,
    })),
  );
  await saveSnapshot(snapshot);
  console.log(`Completed start=${start}; total saved items=${snapshot.items.length}`);

  if (snapshot.items.length >= MAX_ITEMS) break;
  await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
}

const finalItems = dedupeItems(snapshot.items).slice(0, MAX_ITEMS);
const finalPayload = {
  collected_at: new Date().toISOString(),
  source: SEARCH_ENDPOINT,
  scope: 'games only',
  query: {
    category1: 998,
    specials: 1,
    supportedlang: 'english',
    currency: 'SGD',
    page_size: PAGE_SIZE,
    max_items: MAX_ITEMS,
    max_pages: MAX_PAGES,
  },
  total_count_reported: snapshot.total_count_reported,
  item_count_collected: finalItems.length,
  pages_completed: snapshot.pages_completed.sort((a, b) => a - b),
  items: finalItems,
};

await fs.writeFile(OUTPUT_PATH, JSON.stringify(finalPayload, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  output: OUTPUT_PATH,
  snapshot: SNAPSHOT_PATH,
  total_count_reported: finalPayload.total_count_reported,
  item_count_collected: finalPayload.item_count_collected,
  pages_completed: finalPayload.pages_completed.length,
}, null, 2));
