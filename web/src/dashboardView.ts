import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebaseClient';
import { resendTicketEmail, validateTicket, invalidateTicket, TicketRecord } from './ticketApi';
import { formatItemList, formatTimestamp, formatDateShort } from './format';
import { fuzzyMatch } from './fuzzyMatch';
import { t } from './i18n';

const NONE = '—';
const FILTER_DEBOUNCE_MS = 150;

export async function renderDashboardView(container: HTMLElement) {
  container.innerHTML = `
    <div class="search-controls">
      <select id="status-filter">
        <option value="issued">${t('statusIssued')}</option>
        <option value="validated">${t('statusValidated')}</option>
        <option value="all">${t('statusAll')}</option>
      </select>
      <input id="ticket-filter" placeholder="${t('dashboardFilterPlaceholder')}" />
    </div>
    <ul id="ticket-list" class="ticket-list"></ul>
  `;
  const statusFilter = container.querySelector<HTMLSelectElement>('#status-filter')!;
  const ticketFilter = container.querySelector<HTMLInputElement>('#ticket-filter')!;
  const list = container.querySelector<HTMLUListElement>('#ticket-list')!;

  let currentTickets: TicketRecord[] = [];
  let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function load() {
    const constraints =
      statusFilter.value === 'all'
        ? [orderBy('issuedAt', 'desc')]
        : [where('status', '==', statusFilter.value), orderBy('issuedAt', 'desc')];
    const q = query(collection(db, 'tickets'), ...constraints);
    const snap = await getDocs(q);
    currentTickets = snap.docs.map((doc) => doc.data() as TicketRecord);
    renderList();
  }

  function renderList() {
    const filterText = ticketFilter.value;
    const tickets = filterText.trim()
      ? currentTickets.filter(
          (ticket) => fuzzyMatch(filterText, [ticket.customerName, ticket.customerEmail, ticket.customerPhone]) !== null,
        )
      : currentTickets;

    list.innerHTML = '';
    tickets.forEach((ticket) => list.appendChild(renderRow(ticket)));
  }

  function renderRow(ticket: TicketRecord): HTMLLIElement {
    const li = document.createElement('li');

    const dot = document.createElement('span');
    let dotClass = 'status-dot';
    if (ticket.status === 'validated') {
      dotClass += ' filled';
    } else if (ticket.emailStatus === 'failed') {
      dotClass += ' email-failed';
    }
    dot.className = dotClass;
    li.appendChild(dot);

    const summary = document.createElement('span');
    summary.className = 'ticket-summary';
    let validatedText = '';
    if (ticket.validatedAt) {
      validatedText = ticket.validatedByEmail
        ? ` ${t('dashboardValidatedBy', {
            time: formatTimestamp(ticket.validatedAt.seconds),
            staff: ticket.validatedByEmail,
          })}`
        : ` ${t('dashboardValidatedAt', { time: formatTimestamp(ticket.validatedAt.seconds) })}`;
    }
    summary.textContent = `${ticket.customerName}${validatedText}`;
    li.appendChild(summary);

    ticket.items.forEach((item) => {
      const badge = document.createElement('span');
      badge.className = 'qty-badge';
      badge.textContent = String(item.quantity);
      li.appendChild(badge);
    });

    const date = document.createElement('span');
    date.className = 'ticket-date';
    date.textContent = formatDateShort(ticket.issuedAt.seconds);
    li.appendChild(date);

    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    const openDetail = () => renderDetailModal(container, ticket, load);
    li.addEventListener('click', openDetail);
    li.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetail();
      }
    });

    return li;
  }

  statusFilter.addEventListener('change', load);
  ticketFilter.addEventListener('input', () => {
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(renderList, FILTER_DEBOUNCE_MS);
  });
  await load();
}

