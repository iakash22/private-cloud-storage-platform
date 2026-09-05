import { randomBytes } from 'node:crypto';

export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug.length > 0 ? slug : 'org';
}

export function uniqueSlug(name: string): string {
  return `${slugifyName(name)}-${randomBytes(3).toString('hex')}`;
}
