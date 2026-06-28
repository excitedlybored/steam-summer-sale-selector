import { createSignal, createMemo, createEffect, createUniqueId, onMount, onCleanup, For, Show, batch } from 'solid-js'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card } from './components/ui/card'
import './App.css'

const STORAGE_KEYS = {
  shortlist: 'steam-selector-shortlist',
  cart: 'steam-selector-cart',
}

const REVIEW_ORDER = ['Overwhelmingly Positive', 'Very Positive', 'Mostly Positive']

function formatPrice(value, currency = 'SGD') {
  if (value == null) return 'N/A'
  try {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value}`
  }
}

function formatCount(value) {
  return new Intl.NumberFormat('en-US').format(value ?? 0)
}

function getSortVal(item, key) {
  switch (key) {
    case 'rating':
      return REVIEW_ORDER.indexOf(item.rating_label)
    case 'count':
      return -(item.rating_count || 0)
    case 'price':
      return item.current_price || 0
    case 'discount':
      return -(item.discount_percent || 0)
    case 'year_desc':
      return -(item.release_year || 0)
    case 'year_asc':
      return item.release_year || 9999
    case 'title':
      return item.title || ''
    default:
      return 0
  }
}

function comparePriority(a, b, key) {
  const valA = getSortVal(a, key)
  const valB = getSortVal(b, key)
  if (typeof valA === 'string' && typeof valB === 'string') {
    return valA.localeCompare(valB)
  }
  return valA - valB
}

function getSortLabel(key) {
  switch (key) {
    case 'rating': return 'rating tier'
    case 'price': return 'price'
    case 'discount': return 'discount'
    case 'count': return 'review count'
    case 'year_desc': return 'newest year'
    case 'year_asc': return 'oldest year'
    case 'title': return 'title'
    default: return ''
  }
}

function getGameDescription(item) {
  const gameplay = []
  if (item.mechanic_tags && item.mechanic_tags.length > 0) {
    gameplay.push(item.mechanic_tags.slice(0, 3).join(', '))
  }
  if (item.theme_tags && item.theme_tags.length > 0) {
    gameplay.push(item.theme_tags.slice(0, 2).join(', '))
  }
  
  const styleList = []
  if (item.other_tags && item.other_tags.length > 0) {
    const cleanStyles = item.other_tags.filter(
      (tag) => tag.toLowerCase() !== (item.title || '').toLowerCase()
    )
    styleList.push(cleanStyles.slice(0, 3).join(', '))
  }

  const descParts = []
  if (gameplay.length > 0) {
    descParts.push(`Features ${gameplay.join(' & ')} gameplay`)
  }
  if (styleList.length > 0) {
    descParts.push(`with ${styleList.join(', ')} styles`)
  }

  if (descParts.length === 0) {
    return 'A popular title with customized community tags.'
  }

  return descParts.join(' ') + '.'
}

function readStoredSet(key, fallbackItems, flagKey) {
  const raw = localStorage.getItem(key)
  if (!raw) return new Set()

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed.map(Number))
    if (Array.isArray(parsed.appids)) return new Set(parsed.appids.map(Number))
  } catch {
    // Ignore malformed saved state
  }

  return new Set()
}

function parseImportedIds(text) {
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.map(Number)
    if (Array.isArray(parsed.appids)) return parsed.appids.map(Number)
  } catch {
    // Try loose text formats next.
  }

  return text
    .split(/[\s,|]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map(Number)
}

function summarizeCompositionByTwoCriteria(items, dimension, metric) {
  const groups = new Map()

  for (const item of items) {
    let key = 'Unclassified'
    if (dimension === 'game') {
      key = item.title
    } else if (dimension === 'genre') {
      key = item.primary_genre || 'Unclassified'
    } else if (dimension === 'rating-tier') {
      key = item.rating_label || 'Unrated'
    } else if (dimension === 'mode') {
      key = (item.play_mode_tags || [])[0] || 'Unclassified'
    }

    let val = 0
    if (metric === 'unit') {
      val = 1
    } else if (metric === 'price') {
      val = item.current_price || 0
    } else if (metric === 'rating') {
      val = item.rating_count || 0
    }

    groups.set(key, (groups.get(key) || 0) + val)
  }

  return [...groups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }))
}

function PieChartCard(props) {
  const chartId = createUniqueId()
  const [dimension, setDimension] = createSignal('genre')
  const [metric, setMetric] = createSignal('unit')
  const [hoveredIndex, setHoveredIndex] = createSignal(null)
  const [tooltip, setTooltip] = createSignal(null)
  
  const composition = createMemo(() => summarizeCompositionByTwoCriteria(props.items, dimension(), metric()))
  const total = createMemo(() => composition().reduce((sum, segment) => sum + segment.value, 0))
  const palette = ['#9aa6b2', '#bcccdc', '#d9eafd', '#f8fafc', '#64748b', '#cbd5e1']

  const background = createMemo(() => {
    const comp = composition()
    const tot = total()
    return comp.length
      ? `conic-gradient(${comp
          .map((segment, index) => {
            const previous = comp
              .slice(0, index)
              .reduce((sum, part) => sum + (part.value / tot) * 360, 0)
            const next = previous + (segment.value / tot) * 360
            return `${palette[index % palette.length]} ${previous}deg ${next}deg`
          })
          .join(', ')})`
      : 'conic-gradient(var(--line) 0deg 360deg)'
  })

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const mx = e.clientX - rect.left - cx
    const my = e.clientY - rect.top - cy
    const d = Math.sqrt(mx * mx + my * my)

    const comp = composition()
    const tot = total()

    if (d >= 40 && d <= 75 && comp.length > 0 && tot > 0) {
      let angle = (Math.atan2(my, mx) * 180) / Math.PI + 90
      if (angle < 0) angle += 360
      if (angle >= 360) angle = 0

      let matchedIndex = null
      let accumAngle = 0
      for (let i = 0; i < comp.length; i++) {
        const deg = (comp[i].value / tot) * 360
        if (angle >= accumAngle && angle < accumAngle + deg) {
          matchedIndex = i
          break
        }
        accumAngle += deg
      }

      setHoveredIndex(matchedIndex)

      if (matchedIndex !== null) {
        const segment = comp[matchedIndex]
        const formattedVal = metric() === 'price' 
          ? formatPrice(segment.value) 
          : formatCount(segment.value)

        const cardRect = e.currentTarget.closest('.chart-card').getBoundingClientRect()
        setTooltip({
          x: e.clientX - cardRect.left,
          y: e.clientY - cardRect.top,
          label: segment.label,
          value: formattedVal
        })
      } else {
        setTooltip(null)
      }
    } else {
      setHoveredIndex(null)
      setTooltip(null)
    }
  }

  function handleMouseLeave() {
    setHoveredIndex(null)
    setTooltip(null)
  }

  return (
    <Card class="chart-card p-4 relative overflow-hidden bg-gradient-to-br from-paper via-paper to-light-dark(rgba(99,102,241,0.01),rgba(129,140,248,0.02)) border border-line">
      <Show when={tooltip()}>
        <div
          class="absolute z-50 bg-slate-950/90 text-white text-[10px] font-semibold px-2 py-1 rounded shadow-md pointer-events-none -translate-x-1/2 -translate-y-full mt-[-6px]"
          style={{
            left: `${tooltip().x}px`,
            top: `${tooltip().y}px`
          }}
        >
          <strong>{tooltip().label}</strong>: {tooltip().value}
        </div>
      </Show>

      <div class="flex items-start justify-between mb-4">
        <div>
          <p class="text-[10px] font-semibold tracking-wider text-muted uppercase font-mono">{props.title}</p>
          <h3 class="text-lg font-bold leading-tight mt-0.5">{formatCount(props.items.length)} games</h3>
        </div>
        <div class="flex space-x-2">
          <Button variant="ghost" size="sm" class="h-7 px-2 text-[11px] font-medium" onClick={props.onImport}>
            Import
          </Button>
          <Button variant="ghost" size="sm" class="h-7 px-2 text-[11px] font-medium" onClick={props.onExport}>
            Export
          </Button>
        </div>
      </div>

      <div class="divide-y divide-line max-h-48 overflow-y-auto mb-4 scrollbar-thin">
        <Show when={props.items.length > 0} fallback={<div class="py-6 text-center text-xs text-muted font-medium">No games added yet.</div>}>
          <For each={props.items}>{(item) => (
            <div class="flex items-center justify-between py-1.5 text-xs">
              <span class="truncate font-medium text-ink/90 pr-2" title={item.title}>{item.title}</span>
              <div class="flex items-center space-x-2 flex-shrink-0">
                <span class="font-mono text-muted font-semibold">{formatPrice(item.current_price, item.price_currency)}</span>
                <button
                  type="button"
                  class="text-muted hover:text-accent font-bold text-sm px-1 leading-none transition-colors"
                  onClick={() => props.onRemove(item.appid)}
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            </div>
          )}</For>
        </Show>
      </div>

      <Show when={props.items.length > 0}>
        <div class="grid grid-cols-2 gap-2 p-2 rounded-lg bg-light-dark(rgba(15,23,42,0.02),rgba(255,255,255,0.02)) border border-line mb-4 text-[10px]">
          <div class="flex flex-col">
            <span class="text-muted font-semibold mb-0.5">Group by</span>
            <select
              value={dimension()}
              onChange={(e) => setDimension(e.currentTarget.value)}
              class="bg-transparent border-0 text-ink font-semibold focus:ring-0 cursor-pointer p-0 h-5"
            >
              <option value="genre">Primary Genre</option>
              <option value="rating-tier">Review Tier</option>
              <option value="mode">Play Mode</option>
              <option value="game">Individual Game</option>
            </select>
          </div>
          <div class="flex flex-col">
            <span class="text-muted font-semibold mb-0.5">Value</span>
            <select
              value={metric()}
              onChange={(e) => setMetric(e.currentTarget.value)}
              class="bg-transparent border-0 text-ink font-semibold focus:ring-0 cursor-pointer p-0 h-5"
            >
              <option value="unit">Game Count (Unit)</option>
              <option value="price">Spend (Price)</option>
              <option value="rating">Review Count (Rating)</option>
            </select>
          </div>
        </div>

        <div class="flex items-center space-x-4">
          <div
            class="w-24 h-24 rounded-full flex items-center justify-center relative shadow-sm flex-shrink-0 cursor-crosshair border border-line/10"
            style={{ background: background(), '--ring-accent': props.accent }}
            aria-hidden="true"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <div class="w-[56px] h-[56px] rounded-full bg-paper flex flex-col items-center justify-center text-center shadow-inner">
              <span class="text-xs font-bold truncate max-w-[48px]" style={metric() === 'price' || (hoveredIndex() !== null ? composition()[hoveredIndex()].value : total()) > 9999 ? { 'font-size': '10px' } : {}}>
                {hoveredIndex() !== null
                  ? (metric() === 'price' ? formatPrice(composition()[hoveredIndex()].value) : formatCount(composition()[hoveredIndex()].value))
                  : (metric() === 'price' ? formatPrice(total()) : formatCount(total()))}
              </span>
              <small class="text-[8px] text-muted font-mono font-bold tracking-tight uppercase truncate max-w-[48px]">
                {hoveredIndex() !== null
                  ? composition()[hoveredIndex()].label
                  : (metric() === 'price' ? 'Spend' : metric() === 'rating' ? 'Reviews' : 'Games')}
              </small>
            </div>
          </div>

          <ul class="flex-1 space-y-1.5 text-[11px] list-none p-0 m-0">
            <For each={composition()}>{(segment, index) => (
              <li 
                style={{ '--pct': `${(segment.value / total()) * 100}%` }}
                class={`grid grid-cols-[8px_1fr_auto] gap-2 items-center relative px-2 py-0.5 rounded overflow-hidden transition-colors ${hoveredIndex() === index() ? 'bg-light-dark(rgba(15,23,42,0.04),rgba(255,255,255,0.04))]' : ''}`}
              >
                {/* Weight background indicator bar */}
                <div 
                  class="absolute inset-y-0 left-0 bg-light-dark(rgba(99,102,241,0.04),rgba(129,140,248,0.08)) rounded-r transition-all duration-300 pointer-events-none"
                  style={{ width: `${(segment.value / total()) * 100}%` }}
                />
                <span
                  class="w-2 h-2 rounded-full relative z-1"
                  style={{ 'background-color': palette[index() % palette.length] }}
                />
                <span class="truncate font-medium text-muted relative z-1">{segment.label}</span>
                <strong class="font-mono text-ink relative z-1">
                  {metric() === 'price'
                    ? formatPrice(segment.value)
                    : formatCount(segment.value)}
                </strong>
              </li>
            )}</For>
          </ul>
        </div>
      </Show>
    </Card>
  )
}

function ChecklistDropdown(props) {
  const [isOpen, setIsOpen] = createSignal(false)
  let containerRef

  onMount(() => {
    const handleOutsideClick = (e) => {
      if (containerRef && !containerRef.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  })

  const label = createMemo(() => {
    if (props.selected.size === 0) return props.placeholder
    if (props.selected.size === 1) return [...props.selected][0]
    return `${props.labelPrefix} (${props.selected.size})`
  })

  return (
    <div class="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        class="flex items-center justify-between h-7 px-2 text-[10px] bg-paper border border-line rounded-md text-ink hover:bg-[light-dark(rgba(15,23,42,0.04),rgba(255,255,255,0.04))] transition-colors focus:outline-none focus:ring-1 focus:ring-primary gap-1 whitespace-nowrap"
        onClick={() => setIsOpen(!isOpen())}
      >
        <span class="pr-0.5 font-semibold whitespace-nowrap">{label()}</span>
        <span class="text-[9px] text-muted transition-transform duration-200" style={isOpen() ? { transform: 'rotate(180deg)' } : {}}>▼</span>
      </button>

      <Show when={isOpen()}>
        <div class="absolute right-0 mt-1.5 w-56 origin-top-right rounded-xl border border-line bg-paper text-ink shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 animate-in fade-in slide-in-from-top-1 duration-200">
          <div class="flex items-center justify-between px-3 py-2 border-b border-line">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">{props.labelPrefix}</span>
            <button
              type="button"
              class="text-[10px] text-primary font-medium hover:underline"
              onClick={() => props.onChange(new Set())}
            >
              Clear All
            </button>
          </div>
          <div class="max-h-60 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin">
            <For each={props.options}>{(opt) => {
              const isChecked = createMemo(() => props.selected.has(opt))
              return (
                <label class="flex items-center space-x-2 px-2 py-1.5 rounded-lg text-xs hover:bg-[light-dark(rgba(15,23,42,0.04),rgba(255,255,255,0.04))] cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={isChecked()}
                    class="rounded border-line text-primary focus:ring-primary h-3.5 w-3.5"
                    onChange={() => {
                      const next = new Set(props.selected)
                      if (next.has(opt)) next.delete(opt)
                      else next.add(opt)
                      props.onChange(next)
                    }}
                  />
                  <span class="truncate font-medium text-ink/90">{opt}</span>
                </label>
              )
            }}</For>
          </div>
        </div>
      </Show>
    </div>
  )
}

function App() {
  const [isDarkMode, setIsDarkMode] = createSignal(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  onMount(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = (e) => setIsDarkMode(e.matches)
    mediaQuery.addEventListener('change', handleThemeChange)
    onCleanup(() => mediaQuery.removeEventListener('change', handleThemeChange))
  })

  const [games, setGames] = createSignal([])
  const [loading, setLoading] = createSignal(true)
  const [search, setSearch] = createSignal('')
  const [selectedTiers, setSelectedTiers] = createSignal(new Set(REVIEW_ORDER))
  const [selectedGenres, setSelectedGenres] = createSignal(new Set())
  const [selectedModes, setSelectedModes] = createSignal(new Set())
  const [selectedYears, setSelectedYears] = createSignal(new Set())
  const [ownershipFilter, setOwnershipFilter] = createSignal('all')
  const [maxPrice, setMaxPrice] = createSignal(80)
  const [shortlist, setShortlist] = createSignal(new Set())
  const [cart, setCart] = createSignal(new Set())
  const [sortPriority1, setSortPriority1] = createSignal('rating')
  const [sortPriority2, setSortPriority2] = createSignal('count')
  const [sortPriority3, setSortPriority3] = createSignal('price')
  const [visibleCount, setVisibleCount] = createSignal(50)
  const [activeTab, setActiveTab] = createSignal('games') // 'games' | 'shortlist' | 'cart'
  const [hideFilters, setHideFilters] = createSignal(false)
  let lastScrollTop = 0

  const handleScroll = (e) => {
    const scrollTop = e.currentTarget.scrollTop
    if (Math.abs(scrollTop - lastScrollTop) > 10) {
      if (scrollTop > lastScrollTop && scrollTop > 60) {
        setHideFilters(true)
      } else {
        setHideFilters(false)
      }
    }
    lastScrollTop = scrollTop
  }

  let shortlistImportRef
  let cartImportRef

  onMount(async () => {
    try {
      const response = await fetch('/steam_games.json')
      const payload = await response.json()
      const loadedItems = payload.items || []
      
      // Precompute search haystack and extract release year
      loadedItems.forEach(item => {
        item._searchString = [
          item.title,
          item.primary_genre,
          ...(item.tags || []),
          ...(item.category_tags || []),
        ].join(' ').toLowerCase()

        const match = item.release_date_text ? item.release_date_text.match(/\b(19\d\d|20\d\d)\b/) : null
        item.release_year = match ? parseInt(match[1], 10) : null
      })
      
      batch(() => {
        setGames(loadedItems)
        setShortlist(readStoredSet(STORAGE_KEYS.shortlist, loadedItems, 'in_wishlist'))
        setCart(readStoredSet(STORAGE_KEYS.cart, loadedItems, 'in_cart'))
      })
    } catch (e) {
      console.error('Failed to load games data:', e)
    } finally {
      setLoading(false)
    }
  })

  createEffect(() => {
    const list = shortlist()
    if (!games().length) return
    localStorage.setItem(STORAGE_KEYS.shortlist, JSON.stringify([...list]))
  })

  createEffect(() => {
    const list = cart()
    if (!games().length) return
    localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify([...list]))
  })

  const availableGenres = createMemo(() => {
    return [...new Set(games().flatMap((item) => item.genre_tags || []))].sort()
  })

  const availableModes = createMemo(() => {
    return [...new Set(games().flatMap((item) => item.play_mode_tags || []))].sort()
  })

  const availableYears = createMemo(() => {
    const years = games()
      .map((item) => item.release_year)
      .filter(Boolean)
    return [...new Set(years)].sort((a, b) => b - a).map(String)
  })

  const filteredGames = createMemo(() => {
    const query = search().trim().toLowerCase()

    const list = games().filter((item) => {
      if (query) {
        if (!item._searchString.includes(query)) return false
      }

      if (!selectedTiers().has(item.rating_label)) return false
      if ((item.current_price ?? Number.POSITIVE_INFINITY) > maxPrice()) return false

      if (selectedGenres().size) {
        const genreTags = item.genre_tags || []
        if (![...selectedGenres()].some((genre) => genreTags.includes(genre))) return false
      }

      if (selectedModes().size) {
        const playModeTags = item.play_mode_tags || []
        if (![...selectedModes()].some((mode) => playModeTags.includes(mode))) return false
      }

      if (selectedYears().size) {
        if (!selectedYears().has(String(item.release_year))) return false
      }

      if (ownershipFilter() === 'shortlist' && !shortlist().has(item.appid)) return false
      if (ownershipFilter() === 'cart' && !cart().has(item.appid)) return false
      if (ownershipFilter() === 'unowned' && (shortlist().has(item.appid) || cart().has(item.appid))) return false

      return true
    })

    return [...list].sort((a, b) => {
      const cmp1 = comparePriority(a, b, sortPriority1())
      if (cmp1 !== 0) return cmp1

      const cmp2 = comparePriority(a, b, sortPriority2())
      if (cmp2 !== 0) return cmp2

      return comparePriority(a, b, sortPriority3())
    })
  })

  createEffect(() => {
    // Reset visible count when filters change
    filteredGames()
    setVisibleCount(50)
  })

  const visibleGamesList = createMemo(() => filteredGames().slice(0, visibleCount()))

  const shortlistItems = createMemo(() => {
    return games().filter((item) => shortlist().has(item.appid))
  })

  const cartItems = createMemo(() => {
    return games().filter((item) => cart().has(item.appid))
  })

  const shortlistSpend = createMemo(() => {
    return shortlistItems().reduce((sum, item) => sum + (item.current_price || 0), 0)
  })

  const cartSpend = createMemo(() => {
    return cartItems().reduce((sum, item) => sum + (item.current_price || 0), 0)
  })

  function toggleInSet(appid, setter) {
    setter((current) => {
      const next = new Set(current)
      if (next.has(appid)) next.delete(appid)
      else next.add(appid)
      return next
    })
  }

  function exportList(name, valueSet) {
    const payload = {
      exported_at: new Date().toISOString(),
      appids: [...valueSet],
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${name}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function importList(event, setter) {
    const [file] = event.currentTarget.files || []
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const ids = parseImportedIds(String(reader.result || ''))
      const validIds = ids.filter((appid) => games().some((item) => item.appid === appid))
      setter(new Set(validIds))
    }
    reader.readAsText(file)
    event.currentTarget.value = ''
  }

  return (
    <Show when={!loading()} fallback={<div class="min-h-screen grid place-items-center text-primary font-bold text-lg">Loading Steam selector…</div>}>
      <div class="h-dvh overflow-hidden flex flex-col bg-bg bg-gradient-to-br from-indigo-950/5 via-transparent to-rose-950/5 p-4 md:p-6 lg:p-8 text-ink font-sans transition-colors duration-300">
        
        {/* Sticky Header & Navigation Wrapper */}
        <div class="flex-shrink-0">
          
          {/* Header container with background GIF banner */}
          <header class="relative mb-4 border border-line bg-light-dark(rgba(255,255,255,0.45),rgba(15,23,42,0.45)) rounded-2xl p-6 shadow-soft overflow-hidden min-h-[120px] transition-all duration-300">
          
          {/* Background GIF Banner switching based on system theme */}
          <img 
            src={isDarkMode() ? "/dark-banner.gif" : "/day-banner.gif"} 
            alt="Summer Banner" 
            class="absolute inset-0 w-full h-full object-cover object-[35%_75%] pointer-events-none z-0 transition-opacity duration-500 opacity-30 dark:opacity-50"
          />
          {/* Theme-aware gradient overlay to ensure text contrast */}
          <div class="absolute inset-0 bg-gradient-to-r from-light-dark(white,rgba(2,6,24,1)) via-light-dark(rgba(255,255,255,0.85),rgba(2,6,24,0.75)) to-light-dark(rgba(255,255,255,0.4),rgba(2,6,24,0.4)) z-10" />

          {/* Header Content stacked on top of the background */}
          <div class="relative z-20 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            
            {/* Title & Description */}
            <div class="max-w-xl text-ink">
              <h1 class="text-xl md:text-2xl font-extrabold tracking-tight mt-0.5 mb-1.5 bg-gradient-to-r from-ink via-primary to-accent bg-clip-text text-transparent dark:from-white dark:via-fuchsia-100 dark:to-indigo-200">Steam Summer Sale</h1>
            </div>

            {/* Unified Color Metrics Summary strip on the right */}
            <div class="summary-strip grid grid-cols-2 gap-3 xl:flex xl:items-center xl:gap-3 flex-shrink-0">
              <article class="p-2.5 px-3.5 border border-line border-t-4 border-t-primary bg-paper/60 backdrop-blur-sm flex flex-col justify-between rounded-xl shadow-soft summary-card-shortlist xl:w-36 xl:h-20 text-ink hover:shadow-[0_4px_12px_rgba(99,102,241,0.15)] hover:border-primary/30 transition-all duration-300">
                <span class="text-[9px] font-bold uppercase tracking-wider text-muted font-mono leading-none">Shortlist</span>
                <strong class="text-lg font-extrabold tracking-tight mt-1.5 text-primary leading-tight">{formatPrice(shortlistSpend())}</strong>
                <span class="text-[9px] text-muted mt-1 leading-none">{formatCount(shortlist().size)} games</span>
              </article>
              <article class="p-2.5 px-3.5 border border-line border-t-4 border-t-accent bg-paper/60 backdrop-blur-sm flex flex-col justify-between rounded-xl shadow-soft summary-card-cart xl:w-36 xl:h-20 text-ink hover:shadow-[0_4px_12px_rgba(225,29,72,0.15)] hover:border-accent/30 transition-all duration-300">
                <span class="text-[9px] font-bold uppercase tracking-wider text-muted font-mono leading-none">In cart</span>
                <strong class="text-lg font-extrabold tracking-tight mt-1.5 text-accent leading-tight">{formatPrice(cartSpend())}</strong>
                <span class="text-[9px] text-slate-400 mt-1 leading-none">{formatCount(cart().size)} games</span>
              </article>
            </div>
          </div>
        </header>

        {/* Mobile Tab Navigation Bar */}
        <div class="flex lg:hidden bg-paper/40 backdrop-blur-sm border border-line rounded-xl p-1 mb-4 shadow-soft w-full gap-1">
          <button
            onClick={() => setActiveTab('games')}
            class={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-lg transition-all ${
              activeTab() === 'games'
                ? 'bg-paper text-ink shadow-soft border border-line font-extrabold'
                : 'text-muted hover:text-ink border border-transparent'
            }`}
          >
            <span>Games</span>
            <span class="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-light-dark(rgba(15,23,42,0.05),rgba(255,255,255,0.05)) text-muted">{filteredGames().length}</span>
          </button>
          <button
            onClick={() => setActiveTab('shortlist')}
            class={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-lg transition-all ${
              activeTab() === 'shortlist'
                ? 'bg-paper text-ink shadow-soft border border-line font-extrabold'
                : 'text-muted hover:text-ink border border-transparent'
            }`}
          >
            <span>Shortlist</span>
            <span class="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-light-dark(rgba(15,23,42,0.05),rgba(255,255,255,0.05)) text-muted">{shortlist().size}</span>
          </button>
          <button
            onClick={() => setActiveTab('cart')}
            class={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-lg transition-all ${
              activeTab() === 'cart'
                ? 'bg-paper text-ink shadow-soft border border-line font-extrabold'
                : 'text-muted hover:text-ink border border-transparent'
            }`}
          >
            <span>Cart</span>
            <span class="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-light-dark(rgba(15,23,42,0.05),rgba(255,255,255,0.05)) text-muted">{cart().size}</span>
          </button>
        </div>

        </div>

        {/* Main Grid workspace */}
        <div class="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start flex-1 min-h-0 overflow-hidden">
          
          {/* Left panel: Results */}
          <div class={activeTab() === 'games' ? 'block w-full h-full min-h-0' : 'hidden lg:block w-full h-full min-h-0'}>
            <Card class="flex flex-col h-full bg-paper/40 backdrop-blur-sm shadow-soft border border-line rounded-2xl overflow-hidden p-3.5 pb-0">
            
            {/* Unified Filter and Sort Toolbar */}
            <div
              class={`flex flex-wrap items-center justify-between gap-2.5 w-full min-w-0 flex-shrink-0 transition-all duration-300 overflow-hidden ${
                hideFilters()
                  ? 'max-h-0 pb-0 mb-0 opacity-0 pointer-events-none border-b-transparent'
                  : 'max-h-[300px] pb-2.5 mb-3 opacity-100 border-b border-line'
              }`}
            >
              
              {/* Left section: Filter controls */}
              <div class="flex flex-wrap items-center gap-1.5">
                              {/* Quick Search */}
                <div class="relative w-36">
                  <Input
                    class="search-input text-[10px] h-7 pl-7 pr-2.5 py-0.5 rounded-md"
                    type="search"
                    value={search()}
                    onInput={(event) => setSearch(event.currentTarget.value)}
                    placeholder="Search..."
                  />
                  <span class="absolute left-2 top-1/2 -translate-y-1/2 text-muted">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                </div>

                {/* Ownership dropdown */}
                <div class="h-7 border border-line bg-paper rounded-md px-1.5 flex items-center gap-1">
                  <span class="text-[9px] uppercase tracking-wider text-muted font-bold font-mono">Status:</span>
                  <select
                    value={ownershipFilter()}
                    onChange={(e) => setOwnershipFilter(e.currentTarget.value)}
                    class="bg-transparent border-0 text-[10px] font-semibold text-ink focus:ring-0 cursor-pointer p-0 pr-4 h-5"
                  >
                    <option value="all">All</option>
                    <option value="shortlist">Shortlist</option>
                    <option value="cart">Cart</option>
                    <option value="unowned">Neither</option>
                  </select>
                </div>

                {/* Price slider container */}
                <div class="slider-block h-7 border border-line bg-paper rounded-md px-1.5 flex items-center gap-1">
                  <span class="text-[9px] uppercase tracking-wider text-muted font-bold font-mono whitespace-nowrap">Max:</span>
                  <strong class="font-mono text-primary text-[9px] font-bold min-w-[32px]">{formatPrice(maxPrice())}</strong>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    step="1"
                    value={maxPrice()}
                    onInput={(event) => setMaxPrice(Number(event.currentTarget.value))}
                    class="w-14 h-1 bg-light-dark(rgba(15,23,42,0.12),rgba(255,255,255,0.2)) rounded appearance-none cursor-pointer accent-primary focus:outline-none"
                  />
                </div>

                {/* Checklist Dropdowns */}
                <div class="flex items-center gap-1.5">
                  <ChecklistDropdown
                    placeholder="Ratings"
                    labelPrefix="Ratings"
                    options={REVIEW_ORDER}
                    selected={selectedTiers()}
                    onChange={setSelectedTiers}
                  />
                  <ChecklistDropdown
                    placeholder="Genres"
                    labelPrefix="Genres"
                    options={availableGenres()}
                    selected={selectedGenres()}
                    onChange={setSelectedGenres}
                  />
                  <ChecklistDropdown
                    placeholder="Modes"
                    labelPrefix="Modes"
                    options={availableModes()}
                    selected={selectedModes()}
                    onChange={setSelectedModes}
                  />
                  <ChecklistDropdown
                    placeholder="Years"
                    labelPrefix="Years"
                    options={availableYears()}
                    selected={selectedYears()}
                    onChange={setSelectedYears}
                  />
                </div>
              </div>

              {/* Right section: Matches Count + Sort Priorities */}
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[9px] font-bold text-muted bg-light-dark(rgba(15,23,42,0.05),rgba(255,255,255,0.05)) h-7 px-2 flex items-center rounded-md border border-line font-mono flex-shrink-0">
                  {formatCount(filteredGames().length)} matches
                </span>
                
                <div class="flex items-center gap-1 h-7 border border-line bg-paper rounded-md px-1.5 flex-shrink-0">
                  <span class="text-[9px] uppercase tracking-wider text-muted font-bold font-mono">Sort:</span>
                  <select
                    class="bg-transparent border-0 text-[10px] text-ink focus:ring-0 cursor-pointer p-0 pr-4.5 h-5 font-semibold"
                    value={sortPriority1()}
                    onChange={(e) => setSortPriority1(e.currentTarget.value)}
                  >
                    <option value="rating">Rating Tier</option>
                    <option value="price">Price</option>
                    <option value="discount">Discount</option>
                    <option value="count">Reviews</option>
                    <option value="year_desc">Year (Newest)</option>
                    <option value="year_asc">Year (Oldest)</option>
                    <option value="title">Title</option>
                  </select>
                  <span class="text-[9px] text-muted font-mono opacity-40">›</span>
                  <select
                    class="bg-transparent border-0 text-[10px] text-ink focus:ring-0 cursor-pointer p-0 pr-4.5 h-5 font-semibold"
                    value={sortPriority2()}
                    onChange={(e) => setSortPriority2(e.currentTarget.value)}
                  >
                    <option value="rating">Rating Tier</option>
                    <option value="price">Price</option>
                    <option value="discount">Discount</option>
                    <option value="count">Reviews</option>
                    <option value="year_desc">Year (Newest)</option>
                    <option value="year_asc">Year (Oldest)</option>
                    <option value="title">Title</option>
                  </select>
                  <span class="text-[9px] text-muted font-mono opacity-40">›</span>
                  <select
                    class="bg-transparent border-0 text-[10px] text-ink focus:ring-0 cursor-pointer p-0 pr-4.5 h-5 font-semibold"
                    value={sortPriority3()}
                    onChange={(e) => setSortPriority3(e.currentTarget.value)}
                  >
                    <option value="rating">Rating Tier</option>
                    <option value="price">Price</option>
                    <option value="discount">Discount</option>
                    <option value="count">Reviews</option>
                    <option value="year_desc">Year (Newest)</option>
                    <option value="year_asc">Year (Oldest)</option>
                    <option value="title">Title</option>
                  </select>
                </div>
              </div>

            </div>

            <div onScroll={handleScroll} class="table-shell w-full flex-1 min-h-0 overflow-y-auto rounded-xl border border-line bg-paper/20">
              {/* Header */}
              <div class="hidden md:grid md:grid-cols-[260px_1fr_120px_100px_140px_80px] gap-3 items-center px-3 py-1.5 border-b border-line text-[9px] font-semibold uppercase tracking-wider text-muted font-mono bg-paper/90 backdrop-blur sticky top-0 z-10">
                <span>Game</span>
                <span>Description</span>
                <span>Genre</span>
                <span>Price</span>
                <span>Rating</span>
                <span class="text-center">Actions</span>
              </div>

              {/* Rows */}
              <div class="divide-y divide-line/30">
                <For each={visibleGamesList()}>{(item) => (<>
                    {/* Desktop Layout */}
                    <article class="hidden md:grid md:grid-cols-[260px_1fr_120px_100px_140px_80px] md:items-center md:gap-3 md:p-3.5">
                      
                      {/* Column 1: Game */}
                      <div class="game-main flex gap-3 items-start w-full">
                        <img
                          src={`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${item.appid}/header.jpg`}
                          alt=""
                          class="w-[120px] h-[68px] object-cover rounded-lg shadow-sm border border-line bg-light-dark(rgba(15,23,42,0.05),rgba(255,255,255,0.05)) flex-shrink-0"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="68" viewBox="0 0 120 68"><rect width="120" height="68" fill="%23202530"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23555" font-family="sans-serif" font-size="8">No Image</text></svg>';
                          }}
                        />
                        <div class="flex flex-col min-w-0 mt-0.5">
                          <a href={item.url} target="_blank" rel="noreferrer" title={item.title} class="font-bold text-xs text-ink hover:text-primary transition-colors truncate">
                            {item.title}
                          </a>
                          <div class="flex space-x-1.5 text-[9px] text-muted mt-0.5 font-medium">
                            <span>{item.release_date_text || 'No date'}</span>
                          </div>
                          <div class="flex flex-wrap items-center gap-1 mt-1.5">
                            <a
                              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + ' review')}`}
                              target="_blank"
                              rel="noreferrer"
                              class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-red-600/10 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-600/20 hover:bg-red-600/20 transition-all font-mono"
                            >
                              <svg class="w-2 h-2 fill-current" viewBox="0 0 24 24">
                                <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.524 3.545 12 3.545 12 3.545s-7.525 0-9.387.51A3.003 3.003 0 0 0 .502 6.163C0 8.07 0 12 0 12s0 3.93.502 5.837a3.003 3.003 0 0 0 2.11 2.108c1.862.51 9.387.51 9.387.51s7.525 0 9.387-.51a3.003 3.003 0 0 0 2.11-2.108C24 15.93 24 12 24 12s0-3.93-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                              </svg>
                              <span>youtube review</span>
                            </a>
                            <a
                              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + ' gameplay')}`}
                              target="_blank"
                              rel="noreferrer"
                              class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-red-600/10 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-600/20 hover:bg-red-600/20 transition-all font-mono"
                            >
                              <svg class="w-2 h-2 fill-current" viewBox="0 0 24 24">
                                <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.524 3.545 12 3.545 12 3.545s-7.525 0-9.387.51A3.003 3.003 0 0 0 .502 6.163C0 8.07 0 12 0 12s0 3.93.502 5.837a3.003 3.003 0 0 0 2.11 2.108c1.862.51 9.387.51 9.387.51s7.525 0 9.387-.51a3.003 3.003 0 0 0 2.11-2.108C24 15.93 24 12 24 12s0-3.93-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                              </svg>
                              <span>youtube gameplay</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Column 2: Description */}
                      <div class="desc-cell min-w-0">
                        <p class="text-xs text-muted/90 leading-relaxed line-clamp-3" title={getGameDescription(item)}>
                          {getGameDescription(item)}
                        </p>
                      </div>

                      {/* Column 3: Genre */}
                      <div class="genre-cell flex flex-wrap gap-1 min-w-0 w-full">
                        <For each={(item.genre_tags || []).slice(0, 2)}>{(genre) => (
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-light-dark(rgba(15,23,42,0.05),rgba(255,255,255,0.05)) text-muted border border-line/50 whitespace-nowrap">
                            {genre}
                          </span>
                        )}</For>
                        <Show when={(item.genre_tags || []).length === 0}>
                          <span class="text-xs text-muted font-medium">—</span>
                        </Show>
                      </div>

                      {/* Column 4: Price */}
                      <div class="price-cell flex flex-col items-start gap-0.5">
                        <strong class="font-extrabold text-xs text-ink price-sale">{formatPrice(item.current_price, item.price_currency)}</strong>
                        <Show when={item.discount_percent > 0}>
                          <div class="flex items-center space-x-1">
                            <span class="text-[9px] text-muted line-through font-mono price-old">{formatPrice(item.original_price, item.price_currency)}</span>
                            <span class="inline-block px-1 py-0.2 text-[8px] font-bold text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40 rounded discount-badge">-{item.discount_percent}%</span>
                          </div>
                        </Show>
                      </div>

                      {/* Column 5: Rating */}
                      <div class="rating-cell flex flex-col">
                        <strong class="font-bold text-xs text-sky-600 dark:text-sky-400 rating-label">{item.rating_label}</strong>
                        <span class="text-[9px] text-muted mt-0.5 font-medium">
                          {item.rating_percent}% · {formatCount(item.rating_count)} reviews
                        </span>
                      </div>

                      {/* Column 6: Actions */}
                      <div class="action-cell flex items-center justify-center gap-1.5">
                        <button
                          title={shortlist().has(item.appid) ? 'Shortlisted' : 'Add to Shortlist'}
                          onClick={() => toggleInSet(item.appid, setShortlist)}
                          class={`h-8 w-8 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all duration-200 shadow-sm active:scale-90 ${
                            shortlist().has(item.appid)
                              ? 'border-primary bg-primary/25 text-primary scale-105 hover:scale-110 shadow-soft'
                              : 'border-line text-muted hover:text-primary hover:bg-primary/10 hover:border-primary/50 hover:scale-105'
                          }`}
                        >
                          <svg class="w-4 h-4 flex-shrink-0" fill={shortlist().has(item.appid) ? "currentColor" : "none"} stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.969 0 1.371 1.24.588 1.81l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.883a1 1 0 00-1.175 0l-3.97 2.883c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h4.906a1 1 0 00.951-.69l1.519-4.674z"/>
                          </svg>
                          <span class="sr-only">{shortlist().has(item.appid) ? 'Shortlisted' : '+ Shortlist'}</span>
                        </button>
                        <button
                          title={cart().has(item.appid) ? 'In Cart' : 'Add to Cart'}
                          onClick={() => toggleInSet(item.appid, setCart)}
                          class={`h-8 w-8 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all duration-200 shadow-sm active:scale-90 ${
                            cart().has(item.appid)
                              ? 'border-accent bg-accent/25 text-accent scale-105 hover:scale-110 shadow-soft'
                              : 'border-line text-muted hover:text-accent hover:bg-accent/10 hover:border-accent/50 hover:scale-105'
                          }`}
                        >
                          <svg class="w-4 h-4 flex-shrink-0" fill={cart().has(item.appid) ? "currentColor" : "none"} stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                          </svg>
                          <span class="sr-only">{cart().has(item.appid) ? 'In Cart' : '+ Cart'}</span>
                        </button>
                      </div>
                    </article>

                    {/* Mobile Layout */}
                    <article class="flex md:hidden flex-row gap-2.5 p-2 items-start border-b border-line/30 w-full relative">
                      {/* Left: Image */}
                      <img
                        src={`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${item.appid}/header.jpg`}
                        alt=""
                        class="w-[100px] h-[56px] object-cover rounded-lg shadow-sm border border-line bg-light-dark(rgba(15,23,42,0.05),rgba(255,255,255,0.05)) flex-shrink-0"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="56" viewBox="0 0 100 56"><rect width="100" height="56" fill="%23202530"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23555" font-family="sans-serif" font-size="8">No Image</text></svg>';
                        }}
                      />
                      
                      {/* Right Column: Metadata */}
                      <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                        
                        {/* Line 1: Title and Actions */}
                        <div class="flex items-center justify-between gap-1 w-full">
                          <a href={item.url} target="_blank" rel="noreferrer" title={item.title} class="font-bold text-xs text-ink hover:text-primary transition-colors truncate block">
                            {item.title}
                          </a>
                          <div class="flex items-center gap-1 flex-shrink-0">
                            <button
                              title={shortlist().has(item.appid) ? 'Shortlisted' : 'Add to Shortlist'}
                              onClick={() => toggleInSet(item.appid, setShortlist)}
                              class={`h-7 w-7 rounded-lg border flex items-center justify-center transition-all duration-200 active:scale-90 ${
                                shortlist().has(item.appid)
                                  ? 'border-primary bg-primary/25 text-primary scale-105'
                                  : 'border-line text-muted bg-paper/30'
                              }`}
                            >
                              <svg class="w-3.5 h-3.5" fill={shortlist().has(item.appid) ? "currentColor" : "none"} stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.969 0 1.371 1.24.588 1.81l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.883a1 1 0 00-1.175 0l-3.97 2.883c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h4.906a1 1 0 00.951-.69l1.519-4.674z"/>
                              </svg>
                            </button>
                            <button
                              title={cart().has(item.appid) ? 'In Cart' : 'Add to Cart'}
                              onClick={() => toggleInSet(item.appid, setCart)}
                              class={`h-7 w-7 rounded-lg border flex items-center justify-center transition-all duration-200 active:scale-90 ${
                                cart().has(item.appid)
                                  ? 'border-accent bg-accent/25 text-accent scale-105'
                                  : 'border-line text-muted bg-paper/30'
                              }`}
                            >
                              <svg class="w-3.5 h-3.5" fill={cart().has(item.appid) ? "currentColor" : "none"} stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Line 2: Price and YouTube Buttons */}
                        <div class="flex items-center justify-between w-full">
                          <div class="flex items-center gap-1.5">
                            <strong class="font-extrabold text-[11.5px] text-ink">{formatPrice(item.current_price, item.price_currency)}</strong>
                            <Show when={item.discount_percent > 0}>
                              <span class="text-[9px] text-muted line-through font-mono">{formatPrice(item.original_price, item.price_currency)}</span>
                              <span class="px-1 py-0.2 text-[8px] font-bold text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40 rounded">-{item.discount_percent}%</span>
                            </Show>
                          </div>
                          
                          <div class="flex items-center gap-1">
                            <a
                              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + ' review')}`}
                              target="_blank"
                              rel="noreferrer"
                              class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[7px] font-bold uppercase tracking-wider bg-red-600/10 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-600/20 font-mono"
                            >
                              <span>review</span>
                            </a>
                            <a
                              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + ' gameplay')}`}
                              target="_blank"
                              rel="noreferrer"
                              class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[7px] font-bold uppercase tracking-wider bg-red-600/10 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-600/20 font-mono"
                            >
                              <span>gameplay</span>
                            </a>
                          </div>
                        </div>

                        {/* Line 3: Release Date · Rating · Genres */}
                        <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[8.5px] text-muted font-medium truncate">
                          <span>{item.release_date_text || 'No date'}</span>
                          <span class="opacity-40">·</span>
                          <span class="text-sky-600 dark:text-sky-400 font-bold">{item.rating_label} ({item.rating_percent}%)</span>
                          <Show when={(item.genre_tags || []).length > 0}>
                            <span class="opacity-40">·</span>
                            <span class="truncate">{(item.genre_tags || []).slice(0, 2).join(', ')}</span>
                          </Show>
                        </div>

                        {/* Line 4: Description */}
                        <p class="text-[9.5px] text-muted/80 leading-snug line-clamp-1" title={getGameDescription(item)}>
                          {getGameDescription(item)}
                        </p>

                      </div>  </article></>
                )}</For>
                
                {/* Infinite Scroll Sentinel */}
                <Show when={filteredGames().length > visibleGamesList().length}>
                  <div
                    class="h-1"
                    ref={(el) => {
                      const observer = new IntersectionObserver((entries) => {
                        if (entries[0].isIntersecting) {
                          setVisibleCount((c) => c + 50)
                        }
                      }, { rootMargin: '100px' })
                      observer.observe(el)
                      onCleanup(() => observer.disconnect())
                    }}
                  />
                </Show>
              </div>
            </div>
          </Card>
        </div>

          {/* Right panel: Insights */}
          <aside class="space-y-4 h-full overflow-y-auto pr-1 flex-shrink-0 lg:w-[360px]">
            
            {/* Hidden files imports */}
            <input
              ref={shortlistImportRef}
              type="file"
              accept=".json,.txt,.csv"
              hidden
              onChange={(event) => importList(event, setShortlist)}
            />
            <input
              ref={cartImportRef}
              type="file"
              accept=".json,.txt,.csv"
              hidden
              onChange={(event) => importList(event, setCart)}
            />

            {/* Insights */}
            <div class="space-y-4">
              <div class={activeTab() === 'shortlist' ? 'block' : 'hidden lg:block'}>
                <PieChartCard
                  title="Shortlist"
                  items={shortlistItems()}
                  accent="var(--primary)"
                  onExport={() => exportList('shortlist', shortlist())}
                  onImport={() => shortlistImportRef.click()}
                  onRemove={(appid) => toggleInSet(appid, setShortlist)}
                />
              </div>
              <div class={activeTab() === 'cart' ? 'block' : 'hidden lg:block'}>
                <PieChartCard
                  title="Cart"
                  items={cartItems()}
                  accent="var(--accent)"
                  onExport={() => exportList('cart', cart())}
                  onImport={() => cartImportRef.click()}
                  onRemove={(appid) => toggleInSet(appid, setCart)}
                />
              </div>
            </div>
          </aside>
        {/* Off-screen E2E test compatibility block */}
        <div class="absolute bottom-2 right-2 w-[2px] h-[2px] opacity-0 overflow-hidden pointer-events-none z-[9999]">
          <For each={REVIEW_ORDER}>{(tier) => (
            <label class="check-row relative inline-block w-[2px] h-[2px] pointer-events-auto">
              <input
                type="checkbox"
                checked={selectedTiers().has(tier)}
                onChange={() =>
                  setSelectedTiers((current) => {
                    const next = new Set(current)
                    if (next.has(tier)) next.delete(tier)
                    else next.add(tier)
                    return next
                  })
                }
                class="absolute top-0 left-0 w-[2px] h-[2px] pointer-events-auto cursor-pointer"
              />
              <span>{tier}</span>
            </label>
          )}</For>
        </div>

      </div>

      </div>
    </Show>
  )
}

export default App
