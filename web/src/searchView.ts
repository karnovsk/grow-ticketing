import { searchTicketsByField, getTicketById, validateTicket, TicketRecord } from './ticketApi';
import { formatItemList } from './format';
import { t } from './i18n';

export function renderSearchView(container: HTMLElement) {
  container.innerHTML = `
    <div class="search-controls">
      <select id="search-field">
        <option value="ticketId">${t('searchFieldTicketId')}</option>
        <option value="transactionCode">${t('searchFieldTransaction')}</option>
      </select>
      <input id="search-value" placeholder="${t('searchValuePlaceholder')}" />
      <button id="search-button" class="btn btn-primary">${t('searchButton')}</button>
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
      const summary = document.createElement('span');
      summary.textContent = `${ticket.customerName} — ${formatItemList(ticket.items)} `;
      const pill = document.createElement('span');
      pill.className = `pill ${ticket.status === 'validated' ? 'pill-validated' : 'pill-issued'}`;
      pill.textContent = t(ticket.status === 'validated' ? 'statusValidated' : 'statusIssued');
      summary.appendChild(pill);
      li.appendChild(summary);

      if (ticket.status === 'issued') {
        const noteInput = document.createElement('input');
        noteInput.placeholder = t('searchNotePlaceholder');
        const confirmButton = document.createElement('button');
        confirmButton.className = 'btn btn-primary';
        confirmButton.textContent = t('searchValidateButton');
        confirmButton.addEventListener('click', async () => {
          try {
            const result = (await validateTicket(ticket.ticketId, noteInput.value)) as {
              ok: boolean;
              reason?: string;
            };
            if (result.ok) {
              pill.className = 'pill pill-validated';
              pill.textContent = t('statusValidated');
              summary.append(t('searchValidatedSuffix'));
              noteInput.remove();
              confirmButton.remove();
            } else if (result.reason === 'already_validated') {
              summary.append(t('searchAlreadyPickedUpSuffix'));
              noteInput.remove();
              confirmButton.remove();
            } else {
              summary.append(t('searchNotFoundSuffix'));
              noteInput.remove();
              confirmButton.remove();
            }
          } catch {
            summary.append(t('searchErrorSuffix'));
          }
        });
        li.appendChild(noteInput);
        li.appendChild(confirmButton);
      }
      resultsList.appendChild(li);
    }
  }
}
