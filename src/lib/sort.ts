export type SortOrder = 'recent' | 'az' | 'za';

export interface SortableItem {
  title: string;
  mtime: number;
}

export function sortItems<T extends SortableItem>(items: T[], order: SortOrder): T[] {
  return [...items].sort((a, b) => {
    if (order === 'az') return a.title.localeCompare(b.title);
    if (order === 'za') return b.title.localeCompare(a.title);
    return b.mtime - a.mtime;
  });
}
