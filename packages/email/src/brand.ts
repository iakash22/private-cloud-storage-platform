/** Dashboard-aligned email theme tokens (see apps/dashboard/src/index.css). */
export const EMAIL_BRAND = {
  productName: 'VaultStack',
  tagline: 'Private cloud control plane',
  ink: '#0f172a',
  paper: '#f8fafc',
  muted: '#64748b',
  line: '#e2e8f0',
  sky: '#38bdf8',
  blue: '#2563eb',
  shade100: '#f1f5f9',
  shade800: '#1e293b',
  fontDisplay: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
  fontSans: "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

/** Inline SVG logo matching apps/dashboard BrandLogo gradient shield. */
export function brandLogoSvg(size = 48): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="VaultStack">
  <defs>
    <linearGradient id="vsEmailGrad" x1="8" y1="8" x2="56" y2="56">
      <stop stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="#f8fafc"/>
  <path d="M18 20.5 32 14l14 6.5v9.2c0 9.3-5.6 16.3-14 20.3-8.4-4-14-11-14-20.3v-9.2Z" fill="url(#vsEmailGrad)"/>
  <path d="m24 31 5.2 5.2L40.5 25" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/>
</svg>`;
}
