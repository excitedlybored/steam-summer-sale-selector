# Steam Game Analysis

This workspace currently contains:

- `my_list.json`
  Your merged personal Steam list built from your cart and wishlist.
- `steam_collection.json`
  Earlier merged collection output for the same personal data.
- `steam_summer_sale_games.json`
  Partial Summer Sale `games-only` catalog collected from Steam search results.
- `.steam_summer_sale_games.snapshot.json`
  Resume checkpoint for the Summer Sale crawler.
- `scripts/scrape-summer-sale-games.mjs`
  Resumable Crawlee-based scraper for the Steam Summer Sale `games-only` list.
- `scripts/filter-summer-sale-overwhelmingly-positive.mjs`
  Resumable review filter that keeps only `Overwhelmingly Positive` Summer Sale games.

## Personal list

`my_list.json` is the main file to use for your own data analysis.

It contains:

- `cart`
- `wishlist`
- `combined`

Useful combined fields include:

- `title`
- `url`
- `source`
- `in_cart`
- `in_wishlist`
- `current_price_sgd`
- `original_price_sgd`
- `discount_percent`
- `rank`

## Current Summer Sale progress

The Summer Sale crawl is incomplete but resumable.

Latest saved progress:

- scope: `games only`
- source: Steam search results
- completed pages: `32`
- last completed offset: `3100`
- collected rows in snapshot: about `3200`

Steam started returning `429` after that point, so progress was checkpointed.

## How to continue the Summer Sale crawl

The scraper is designed to resume from `.steam_summer_sale_games.snapshot.json`.

Run from this folder:

```bash
npm run scrape:summer-sale-games
```

Useful environment overrides:

```bash
MAX_ITEMS=5000 MAX_PAGES=50 npm run scrape:summer-sale-games
```

```bash
MAX_ITEMS=10000 MAX_PAGES=100 PAGE_DELAY_MS=3000 RETRY_BASE_MS=30000 npm run scrape:summer-sale-games
```

What the knobs do:

- `MAX_ITEMS`
  Stops once this many deduped items are collected.
- `MAX_PAGES`
  Maximum paginated Steam search pages to attempt.
- `PAGE_DELAY_MS`
  Delay between successful page requests.
- `RETRY_LIMIT`
  How many times to retry a blocked page before stopping.
- `RETRY_BASE_MS`
  Base backoff used when Steam returns `429` or `403`.

Recommended approach:

1. Start conservative.
2. Let the scraper resume from the snapshot.
3. If Steam blocks again, wait and rerun later.
4. Do not delete `.steam_summer_sale_games.snapshot.json` unless you want to restart from scratch.

Example conservative run:

```bash
MAX_ITEMS=5000 MAX_PAGES=50 PAGE_DELAY_MS=4000 RETRY_BASE_MS=45000 npm run scrape:summer-sale-games
```

## Files that matter for continuation

- [my_list.json](/Users/zijie-machine/code_ai/steam_game_analysis/my_list.json)
- [steam_summer_sale_games.json](/Users/zijie-machine/code_ai/steam_game_analysis/steam_summer_sale_games.json)
- [.steam_summer_sale_games.snapshot.json](/Users/zijie-machine/code_ai/steam_game_analysis/.steam_summer_sale_games.snapshot.json)
- [.steam_summer_sale_overwhelmingly_positive.snapshot.json](/Users/zijie-machine/code_ai/steam_game_analysis/.steam_summer_sale_overwhelmingly_positive.snapshot.json)
- [steam_summer_sale_games_overwhelmingly_positive.json](/Users/zijie-machine/code_ai/steam_game_analysis/steam_summer_sale_games_overwhelmingly_positive.json)
- [steam_summer_sale_games_overwhelmingly_positive.csv](/Users/zijie-machine/code_ai/steam_game_analysis/steam_summer_sale_games_overwhelmingly_positive.csv)
- [scripts/scrape-summer-sale-games.mjs](/Users/zijie-machine/code_ai/steam_game_analysis/scripts/scrape-summer-sale-games.mjs)
- [scripts/filter-summer-sale-overwhelmingly-positive.mjs](/Users/zijie-machine/code_ai/steam_game_analysis/scripts/filter-summer-sale-overwhelmingly-positive.mjs)
- [package.json](/Users/zijie-machine/code_ai/steam_game_analysis/package.json)

## Build a review-tier Summer Sale subset

Run from this folder:

```bash
npm run filter:summer-sale-overwhelmingly-positive
```

For `Very Positive`:

```bash
npm run filter:summer-sale-very-positive
```

This reads `steam_summer_sale_games.json`, enriches each game with Steam review summary data, and writes tier-specific files such as:

- `steam_summer_sale_games_overwhelmingly_positive.json`
- `steam_summer_sale_games_overwhelmingly_positive.csv`
- `steam_summer_sale_games_very_positive.json`
- `steam_summer_sale_games_very_positive.csv`

If Steam slows or blocks requests, rerun the same command later. Each review tier resumes from its own snapshot file.
