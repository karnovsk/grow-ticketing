import { Html5Qrcode } from 'html5-qrcode';
import { validateTicket } from './ticketApi';
import { formatItemList } from './format';

export function renderScanView(container: HTMLElement) {
  container.innerHTML = `
    <div id="qr-reader" style="width: 300px;"></div>
    <div id="scan-result"></div>
  `;
  const resultEl = container.querySelector<HTMLDivElement>('#scan-result')!;
  const scanner = new Html5Qrcode('qr-reader');

  scanner
    .start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      async (decodedText) => {
        await scanner.pause();
        try {
          const data = (await validateTicket(decodedText)) as {
            ok: boolean;
            reason?: string;
            ticket?: { items: { name: string; quantity: number }[] };
          };
          if (data.ok) {
            resultEl.textContent = `Valid ticket. Items: ${formatItemList(data.ticket?.items ?? [])}`;
          } else if (data.reason === 'already_validated') {
            resultEl.textContent = 'This ticket was already picked up.';
          } else {
            resultEl.textContent = 'Ticket not found.';
          }
        } catch {
          resultEl.textContent = 'Something went wrong checking this ticket. Please try again.';
        } finally {
          scanner.resume();
        }
      },
      () => {
        /* ignore per-frame scan failures — expected while the camera searches for a code */
      },
    )
    .catch(() => {
      resultEl.textContent = 'Could not access the camera. Check camera permissions and try again.';
    });
}
