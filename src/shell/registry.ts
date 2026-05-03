import type { Exhibit } from './Exhibit';

const exhibits: Exhibit[] = [];

export function registerExhibit(exhibit: Exhibit): void {
  if (exhibits.some((e) => e.id === exhibit.id)) {
    throw new Error(`Exhibit with id "${exhibit.id}" already registered`);
  }
  exhibits.push(exhibit);
}

export function listExhibits(): readonly Exhibit[] {
  return exhibits;
}

export function firstExhibit(): Exhibit | undefined {
  return exhibits[0];
}
