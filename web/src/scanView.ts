// web/src/scanView.ts
import { Html5Qrcode } from 'html5-qrcode';
import { validateTicket, getTicketById, TicketRecord } from './ticketApi';
import { formatItemList, formatTimestamp } from './format';
import { t } from './i18n';
import { ScanState, resolveLookup, resolveConfirmOutcome } from './scanFlow';

export interface ScanViewHandle {
  stop: () => void;
  retranslate: () => void;
}

export function renderScanView(container: HTMLElement): ScanViewHandle {
  let state: ScanState = { phase: 'scanning' };
  let lastScannedId: string | null = null;
  let autoResumeTimer: ReturnType<typeof setTimeout> | null = null;

  container.innerHTML = `
    <div id="qr-reader"></div>
    <p id="scan-instruction" class="scan-instruction"></p>
    <div id="scan-result"></div>
  `;
  const resultEl = container.querySelector<HTMLDivElement>('#scan-result')!;
  const instructionEl = container.querySelector<HTMLParagraphElement>('#scan-instruction')!;
  const scanner = new Html5Qrcode('qr-reader');

  function button(label: string, onClick: () => void, className = 'btn-secondary', disabled = false) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn ${className}`;
    el.textContent = label;
    el.disabled = disabled;
    el.addEventListener('click', onClick);
    return el;
  }

  function renderCard(variant: string, text: string, buttons: HTMLButtonElement[]) {
    resultEl.innerHTML = '';
    const card = document.createElement('div');
    card.className = `card ${variant}`;
    const heading = document.createElement('p');
    heading.textContent = text;
    card.appendChild(heading);
    const actions = document.createElement('div');
    actions.className = 'actions';
    buttons.forEach((b) => actions.appendChild(b));
    card.appendChild(actions);
    resultEl.appendChild(card);
  }

  function scheduleAutoResume() {
    if (autoResumeTimer) clearTimeout(autoResumeTimer);
    autoResumeTimer = setTimeout(resumeScanning, 3000);
  }

  function resumeScanning() {
    if (autoResumeTimer) {
      clearTimeout(autoResumeTimer);
      autoResumeTimer = null;
    }
    state = { phase: 'scanning' };
    render();
    scanner.resume();
  }

  function itemsLine(ticket: TicketRecord): string {
    return t('scanItemsLabel', { items: formatItemList(ticket.items) });
  }

  function render() {
    instructionEl.textContent = state.phase === 'scanning' ? t('scanInstruction') : '';

    if (state.phase === 'scanning') {
      resultEl.innerHTML = '';
    } else if (state.phase === 'cameraError') {
      renderCard('card-error', t('scanCameraError'), []);
    } else if (state.phase === 'lookupError') {
      renderCard('card-error', t('scanLookupError'), [
        button(t('scanRetryButton'), () => lastScannedId && lookUp(lastScannedId)),
      ]);
    } else if (state.phase === 'previewNotFound') {
      renderCard('card-error', t('scanNotFoundTitle'), [
        button(t('scanAgainButton'), resumeScanning),
        button(t('scanNotFoundSearchLink'), () => {
          window.location.hash = 'search';
        }),
      ]);
    } else if (state.phase === 'preview') {
      const ticket = state.ticket;
      renderCard('card-neutral', `${ticket.customerName} — ${itemsLine(ticket)}`, [
        button(t('scanConfirmButton'), () => confirm(ticket), 'btn-primary'),
        button(t('scanAgainButton'), resumeScanning),
      ]);
    } else if (state.phase === 'previewAlreadyValidated') {
      const detail = t('scanAlreadyPickedUpDetail', {
        time: state.ticket.validatedAt ? formatTimestamp(state.ticket.validatedAt.seconds) : '',
        staff: state.ticket.validatedBy ?? '',
      });
      renderCard('card-warning', `${t('scanAlreadyPickedUpTitle')} — ${detail}`, [
        button(t('scanAgainButton'), resumeScanning),
      ]);
    } else if (state.phase === 'confirming') {
      renderCard('card-neutral', `${state.ticket.customerName} — ${itemsLine(state.ticket)}`, [
        button(t('scanConfirmingButton'), () => {}, 'btn-primary', true),
      ]);
    } else if (state.phase === 'result') {
      renderCard('card-success', `${t('scanPickedUpTitle')} — ${itemsLine(state.ticket)}`, [
        button(t('scanNextButton'), resumeScanning),
      ]);
      scheduleAutoResume();
    } else if (state.phase === 'resultAlreadyValidated') {
      renderCard('card-warning', t('scanAlreadyPickedUpTitle'), [button(t('scanNextButton'), resumeScanning)]);
      scheduleAutoResume();
    }
  }

  async function lookUp(ticketId: string) {
    lastScannedId = ticketId;
    try {
      const ticket = await getTicketById(ticketId);
      state = resolveLookup(ticket);
    } catch {
      state = { phase: 'lookupError' };
    }
    render();
  }

  async function confirm(ticket: TicketRecord) {
    state = { phase: 'confirming', ticket };
    render();
    try {
      const outcome = (await validateTicket(ticket.ticketId)) as { ok: boolean; reason?: string };
      const nextPhase = resolveConfirmOutcome(outcome);
      if (nextPhase === 'resultAlreadyValidated') {
        // Deliberately reuse the ticket already in scope (from the preceding
        // preview lookup) rather than refetching. The validateTicket callable
        // does return a `ticket` field on this branch, but its validatedAt
        // comes from the Admin SDK's Timestamp serialized over the wire as
        // `{ _seconds, _nanoseconds }` — not the `{ seconds }` shape TicketRecord
        // (and formatTimestamp) expect from client-side Firestore reads. Trusting
        // it would silently produce garbage, and a second Firestore read here
        // is both wasted work (this branch's card only shows the title, no
        // detail) and risky (a transient failure would turn an already-known
        // outcome into a false "lookupError").
        state = { phase: 'resultAlreadyValidated', ticket };
      } else if (nextPhase === 'result') {
        state = { phase: 'result', ticket };
      } else {
        state = { phase: 'previewNotFound' };
      }
    } catch {
      state = { phase: 'lookupError' };
    }
    render();
  }

  render();

  scanner
    .start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      async (decodedText) => {
        if (state.phase !== 'scanning') return;
        await scanner.pause();
        await lookUp(decodedText);
      },
      () => {
        /* ignore per-frame scan failures — expected while the camera searches for a code */
      },
    )
    .catch(() => {
      state = { phase: 'cameraError' };
      render();
    });

  return {
    stop: () => {
      // Release the camera when navigating away — without this, the stream
      // keeps running (browser camera indicator stays lit, battery drains),
      // and a second Html5Qrcode instance would conflict with it if the user
      // navigates back to Scan. stop() *throws synchronously* (not just a
      // rejected promise) if the scanner never reached a running/paused
      // state — e.g. navigated away before start() resolved, or start()
      // already failed (denied permission, no camera) — so this needs a
      // try/catch around the call itself, not just a .catch() on its result.
      if (autoResumeTimer) clearTimeout(autoResumeTimer);
      try {
        scanner.stop().catch(() => {});
      } catch {
        /* scanner never started — nothing to stop */
      }
    },
    retranslate: () => {
      // Re-draws whatever card is currently shown in the new language.
      // Never touches `scanner` — the camera stream keeps running undisturbed.
      render();
    },
  };
}
