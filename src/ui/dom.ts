/**
 * The smallest amount of DOM plumbing the screens need.
 *
 * No framework: this is a handful of screens, and the spec says React has to earn
 * its place. What these screens actually need is element creation that reads like
 * the markup it produces, so that reviewing a screen means reading one function.
 */
type Attributes = Record<string, string | undefined>

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)

  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue
    if (name === 'class') node.className = value
    else if (name.startsWith('data-')) node.setAttribute(name, value)
    else node.setAttribute(name, value)
  }

  node.append(...children)
  return node
}

export function button(
  label: string,
  onClick: () => void,
  attributes: Attributes = {},
): HTMLButtonElement {
  const node = el('button', { type: 'button', ...attributes }, [label])
  node.addEventListener('click', onClick)
  return node
}

export function clear(node: HTMLElement): void {
  node.replaceChildren()
}