function fieldRow(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function renderEmailStatusRow(ticket: TicketRecord): HTMLParagraphElement {
  const row = document.createElement('p');
  row.className = 'modal-email-status';
  const label = document.createElement('span');
  label.textContent = t('dashboardDetailEmailStatus', {
    value: t(ticket.emailStatus === 'sent' ? 'dashboardDetailEmailStatusSent' : 'dashboardDetailEmailStatusFailed'),
  });
  row.appendChild(label);

  if (ticket.emailStatus === 'failed') {
    const resendButton = document.createElement('button');
    resendButton.type = 'button';
    resendButton.className = 'btn btn-secondary btn-small';
    resendButton.textContent = t('dashboardResendButton');
    resendButton.addEventListener('click', async () => {
      resendButton.disabled = true;
      const result = (await resendTicketEmail(ticket.ticketId)) as { sent: boolean };
      label.textContent = t('dashboardDetailEmailStatus', {
        value: t(result.sent ? 'dashboardDetailEmailStatusSent' : 'dashboardDetailEmailStatusFailed'),
      });
      resendButton.textContent = result.sent ? t('dashboardResendSuccess') : t('dashboardResendFailure');
      resendButton.disabled = result.sent;
    });
    row.appendChild(resendButton);
  }

  return row;
}

function renderDetailModal(container: HTMLElement, ticket: TicketRecord, onChanged: () => void) {
  const existing = container.querySelector('.modal-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) backdrop.remove();
  });

  const modal = document.createElement('div');
  modal.className = 'card modal';
  backdrop.appendChild(modal);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn btn-secondary btn-small modal-close';
  closeButton.textContent = t('dashboardDetailClose');
  closeButton.addEventListener('click', () => backdrop.remove());
  modal.appendChild(closeButton);

  const heading = document.createElement('h2');
  heading.textContent = ticket.customerName;
  modal.appendChild(heading);

  modal.appendChild(fieldRow(t('dashboardDetailTicketId', { value: ticket.ticketId })));
  modal.appendChild(fieldRow(t(ticket.status === 'validated' ? 'statusValidated' : 'statusIssued')));
  modal.appendChild(fieldRow(t('dashboardDetailCustomerEmail', { value: ticket.customerEmail })));
  modal.appendChild(fieldRow(t('dashboardDetailCustomerPhone', { value: ticket.customerPhone ?? NONE })));
  modal.appendChild(fieldRow(t('dashboardDetailTransactionCode', { value: ticket.transactionCode })));
  modal.appendChild(fieldRow(t('scanItemsLabel', { items: formatItemList(ticket.items) })));
  modal.appendChild(fieldRow(t('dashboardDetailPaymentSum', { value: String(ticket.paymentSum) })));
  modal.appendChild(fieldRow(t('dashboardDetailIssuedAt', { value: formatTimestamp(ticket.issuedAt.seconds) })));
  modal.appendChild(
    fieldRow(
      t('dashboardDetailValidatedAt', { value: ticket.validatedAt ? formatTimestamp(ticket.validatedAt.seconds) : NONE }),
    ),
  );
  modal.appendChild(fieldRow(t('dashboardDetailValidatedBy', { value: ticket.validatedByEmail ?? NONE })));
  const noteRow = fieldRow(t('dashboardDetailValidationNote', { value: ticket.validationNote ?? NONE }));
  noteRow.className = 'modal-note';
  modal.appendChild(noteRow);
  modal.appendChild(renderEmailStatusRow(ticket));

  const actions = document.createElement('div');
  actions.className = 'actions';
  modal.appendChild(actions);

  const feedback = document.createElement('p');
  feedback.className = 'field-error';
  modal.appendChild(feedback);

  if (ticket.status === 'issued') {
    renderValidateAction(actions, feedback, ticket, backdrop, onChanged);
  } else {
    renderInvalidateAction(actions, feedback, ticket, backdrop, onChanged);
  }

  container.appendChild(backdrop);
}

function renderValidateAction(
  actions: HTMLDivElement,
  feedback: HTMLParagraphElement,
  ticket: TicketRecord,
  backdrop: HTMLDivElement,
  onChanged: () => void,
) {
  const noteInput = document.createElement('input');
  noteInput.placeholder = t('searchNotePlaceholder');
  const validateButton = document.createElement('button');
  validateButton.type = 'button';
  validateButton.className = 'btn btn-primary';
  validateButton.textContent = t('searchValidateButton');
  validateButton.addEventListener('click', async () => {
    validateButton.disabled = true;
    try {
      const result = (await validateTicket(ticket.ticketId, noteInput.value)) as { ok: boolean };
      if (result.ok) {
        backdrop.remove();
        onChanged();
      } else {
        feedback.textContent = t('searchErrorSuffix');
        validateButton.disabled = false;
      }
    } catch {
      feedback.textContent = t('searchErrorSuffix');
      validateButton.disabled = false;
    }
  });
  actions.appendChild(noteInput);
  actions.appendChild(validateButton);
}

function renderInvalidateAction(
  actions: HTMLDivElement,
  feedback: HTMLParagraphElement,
  ticket: TicketRecord,
  backdrop: HTMLDivElement,
  onChanged: () => void,
) {
  function renderInitial() {
    actions.innerHTML = '';
    const invalidateButton = document.createElement('button');
    invalidateButton.type = 'button';
    invalidateButton.className = 'btn btn-secondary';
    invalidateButton.textContent = t('dashboardDetailInvalidateButton');
    invalidateButton.addEventListener('click', renderConfirming);
    actions.appendChild(invalidateButton);
  }

  function renderConfirming() {
    actions.innerHTML = '';
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'btn btn-primary';
    confirmButton.textContent = t('dashboardDetailInvalidateConfirm');
    confirmButton.addEventListener('click', async () => {
      confirmButton.disabled = true;
      try {
        const result = (await invalidateTicket(ticket.ticketId)) as { ok: boolean };
        if (result.ok) {
          backdrop.remove();
          onChanged();
        } else {
          feedback.textContent = t('searchErrorSuffix');
          renderInitial();
        }
      } catch {
        feedback.textContent = t('searchErrorSuffix');
        renderInitial();
      }
    });
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-secondary';
    cancelButton.textContent = t('dashboardDetailInvalidateCancel');
    cancelButton.addEventListener('click', renderInitial);
    actions.appendChild(confirmButton);
    actions.appendChild(cancelButton);
  }

  renderInitial();
}
