import { searchTicketsByField, getTicketById, validateTicket, TicketRecord } from './ticketApi';
import { renderItemLine, statusPill } from './itemTags';
import { t } from './i18n';

export function renderSearchView(container: HTMLElement) {
  container.innerHTML = `
    <div class="search-controls">
      <select id="search-field" aria-label="${t('searchFieldTicketId')} / ${t('searchFieldTransaction')}">
        <option value="ticketId">${t('searchFieldTicketId')}</option>
        <option value="transactionCode">${t('searchFieldTransaction')}</option>
      </select>
      <input id="search-value" placeholder="${t('searchValuePlaceholder')}" aria-label="${t('searchValuePlaceholder')}" />
      <button id="search-button" type="button" class="btn btn-primary">${t('searchButton')}</button>
    </div>
    <ul id="search-results" class="ticket-list"></ul>
  `;

  const fieldSelect = container.querySelector<HTMLSelectElement>('#search-field')!;
  const valueInput = container.querySelector<HTMLInputElement>('#search-value')!;
  const resultsList = container.querySelector<HTMLUListElement>('#search-results')!;

  async function runSearch() {
    const field = fieldSelect.value as 'ticketId' | 'transactionCode';
    if (field === 'ticketId') {
      const ticket = await getTicketById(valueInput.value);
      renderResults(ticket ? [ticket] : []);
      return;
    }
    const results = await searchTicketsByField(field, valueInput.value);
    renderResults(results);
  }

  container.querySelector<HTMLButtonElement>('#search-button')!.addEventListener('click', runSearch);
  valueInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSearch();
  });

  function renderResults(results: TicketRecord[]) {
    resultsList.innerHTML = '';
    for (const ticket of results) {
      const li = document.createElement('li');
      li.className = 'result-row';
      const head = document.createElement('div');
      head.className = 'result-head';
      const name = document.createElement('span');
      name.className = 'result-name';
      name.textContent = ticket.customerName;
      let pill = statusPill(ticket.status, t(ticket.status === 'validated' ? 'statusValidated' : 'statusIssued'));
      head.append(name, pill);
      li.appendChild(head);
      li.appendChild(renderItemLine(ticket));
      const summary = document.createElement('p');
      summary.className = 'result-feedback';
      summary.setAttribute('role', 'status');
      li.appendChild(summary);

      if (ticket.status === 'issued') {
        const noteInput = document.createElement('input');
        noteInput.placeholder = t('searchNotePlaceholder');
        noteInput.setAttribute('aria-label', t('searchNotePlaceholder'));
        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'btn btn-primary';
        confirmButton.textContent = t('searchValidateButton');
        confirmButton.addEventListener('click', async () => {
          try {
            const result = (await validateTicket(ticket.ticketId, noteInput.value)) as {
              ok: boolean;
              reason?: string;
            };
            if (result.ok) {
              const validatedPill = statusPill('validated', t('statusValidated'));
              validatedPill.classList.add('pill-pop');
              pill.replaceWith(validatedPill);
              pill = validatedPill;
              summary.textContent = t('searchValidatedSuffix');
              noteInput.remove();
              confirmButton.remove();
            } else if (result.reason === 'already_validated') {
              summary.textContent = t('searchAlreadyPickedUpSuffix');
              noteInput.remove();
              confirmButton.remove();
            } else {
              summary.textContent = t('searchNotFoundSuffix');
              noteInput.remove();
              confirmButton.remove();
            }
          } catch {
            summary.textContent = t('searchErrorSuffix');
          }
        });
        li.appendChild(noteInput);
        li.appendChild(confirmButton);
      }
      resultsList.appendChild(li);
    }
  }
}
