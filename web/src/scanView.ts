// web/src/scanView.ts
import { Html5Qrcode } from 'html5-qrcode';
import { validateTicket, getTicketById, TicketRecord } from './ticketApi';
import { formatTimestamp } from './format';
import { renderItemLine, icon, IconName } from './itemTags';
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
  const readerEl = container.querySelector<HTMLDivElement>('#qr-reader')!;
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

  type Outcome = 'ready' | 'success' | 'warning' | 'error';

  const OUTCOME_ICONS: Record<Outcome, IconName | null> = {
    ready: null,
    success: 'check',
    warning: 'alert',
    error: 'cross',
  };

  // The outcome panel is the one loud element in the app: a full wash of the
  // state's color, readable at arm's length across a dim counter. When there
  // is a ticket, what was bought (and what was paid) is its headline — the
  // buyer's name comes second.
  function renderOutcome(
    outcome: Outcome,
    title: string | null,
    ticket: TicketRecord | null,
    detail: string | null,
    buttons: HTMLButtonElement[],
  ) {
    resultEl.innerHTML = '';
    const panel = document.createElement('section');
    // card-validate-pop is a more emphasized entrance reserved for the
    // "picked up" panel specifically, so confirming a ticket reads as a
    // distinct beat rather than just another panel appearing.
    const entranceClass = outcome === 'success' ? 'card-validate-pop' : 'card-enter';
    panel.className = `outcome outcome-${outcome} ${entranceClass}`;
    panel.setAttribute('role', outcome === 'error' ? 'alert' : 'status');

    if (title) {
      const heading = document.createElement('h2');
      heading.className = 'outcome-title';
      const iconName = OUTCOME_ICONS[outcome];
      if (iconName) heading.appendChild(icon(iconName, 'icon outcome-icon'));
      heading.append(title);
      panel.appendChild(heading);
    }
    if (ticket) {
      panel.appendChild(renderItemLine(ticket, 'lg'));
      const name = document.createElement('p');
      name.className = 'outcome-name';
      name.textContent = ticket.customerName;
      panel.appendChild(name);
    }
    if (detail) {
      const detailEl = document.createElement('p');
      detailEl.className = 'outcome-detail';
      detailEl.textContent = detail;
      panel.appendChild(detailEl);
    }
    const actions = document.createElement('div');
    actions.className = 'actions';
    buttons.forEach((b) => actions.appendChild(b));
    panel.appendChild(actions);
    resultEl.appendChild(panel);
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

  function render() {
    readerEl.style.display = state.phase === 'scanning' ? '' : 'none';
    instructionEl.textContent = state.phase === 'scanning' ? t('scanInstruction') : '';

    if (state.phase === 'scanning') {
      resultEl.innerHTML = '';
    } else if (state.phase === 'cameraError') {
      renderOutcome('error', t('scanCameraError'), null, null, []);
    } else if (state.phase === 'lookupError') {
      renderOutcome('error', t('scanLookupError'), null, null, [
        button(t('scanRetryButton'), () => lastScannedId && lookUp(lastScannedId), 'btn-primary btn-block'),
      ]);
    } else if (state.phase === 'previewNotFound') {
      renderOutcome('error', t('scanNotFoundTitle'), null, null, [
        button(t('scanAgainButton'), resumeScanning, 'btn-primary btn-block'),
        button(t('scanNotFoundSearchLink'), () => {
          window.location.hash = 'search';
        }, 'btn-secondary btn-block'),
      ]);
    } else if (state.phase === 'preview') {
      const ticket = state.ticket;
      renderOutcome('ready', null, ticket, null, [
        button(t('scanConfirmButton'), () => confirm(ticket), 'btn-primary btn-block btn-large'),
        button(t('scanAgainButton'), resumeScanning, 'btn-secondary btn-block'),
      ]);
    } else if (state.phase === 'previewAlreadyValidated') {
      const detail = t('scanAlreadyPickedUpDetail', {
        time: state.ticket.validatedAt ? formatTimestamp(state.ticket.validatedAt.seconds) : '',
        staff: state.ticket.validatedByEmail ?? '',
      });
      renderOutcome('warning', t('scanAlreadyPickedUpTitle'), state.ticket, detail, [
        button(t('scanAgainButton'), resumeScanning, 'btn-secondary btn-block'),
      ]);
    } else if (state.phase === 'confirming') {
      renderOutcome('ready', null, state.ticket, null, [
        button(t('scanConfirmingButton'), () => {}, 'btn-primary btn-block btn-large', true),
      ]);
    } else if (state.phase === 'result') {
      renderOutcome('success', t('scanPickedUpTitle'), state.ticket, null, [
        button(t('scanNextButton'), resumeScanning, 'btn-secondary btn-block'),
      ]);
      scheduleAutoResume();
    } else if (state.phase === 'resultAlreadyValidated') {
      renderOutcome('warning', t('scanAlreadyPickedUpTitle'), state.ticket, null, [
        button(t('scanNextButton'), resumeScanning, 'btn-secondary btn-block'),
      ]);
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
        // Pause the video feed itself (not just decode scanning) and hide the
        // reader element via render() below — the approval card should have
        // the staff member's full attention, not a frozen camera preview
        // competing for space above it.
        scanner.pause(true);
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
