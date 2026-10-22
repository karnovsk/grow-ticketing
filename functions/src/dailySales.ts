// Per-day sales totals for the staff app's Statistics tab: one document per
// calendar day that had at least one sale, keyed 'YYYY-MM-DD'. Tickets get
// archived after a while, but these totals never do, so the sales history
// stays complete. Kept in sync with web/src/format.ts's salesDayKey.
export const DAILY_SALES_COLLECTION = 'dailySales';

// The venue's local day — the same zone archiveOldTicketsScheduled runs in.
export const SALES_TIME_ZONE = 'Asia/Jerusalem';

// en-CA formats dates as YYYY-MM-DD, which sorts chronologically as a string.
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: SALES_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function salesDayKey(date: Date): string {
  return dayFormat.format(date);
}

export interface DailySales {
  date: string;
  tickets: number;
  revenue: number;
}
