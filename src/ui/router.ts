export type ScreenId = 'setup' | 'home' | 'session' | 'settings' | 'results'

export type RouteParams = Record<string, string>

export interface Nav {
  /**
   * Navigate to a screen, pushing a history entry.
   *
   * `params` become query parameters on the hash, so a route is fully described by
   * the URL and survives a reload or a back/forward.
   */
  go(screen: ScreenId, params?: RouteParams, detail?: string): void
  /** Replace the current entry instead of pushing — for redirects that should not be gone "back" to. */
  replace(screen: ScreenId, params?: RouteParams, detail?: string): void
  /** Step back through history, exactly as the browser button does. */
  back(): void
  /** Params of the route currently rendered. */
  params(): RouteParams
  /** The path segment after the screen, e.g. `divergence` in `#/session/divergence`. */
  detail(): string | null
  current(): ScreenId
}

/** A screen renders into root and optionally returns a teardown function. */
export type Screen = (root: HTMLElement, nav: Nav) => void | (() => void)

const DEFAULT_SCREEN: ScreenId = 'home'

function isScreenId(value: string, screens: Record<ScreenId, Screen>): value is ScreenId {
  return Object.prototype.hasOwnProperty.call(screens, value)
}

/**
 * `#/session/divergence?x=1` → `{ screen: 'session', detail: 'divergence', params: { x: '1' } }`
 *
 * The segment after the screen names *what* the screen is showing, so a running
 * exercise is identifiable from the URL rather than every session looking alike.
 */
function parseHash(hash: string, screens: Record<ScreenId, Screen>): {
  screen: ScreenId
  detail: string | null
  params: RouteParams
} {
  const raw = hash.replace(/^#\/?/, '')
  const [path = '', query = ''] = raw.split('?')
  const [head = '', tail] = path.split('/')
  const params: RouteParams = {}
  for (const [key, value] of new URLSearchParams(query)) params[key] = value
  return {
    screen: isScreenId(head, screens) ? head : DEFAULT_SCREEN,
    detail: tail ? decodeURIComponent(tail) : null,
    params,
  }
}

function buildHash(screen: ScreenId, params: RouteParams, detail?: string): string {
  const query = new URLSearchParams(params).toString()
  const segment = detail ? `/${encodeURIComponent(detail)}` : ''
  return `#/${screen}${segment}${query ? `?${query}` : ''}`
}

/**
 * Hash routing over the single-page shell.
 *
 * Everything used to live on one URL with the screens keeping their own internal
 * state, which meant the browser back button did nothing — you would press it
 * mid-exercise expecting to escape and the page would sit there, or leave the app
 * entirely. Each screen now owns a real history entry, so back means what it looks
 * like it means and a route can be linked, reloaded and shared.
 *
 * Hash rather than pathname routing because this is served as a static bundle with
 * no server to rewrite deep links; `#/results` resolves without any server config.
 */
export function createRouter(root: HTMLElement, screens: Record<ScreenId, Screen>): Nav {
  let teardown: (() => void) | void
  let current: ScreenId = DEFAULT_SCREEN
  let currentParams: RouteParams = {}
  let currentDetail: string | null = null

  function render(screen: ScreenId, params: RouteParams, detail: string | null): void {
    if (typeof teardown === 'function') teardown()
    root.replaceChildren()
    current = screen
    currentParams = params
    currentDetail = detail
    teardown = screens[screen](root, nav)
  }

  function navigate(
    screen: ScreenId,
    params: RouteParams,
    mode: 'push' | 'replace',
    detail?: string,
  ): void {
    const hash = buildHash(screen, params, detail)
    if (window.location.hash === hash) {
      // Same URL: re-render anyway so callers can use go() as a refresh.
      render(screen, params, detail ?? null)
      return
    }
    // Writing the hash fires `hashchange`, which is where the render happens, so
    // typing a URL by hand and clicking a link both go down one path.
    if (mode === 'replace') {
      window.history.replaceState(null, '', hash)
      render(screen, params, detail ?? null)
    } else {
      window.location.hash = hash
    }
  }

  const nav: Nav = {
    go: (screen, params = {}, detail) => navigate(screen, params, 'push', detail),
    replace: (screen, params = {}, detail) => navigate(screen, params, 'replace', detail),
    back: () => window.history.back(),
    params: () => ({ ...currentParams }),
    detail: () => currentDetail,
    current: () => current,
  }

  window.addEventListener('hashchange', () => {
    const { screen, params, detail } = parseHash(window.location.hash, screens)
    render(screen, params, detail)
  })

  return nav
}

/** Small helper so screens can build DOM without a framework. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  const { class: className, ...rest } = props
  if (className) node.className = className
  Object.assign(node, rest)
  node.append(...children)
  return node
}
