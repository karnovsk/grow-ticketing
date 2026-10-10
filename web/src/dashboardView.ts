import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebaseClient';
import { resendTicketEmail, validateTicket, invalidateTicket, TicketRecord } from './ticketApi';
import { collectItemNames, formatAmount, formatTimestamp, formatDateShort, itemNames } from './format';
import { fuzzyMatch } from './fuzzyMatch';
import { renderItemLine, icon, statusPill } from './itemTags';
import { t } from './i18n';

const NONE = '—';
const FILTER_DEBOUNCE_MS = 150;
const ALL_ITEMS = '';

export async function renderDashboardView(container: HTMLElement) {
  container.innerHTML = `
    <div class="search-controls">
      <select id="status-filter" aria-label="${t('dashboardDetailStatus')}">
        <option value="issued">${t('statusIssued')}</option>
        <option value="validated">${t('statusValidated')}</option>
        <option value="all">${t('statusAll')}</option>
      </select>
      <select id="item-filter" aria-label="${t('dashboardDetailItem')}">
        <option value="${ALL_ITEMS}">${t('dashboardItemFilterAll')}</option>
      </select>
      <input id="ticket-filter" type="search" placeholder="${t('dashboardFilterPlaceholder')}" aria-label="${t('dashboardFilterPlaceholder')}" />
    </div>
    <ul id="ticket-list" class="ticket-list"></ul>
    <p id="ticket-empty" class="empty-state" hidden>${t('dashboardEmpty')}</p>
  `;
  const statusFilter = container.querySelector<HTMLSelectElement>('#status-filter')!;
  const itemFilter = container.querySelector<HTMLSelectElement>('#item-filter')!;
  const ticketFilter = container.querySelector<HTMLInputElement>('#ticket-filter')!;
  const list = container.querySelector<HTMLUListElement>('#ticket-list')!;
  const empty = container.querySelector<HTMLParagraphElement>('#ticket-empty')!;

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
    renderItemOptions();
    renderList(true);
  }

  // Items are free text from each Grow payment link's description, so the
  // options come from whatever the loaded tickets actually contain. A chosen
  // item stays selected across status changes even if no ticket in the new
  // set has it — the list just shows the empty state instead.
  function renderItemOptions() {
    const selected = itemFilter.value;
    const names = collectItemNames(currentTickets).sort((a, b) => a.localeCompare(b));
    if (selected !== ALL_ITEMS && !names.includes(selected)) names.push(selected);
    itemFilter.length = 1;
    for (const name of names) itemFilter.add(new Option(name, name));
    itemFilter.value = selected;
  }

  // `animate` is only true for genuine data loads (initial mount, status
  // filter change) — not on every fuzzy-filter keystroke, so typing narrows
  // the list instantly instead of waiting on a staggered entrance each time.
  function renderList(animate = false) {
    const filterText = ticketFilter.value;
    const item = itemFilter.value;
    const tickets = currentTickets.filter(
      (ticket) =>
        (item === ALL_ITEMS || ticket.items.some((ticketItem) => ticketItem.name === item)) &&
        (!filterText.trim() ||
          fuzzyMatch(filterText, [ticket.customerName, ticket.customerEmail, ticket.customerPhone]) !== null),
    );

    list.innerHTML = '';
    empty.hidden = tickets.length > 0;
    tickets.forEach((ticket, index) => {
      const row = renderRow(ticket);
      if (animate) {
        row.classList.add('ticket-row-enter');
        row.style.animationDelay = `${Math.min(index, 20) * 30}ms`;
      }
      list.appendChild(row);
    });
  }

  function renderRow(ticket: TicketRecord): HTMLLIElement {
    const li = document.createElement('li');
    li.appendChild(statusMark(ticket));

    const body = document.createElement('div');
    body.className = 'ticket-body';
    const summary = document.createElement('span');
    summary.className = 'ticket-summary';
    summary.textContent = ticket.customerName;
    if (ticket.validatedAt) {
      const validated = document.createElement('span');
      validated.className = 'ticket-validated';
      validated.textContent = ticket.validatedByEmail
        ? t('dashboardValidatedBy', {
            time: formatTimestamp(ticket.validatedAt.seconds),
            staff: ticket.validatedByEmail,
          })
        : t('dashboardValidatedAt', { time: formatTimestamp(ticket.validatedAt.seconds) });
      summary.append(' ', validated);
    }
    body.append(summary, renderItemLine(ticket));
    li.appendChild(body);

    const date = document.createElement('span');
    date.className = 'ticket-date';
    date.textContent = formatDateShort(ticket.issuedAt.seconds);
    li.appendChild(date);

    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute(
      'aria-label',
      [ticket.customerName, ...itemNames(ticket.items), formatAmount(ticket.paymentSum), statusLabel(ticket)].join(', '),
    );
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
  itemFilter.addEventListener('change', () => renderList());
  ticketFilter.addEventListener('input', () => {
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(renderList, FILTER_DEBOUNCE_MS);
  });
  await load();
}

