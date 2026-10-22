import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebaseClient';
import { formatAmount, salesDayKey } from './format';
import { t, localeTag } from './i18n';

// One document per calendar day that had a sale, written by the webhook as
// each ticket is issued (functions/src/dailySales.ts). These are never
// archived, so this is the complete sales history.
interface DailySales {
  date: string;
  // Shown as "deals": one per Grow purchase, which can cover several
  // tickets — the webhook doesn't say how many.
  tickets: number;
  revenue: number;
}

type Metric = 'tickets' | 'revenue';

// A bar's date label is shown on every Nth bar only, so labels don't collide.
const LABEL_EVERY = 4;

export async function renderStatsView(container: HTMLElement) {
  container.innerHTML = `<p class="empty-state" role="status">…</p>`;
  let days: DailySales[];
  try {
    const snap = await getDocs(query(collection(db, 'dailySales'), orderBy('date', 'asc')));
    days = snap.docs.map((doc) => doc.data() as DailySales);
  } catch {
    renderLoadError(container);
    return;
  }

  const todayKey = salesDayKey(new Date());
  const today = days.find((day) => day.date === todayKey) ?? { date: todayKey, tickets: 0, revenue: 0 };

  container.innerHTML = `
    <section class="card stats-today" aria-labelledby="stats-today-heading">
      <h2 id="stats-today-heading" class="stats-heading"></h2>
      <dl class="stats-figures">
        <div>
          <dt>${t('statsDeals')}</dt>
          <dd id="stats-today-tickets"></dd>
        </div>
        <div>
          <dt>${t('statsRevenue')}</dt>
          <dd id="stats-today-revenue"></dd>
        </div>
      </dl>
    </section>
    <section class="card stats-history" aria-labelledby="stats-history-heading">
      <h2 id="stats-history-heading" class="stats-heading">${t('statsHistoryHeading')}</h2>
    </section>
  `;
  container.querySelector('#stats-today-heading')!.textContent = t('statsTodayHeading', {
    date: formatDay(todayKey, 'long'),
  });
  container.querySelector('#stats-today-tickets')!.textContent = formatCount(today.tickets);
  container.querySelector('#stats-today-revenue')!.textContent = formatAmount(today.revenue);

  const history = container.querySelector<HTMLElement>('.stats-history')!;
  if (days.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = t('statsEmpty');
    history.appendChild(empty);
    return;
  }
  renderChart(history, days, todayKey);
}

function renderLoadError(container: HTMLElement) {
  container.innerHTML = `
    <div class="card stats-error" role="alert">
      <p>${t('statsLoadError')}</p>
      <button type="button" class="btn btn-secondary">${t('statsRetry')}</button>
    </div>
  `;
  container.querySelector('button')!.addEventListener('click', () => renderStatsView(container));
}

