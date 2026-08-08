export type ScreenId = 'setup' | 'home' | 'session' | 'settings' | 'results'

export interface Nav {
  go(screen: ScreenId): void
}

/** A screen renders into root and optionally returns a teardown function. */
export type Screen = (root: HTMLElement, nav: Nav) => void | (() => void)

export function createRouter(root: HTMLElement, screens: Record<ScreenId, Screen>): Nav {
  let teardown: (() => void) | void

  const nav: Nav = {
    go(screen) {
      if (typeof teardown === 'function') teardown()
      root.replaceChildren()
      teardown = screens[screen](root, nav)
    },
  }

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
