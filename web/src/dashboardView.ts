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
    renderList(true);
  }

  // `animate` is only true for genuine data loads (initial mount, status
  // filter change) — not on every fuzzy-filter keystroke, so typing narrows
  // the list instantly instead of waiting on a staggered entrance each time.
  function renderList(animate = false) {
    const filterText = ticketFilter.value;
    const tickets = filterText.trim()
      ? currentTickets.filter(
          (ticket) => fuzzyMatch(filterText, [ticket.customerName, ticket.customerEmail, ticket.customerPhone]) !== null,
        )
      : currentTickets;

    list.innerHTML = '';
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

function fieldRow(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailStatusText(status: TicketRecord['emailStatus']): string {
  return t('dashboardDetailEmailStatus', {
    value: t(status === 'sent' ? 'dashboardDetailEmailStatusSent' : 'dashboardDetailEmailStatusFailed'),
  });
}

// Resend is offered for every ticket not yet picked up — not just failed
// sends — since "sent" only means the provider accepted it, not that the
// buyer typed their address right or found it outside spam. Picked-up
// tickets keep the button only if their last send failed.
function renderEmailSection(
  ticket: TicketRecord,
  customerEmailRow: HTMLParagraphElement,
  onChanged: () => void,
): HTMLDivElement {
  const section = document.createElement('div');
  section.className = 'modal-email';

  const row = document.createElement('p');
  row.className = 'modal-email-status';
  const label = document.createElement('span');
  label.textContent = emailStatusText(ticket.emailStatus);
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
      label.textContent = emailStatusText(ticket.emailStatus);
    }
    if (!result || !result.sent) {
      error.textContent = t('dashboardResendFailure');
      return;
    }

    const addressChanged = result.email !== ticket.customerEmail;
    ticket.customerEmail = result.email;
    customerEmailRow.textContent = t('dashboardDetailCustomerEmail', { value: result.email });
    setOpen(false);
    confirmation.textContent = t('dashboardResendSentTo', { email: result.email });
    if (addressChanged) onChanged();
  });

  return section;
}

function renderDetailModal(container: HTMLElement, ticket: TicketRecord, onChanged: () => void) {
  const existing = container.querySelector('.modal-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModal(backdrop);
  });

  const modal = document.createElement('div');
  modal.className = 'card modal';
  backdrop.appendChild(modal);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn btn-secondary btn-small modal-close';
  closeButton.textContent = t('dashboardDetailClose');
  closeButton.addEventListener('click', () => closeModal(backdrop));
  modal.appendChild(closeButton);

  const heading = document.createElement('h2');
  heading.textContent = ticket.customerName;
  modal.appendChild(heading);

  modal.appendChild(fieldRow(t('dashboardDetailTicketId', { value: ticket.ticketId })));
  modal.appendChild(fieldRow(t(ticket.status === 'validated' ? 'statusValidated' : 'statusIssued')));
  const customerEmailRow = fieldRow(t('dashboardDetailCustomerEmail', { value: ticket.customerEmail }));
  modal.appendChild(customerEmailRow);
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
  modal.appendChild(renderEmailSection(ticket, customerEmailRow, onChanged));

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