function statusLabel(ticket: TicketRecord): string {
  if (ticket.status === 'validated') return t('statusValidated');
  return ticket.emailStatus === 'failed'
    ? `${t('statusIssued')} — ${t('dashboardEmailFailedHint')}`
    : t('statusIssued');
}

// Shape carries the state, not just color: hollow ring = waiting for pickup,
// filled with a check = picked up, red ring with "!" = waiting and the ticket
// email failed (so the buyer may not have their QR).
function statusMark(ticket: TicketRecord): HTMLSpanElement {
  const mark = document.createElement('span');
  mark.title = statusLabel(ticket);
  if (ticket.status === 'validated') {
    mark.className = 'status-mark status-mark-validated';
    mark.appendChild(icon('check', 'icon'));
  } else if (ticket.emailStatus === 'failed') {
    mark.className = 'status-mark status-mark-email-failed';
    mark.appendChild(icon('alert', 'icon'));
  } else {
    mark.className = 'status-mark status-mark-issued';
  }
  return mark;
}

function closeModal(backdrop: HTMLDivElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    backdrop.remove();
    return;
  }
  // The fade/scale-out is driven by CSS (.modal-backdrop-closing), but
  // something still has to decide when it's safe to actually remove the
  // element — animationend on the backdrop itself marks that moment.
  // animationend bubbles, so the target check matters: the nested .modal's
  // own (shorter) closing animation finishing bubbles up first, and {once:
  // true} would consume the listener on that bubbled event, leaving nothing
  // to catch the backdrop's own animationend later — so this removes itself
  // manually only once it actually sees the backdrop's own event.
  backdrop.classList.add('modal-backdrop-closing');
  const onAnimationEnd = (event: AnimationEvent) => {
    if (event.target !== backdrop) return;
    backdrop.removeEventListener('animationend', onAnimationEnd);
    backdrop.remove();
  };
  backdrop.addEventListener('animationend', onAnimationEnd);
}

// Appends a label/value pair to the detail list and returns the value cell,
// so callers can update it in place later.
function detailRow(list: HTMLDListElement, label: string, value: string, className?: string): HTMLElement {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  if (className) dd.className = className;
  list.append(dt, dd);
  return dd;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function renderEmailStatusValue(target: HTMLElement, status: TicketRecord['emailStatus']) {
  target.className = `email-status email-status-${status}`;
  target.replaceChildren(
    icon(status === 'sent' ? 'check' : 'alert', 'icon icon-sm'),
    t(status === 'sent' ? 'dashboardDetailEmailStatusSent' : 'dashboardDetailEmailStatusFailed'),
  );
}

// Resend is offered for every ticket not yet picked up — not just failed
// sends — since "sent" only means the provider accepted it, not that the
// buyer typed their address right or found it outside spam. Picked-up
// tickets keep the button only if their last send failed.
function renderEmailSection(
  ticket: TicketRecord,
  customerEmailCell: HTMLElement,
  onChanged: () => void,
): HTMLDivElement {
  const section = document.createElement('div');
  section.className = 'modal-email';

  const row = document.createElement('p');
  row.className = 'modal-email-status';
  const label = document.createElement('span');
  label.className = 'modal-email-label';
  label.textContent = t('dashboardDetailEmailStatus');
  const value = document.createElement('span');
  renderEmailStatusValue(value, ticket.emailStatus);
  label.append(' ', value);
  row.appendChild(label);
  section.appendChild(row);

  const confirmation = document.createElement('p');
  confirmation.className = 'resend-confirmation';
  confirmation.setAttribute('role', 'status');
  section.appendChild(confirmation);

  if (ticket.status === 'validated' && ticket.emailStatus !== 'failed') {
    return section;
  }

  const resendButton = document.createElement('button');
  resendButton.type = 'button';
  resendButton.className = 'btn btn-secondary btn-small';
  resendButton.textContent = t('dashboardResendButton');
  resendButton.setAttribute('aria-expanded', 'false');
  row.appendChild(resendButton);

  const form = document.createElement('form');
  form.className = 'resend-form';
  form.hidden = true;
  form.noValidate = true;
  const formId = `resend-${ticket.ticketId}`;
  resendButton.setAttribute('aria-controls', formId);
  form.id = formId;

  const fieldLabel = document.createElement('label');
  fieldLabel.htmlFor = `${formId}-email`;
  fieldLabel.textContent = t('dashboardResendToLabel');
  const input = document.createElement('input');
  input.id = `${formId}-email`;
  input.type = 'email';
  input.dir = 'ltr';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  const error = document.createElement('p');
  error.className = 'field-error';
  error.id = `${formId}-error`;
  input.setAttribute('aria-describedby', error.id);

  const buttons = document.createElement('div');
  buttons.className = 'resend-form-buttons';
  const sendButton = document.createElement('button');
  sendButton.type = 'submit';
  sendButton.className = 'btn btn-primary';
  sendButton.textContent = t('dashboardResendSendButton');
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-secondary';
  cancelButton.textContent = t('dashboardResendCancel');
  buttons.append(sendButton, cancelButton);

  form.append(fieldLabel, input, error, buttons);
  section.appendChild(form);

  function setOpen(open: boolean) {
    form.hidden = !open;
    resendButton.hidden = open;
    resendButton.setAttribute('aria-expanded', String(open));
    if (open) {
      input.value = ticket.customerEmail;
      input.removeAttribute('aria-invalid');
      error.textContent = '';
      confirmation.textContent = '';
      input.focus();
      input.select();
    } else {
      resendButton.focus();
    }
  }

  resendButton.addEventListener('click', () => setOpen(true));
  cancelButton.addEventListener('click', () => setOpen(false));
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (!EMAIL_PATTERN.test(email)) {
      error.textContent = t('dashboardResendInvalidEmail');
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    sendButton.disabled = true;
    cancelButton.disabled = true;
    input.readOnly = true;
    sendButton.textContent = t('dashboardResendSending');
    let result: { sent: boolean; email: string } | null = null;
    try {
      result = await resendTicketEmail(ticket.ticketId, email);
    } catch {
      result = null;
    }
    sendButton.disabled = false;
    cancelButton.disabled = false;
    input.readOnly = false;
    sendButton.textContent = t('dashboardResendSendButton');

    if (result) {
      ticket.emailStatus = result.sent ? 'sent' : 'failed';
      renderEmailStatusValue(value, ticket.emailStatus);
    }
    if (!result || !result.sent) {
      error.textContent = t('dashboardResendFailure');
      return;
    }

    const addressChanged = result.email !== ticket.customerEmail;
    ticket.customerEmail = result.email;
    customerEmailCell.textContent = result.email;
    setOpen(false);
    confirmation.textContent = t('dashboardResendSentTo', { email: result.email });
    if (addressChanged) onChanged();
  });

  return section;
}

