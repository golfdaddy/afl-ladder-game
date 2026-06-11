// Freakbet brand assets — the logo mark and the Freakazoid coin.
// Drawn inline so they theme with CSS and ship with zero asset requests.

export const FREAK_SYMBOL = 'Ƒ'

/** Format an amount of Freakazoids, e.g. Ƒ1,096.00 */
export function freaks(v: number): string {
  return `${FREAK_SYMBOL}${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** App mark: violet superellipse, lightning-struck F, a little unhinged. */
export function FreakbetLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Freakbet">
      <defs>
        <linearGradient id="fbGrad" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#fbGrad)" />
      {/* googly freak eyes */}
      <circle cx="15" cy="14" r="5" fill="white" />
      <circle cx="16.5" cy="15" r="2.4" fill="#0f172a" />
      <circle cx="30" cy="12" r="6.5" fill="white" />
      <circle cx="31.5" cy="13.5" r="3" fill="#0f172a" />
      {/* lightning bolt grin */}
      <path d="M14 28 L30 24 L24 31 L36 29 L18 40 L23 32 Z" fill="#a3e635" stroke="#0f172a" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

/** The Freakazoid: a coin that knows it isn't money. */
export function FreakCoin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Freakazoids" style={{ display: 'inline-block', verticalAlign: '-0.15em' }}>
      <circle cx="12" cy="12" r="11" fill="#a3e635" stroke="#365314" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="#365314" strokeWidth="0.8" strokeDasharray="2 1.5" />
      <text x="12" y="16.2" textAnchor="middle" fontSize="11.5" fontWeight="900" fontFamily="ui-sans-serif, system-ui" fill="#1a2e05">Ƒ</text>
    </svg>
  )
}

/** Swap the document chrome to Freakbet (title + favicon) in MULTI_ONLY builds. */
export function applyFreakbetChrome() {
  document.title = 'Freakbet — bet your Freakazoids'
  const logoSvg = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#6d28d9"/></linearGradient></defs><rect x="2" y="2" width="44" height="44" rx="14" fill="url(#g)"/><circle cx="15" cy="14" r="5" fill="white"/><circle cx="16.5" cy="15" r="2.4" fill="#0f172a"/><circle cx="30" cy="12" r="6.5" fill="white"/><circle cx="31.5" cy="13.5" r="3" fill="#0f172a"/><path d="M14 28 L30 24 L24 31 L36 29 L18 40 L23 32 Z" fill="#a3e635" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round"/></svg>`
  const href = `data:image/svg+xml,${encodeURIComponent(logoSvg)}`
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = 'image/svg+xml'
  link.href = href
}
