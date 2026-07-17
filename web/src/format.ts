export interface FormatItem {
  name: string;
  quantity: number;
}

export function formatItemList(items: FormatItem[]): string {
  if (items.length === 0) return 'No items';
  return items.map((item) => `${item.quantity} x ${item.name}`).join(', ');
}

export function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}
