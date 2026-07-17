import { searchTicketsByField, validateTicket, TicketRecord } from './ticketApi';
import { formatItemList } from './format';

export function renderSearchView(container: HTMLElement) {
  container.innerHTML = `
    <select id="search-field">
      <option value="customerName">Name</option>
      <option value="customerPhone">Phone</option>
      <option value="transactionCode">Transaction code</option>
    </select>
    <input id="search-value" placeholder="Search value" />
    <button id="search-button">Search</button>
    <ul id="search-results"></ul>
  `;

  const fieldSelect = container.querySelector<HTMLSelectElement>('#search-field')!;
  const valueInput = container.querySelector<HTMLInputElement>('#search-value')!;
  const resultsList = container.querySelector<HTMLUListElement>('#search-results')!;

  container.querySelector<HTMLButtonElement>('#search-button')!.addEventListener('click', async () => {
    const field = fieldSelect.value as 'customerName' | 'customerPhone' | 'transactionCode';
    const results = await searchTicketsByField(field, valueInput.value);
    renderResults(results);
  });

  function renderResults(results: TicketRecord[]) {
    resultsList.innerHTML = '';
    for (const ticket of results) {
      const li = document.createElement('li');
      const summary = document.createElement('span');
      summary.textContent = `${ticket.customerName} — ${formatItemList(ticket.items)} — ${ticket.status}`;
      li.appendChild(summary);

      if (ticket.status === 'issued') {
        const noteInput = document.createElement('input');
        noteInput.placeholder = 'Verification note (e.g. verified via ID)';
        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Validate manually';
        confirmButton.addEventListener('click', async () => {
          try {
            const result = (await validateTicket(ticket.ticketId, noteInput.value)) as {
              ok: boolean;
              reason?: string;
            };
            if (result.ok) {
              summary.textContent += ' — validated';
              noteInput.remove();
              confirmButton.remove();
            } else if (result.reason === 'already_validated') {
              summary.textContent += ' — already picked up (validated by someone else just now)';
              noteInput.remove();
              confirmButton.remove();
            } else {
              summary.textContent += ' — ticket not found';
              noteInput.remove();
              confirmButton.remove();
            }
          } catch {
            summary.textContent += ' — something went wrong, please try again';
          }
        });
        li.appendChild(noteInput);
        li.appendChild(confirmButton);
      }
      resultsList.appendChild(li);
    }
  }
}
