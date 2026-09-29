// Super Sevens brand — emerald/teal, a bold 7. Distinct from Freakbet's violet.

/** App mark: rounded square with a stylised 7 on a footy-green gradient. */
export function SevensLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Super Sevens">
      <defs>
        <linearGradient id="ssGrad" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#ssGrad)" />
      <path d="M15 15 H34 L23 36" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="33" cy="33" r="3.5" fill="#fbbf24" stroke="white" strokeWidth="1.2" />
    </svg>
  )
}

/** Apply Super Sevens document chrome in SEVENS_ONLY builds. */
export function applySevensChrome() {
  document.title = 'Super Sevens — pick your seven'
  const logoSvg = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#0d9488"/></linearGradient></defs><rect x="2" y="2" width="44" height="44" rx="13" fill="url(#g)"/><path d="M15 15 H34 L23 36" stroke="white" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="33" cy="33" r="3.5" fill="#fbbf24" stroke="white" stroke-width="1.2"/></svg>`
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

export const SLOT_LABELS: Record<string, string> = {
  BACK: 'Defender',
  MID: 'Midfielder',
  RUCK: 'Ruck',
  FWD: 'Forward',
}

export const SLOT_SHORT: Record<string, string> = {
  BACK: 'DEF',
  MID: 'MID',
  RUCK: 'RUC',
  FWD: 'FWD',
}