function renderDetailModal(container: HTMLElement, ticket: TicketRecord, onChanged: () => void) {
  const existing = container.querySelector('.modal-backdrop');
  if (existing) existing.remove();

  // Return focus to whatever opened the modal (the ticket row), so keyboard
  // users land back where they were in the list.
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const dismiss = () => {
    closeModal(backdrop);
    opener?.focus();
  };
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) dismiss();
  });
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismiss();
  });

  const modal = document.createElement('div');
  modal.className = 'card modal';
  backdrop.appendChild(modal);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn btn-secondary btn-small modal-close';
  closeButton.textContent = t('dashboardDetailClose');
  closeButton.addEventListener('click', dismiss);
  modal.appendChild(closeButton);

  const heading = document.createElement('div');
  heading.className = 'modal-heading';
  const name = document.createElement('h2');
  name.id = `ticket-${ticket.ticketId}-title`;
  name.textContent = ticket.customerName;
  heading.append(name, statusPill(ticket.status, t(ticket.status === 'validated' ? 'statusValidated' : 'statusIssued')));
  modal.appendChild(heading);
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', name.id);
  modal.appendChild(renderItemLine(ticket, 'lg'));

  const details = document.createElement('dl');
  details.className = 'detail-list';
  const customerEmailCell = detailRow(details, t('dashboardDetailCustomerEmail'), ticket.customerEmail, 'ltr-value');
  detailRow(details, t('dashboardDetailCustomerPhone'), ticket.customerPhone ?? NONE, 'ltr-value');
  detailRow(details, t('dashboardDetailPaymentSum'), formatAmount(ticket.paymentSum));
  detailRow(details, t('dashboardDetailIssuedAt'), formatTimestamp(ticket.issuedAt.seconds));
  detailRow(
    details,
    t('dashboardDetailValidatedAt'),
    ticket.validatedAt ? formatTimestamp(ticket.validatedAt.seconds) : NONE,
  );
  detailRow(details, t('dashboardDetailValidatedBy'), ticket.validatedByEmail ?? NONE);
  detailRow(details, t('dashboardDetailValidationNote'), ticket.validationNote ?? NONE, 'modal-note');
  detailRow(details, t('dashboardDetailTransactionCode'), ticket.transactionCode, 'ltr-value');
  detailRow(details, t('dashboardDetailTicketId'), ticket.ticketId, 'ltr-value ticket-id');
  modal.appendChild(details);
  modal.appendChild(renderEmailSection(ticket, customerEmailCell, onChanged));

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
  closeButton.focus();
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
  noteInput.setAttribute('aria-label', t('searchNotePlaceholder'));
  const validateButton = document.createElement('button');
  validateButton.type = 'button';
  validateButton.className = 'btn btn-primary';
  validateButton.textContent = t('searchValidateButton');
  validateButton.addEventListener('click', async () => {
    validateButton.disabled = true;
    try {
      const result = (await validateTicket(ticket.ticketId, noteInput.value)) as { ok: boolean };
      if (result.ok) {
        closeModal(backdrop);
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
          closeModal(backdrop);
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
