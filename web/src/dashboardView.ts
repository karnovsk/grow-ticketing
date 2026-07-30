import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebaseClient';
import { resendTicketEmail } from './ticketApi';
import { formatItemList, formatTimestamp } from './format';
import { t } from './i18n';

export async function renderDashboardView(container: HTMLElement) {
  container.innerHTML = `
    <div class="search-controls">
      <select id="status-filter">
        <option value="issued">${t('statusIssued')}</option>
        <option value="validated">${t('statusValidated')}</option>
      </select>
    </div>
    <ul id="ticket-list" class="ticket-list"></ul>
  `;
  const statusFilter = container.querySelector<HTMLSelectElement>('#status-filter')!;
  const list = container.querySelector<HTMLUListElement>('#ticket-list')!;

  async function load() {
    const q = query(collection(db, 'tickets'), where('status', '==', statusFilter.value), orderBy('issuedAt', 'desc'));
    const snap = await getDocs(q);
    list.innerHTML = '';
    snap.forEach((doc) => {
      const ticketId = doc.id;
      const data = doc.data() as {
        customerName: string;
        items: { name: string; quantity: number }[];
        validatedAt: { seconds: number } | null;
        validatedByEmail: string | null;
        emailStatus: 'sent' | 'failed';
      };
      const li = document.createElement('li');
      const summary = document.createElement('span');
      let validatedText = '';
      if (data.validatedAt) {
        validatedText = data.validatedByEmail
          ? ` ${t('dashboardValidatedBy', {
              time: formatTimestamp(data.validatedAt.seconds),
              staff: data.validatedByEmail,
            })}`
          : ` ${t('dashboardValidatedAt', { time: formatTimestamp(data.validatedAt.seconds) })}`;
      }
      summary.textContent = `${data.customerName} — ${formatItemList(data.items)}${validatedText}`;
      li.appendChild(summary);

      if (data.emailStatus === 'failed') {
        const resendButton = document.createElement('button');
        resendButton.className = 'btn btn-secondary btn-small';
        resendButton.textContent = t('dashboardResendButton');
        resendButton.addEventListener('click', async () => {
          resendButton.disabled = true;
          const result = (await resendTicketEmail(ticketId)) as { sent: boolean };
          resendButton.textContent = result.sent ? t('dashboardResendSuccess') : t('dashboardResendFailure');
          resendButton.disabled = result.sent;
        });
        li.appendChild(resendButton);
      }
      list.appendChild(li);
    });
  }

  statusFilter.addEventListener('change', load);
  await load();
}