function renderChart(history: HTMLElement, days: DailySales[], todayKey: string) {
  let metric: Metric = 'tickets';
  // The readout starts on the latest day before today — today already has
  // its own figures above.
  const pastDays = days.filter((day) => day.date !== todayKey);
  let selected = (pastDays[pastDays.length - 1] ?? days[days.length - 1]).date;

  const toggle = document.createElement('div');
  toggle.className = 'stats-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', t('statsMetricLabel'));
  const metricButtons = (['tickets', 'revenue'] as Metric[]).map((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t(value === 'tickets' ? 'statsDeals' : 'statsRevenue');
    button.addEventListener('click', () => {
      metric = value;
      draw();
    });
    toggle.appendChild(button);
    return { value, button };
  });

  const chart = document.createElement('div');
  chart.className = 'stats-chart';
  const axis = document.createElement('div');
  axis.className = 'stats-axis';
  axis.setAttribute('aria-hidden', 'true');
  const scroller = document.createElement('div');
  scroller.className = 'stats-scroller';
  const plot = document.createElement('div');
  plot.className = 'stats-plot stats-plot-enter';
  scroller.appendChild(plot);
  chart.append(axis, scroller);

  const readout = document.createElement('p');
  readout.className = 'stats-readout';
  readout.setAttribute('aria-live', 'polite');

  const hint = document.createElement('p');
  hint.className = 'stats-hint';
  hint.textContent = t('statsChartHint');

  history.append(toggle, chart, readout, hint);

  const bars = days.map((day, index) => {
    const column = document.createElement('button');
    column.type = 'button';
    column.className = 'stats-column';
    if (day.date === todayKey) column.classList.add('stats-column-today');
    const bar = document.createElement('span');
    bar.className = 'stats-bar';
    const label = document.createElement('span');
    label.className = 'stats-label';
    const previous = days[index - 1];
    const newYear = previous !== undefined && previous.date.slice(0, 4) !== day.date.slice(0, 4);
    if (index % LABEL_EVERY === 0 || index === days.length - 1 || newYear) {
      label.textContent = formatDay(day.date, newYear || index === 0 ? 'withYear' : 'short');
    }
    column.append(bar, label);
    column.setAttribute(
      'aria-label',
      t('statsDayReadout', {
        date: formatDay(day.date, 'long'),
        deals: dealsPhrase(day.tickets),
        revenue: formatAmount(day.revenue),
      }),
    );
    const select = () => {
      selected = day.date;
      draw();
    };
    column.addEventListener('click', select);
    column.addEventListener('focus', select);
    column.addEventListener('pointerenter', select);
    plot.appendChild(column);
    return { day, column, bar };
  });

  function draw() {
    for (const { value, button } of metricButtons) button.setAttribute('aria-pressed', String(value === metric));
    const max = niceCeiling(Math.max(...days.map((day) => day[metric])));
    axis.replaceChildren(
      ...[max, max / 2, 0].map((tick) => {
        const span = document.createElement('span');
        // A half-ticket tick (e.g. 1.5 when the top is 3) keeps its gridline
        // but goes unlabelled.
        if (Number.isInteger(tick)) {
          span.textContent = metric === 'revenue' ? formatAmount(tick) : formatCount(tick);
        }
        return span;
      }),
    );
    for (const { day, column, bar } of bars) {
      bar.style.blockSize = `${max === 0 ? 0 : (day[metric] / max) * 100}%`;
      column.classList.toggle('stats-column-selected', day.date === selected);
    }
    const day = days.find((candidate) => candidate.date === selected)!;
    readout.textContent = t('statsDayReadout', {
      date: formatDay(day.date, 'long'),
      deals: dealsPhrase(day.tickets),
      revenue: formatAmount(day.revenue),
    });
  }

  draw();
  // Open on the newest days; older history is a swipe away. Newest is at the
  // inline end, which in RTL is the left, where scrollLeft counts negative.
  const rtl = getComputedStyle(scroller).direction === 'rtl';
  scroller.scrollLeft = rtl ? -scroller.scrollWidth : scroller.scrollWidth;
}

// Rounds up to a clean number (1, 2, 3, 4, 5, 6 or 8 × a power of ten),
// fine-grained enough that the tallest bar fills most of the chart. Never
// below 2, so there's always a whole-number middle tick to show.
function niceCeiling(value: number): number {
  if (value <= 0) return 0;
  if (value <= 2) return 2;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 3, 4, 5, 6, 8, 10].find((candidate) => candidate * magnitude >= value)!;
  return step * magnitude;
}

function formatCount(count: number): string {
  return new Intl.NumberFormat(localeTag()).format(count);
}

function dealsPhrase(count: number): string {
  return count === 1 ? t('statsDealsOne') : t('statsDealsMany', { count: formatCount(count) });
}

// `date` is a 'YYYY-MM-DD' venue day, shown day-first like formatDateShort
// in both languages. Only the weekday name comes from Intl, read as a UTC
// date so the browser's own time zone can't shift it to a neighbouring day.
function formatDay(date: string, style: 'short' | 'withYear' | 'long'): string {
  const [year, month, day] = date.split('-');
  const dayMonth = `${Number(day)}/${Number(month)}`;
  if (style === 'short') return dayMonth;
  const withYear = `${dayMonth}/${year.slice(2)}`;
  if (style === 'withYear') return withYear;
  const weekday = new Intl.DateTimeFormat(localeTag(), { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
  return `${weekday} ${withYear}`;
}
