/** Shared section-nav class helper for liquid active / hover states. */
export function sectionNavClass(isActive: boolean): string {
  return [
    'vs-nav-item flex min-h-10 min-w-max items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium leading-5',
    isActive
      ? 'vs-nav-item--active'
      : 'text-vs-shade-700 hover:bg-vs-shade-100 hover:text-vs-shade-900',
  ].join(' ');
}
