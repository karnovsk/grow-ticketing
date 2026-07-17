import { Ticket } from './types';
import { EmailSettings, getEmailSettings } from './settings';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildTicketEmailHtml(ticket: Ticket, qrDataUri: string, settings: EmailSettings): string {
  const itemsHtml = ticket.items
    .map((item) => `<li>${item.quantity} x ${escapeHtml(item.name)}</li>`)
    .join('');
  return `
    <div>
      <p>Hi ${escapeHtml(ticket.customerName)}, ${settings.greeting}</p>
      <p>${settings.qrInstructions}</p>
      <img src="${qrDataUri}" alt="Pickup QR code" width="300" height="300" />
      <p>${settings.itemsLabel}</p>
      <ul>${itemsHtml}</ul>
    </div>
  `;
}

export async function sendTicketEmail(ticket: Ticket, qrDataUri: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  const settings = await getEmailSettings();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.TICKET_EMAIL_FROM || 'tickets@example.com',
      to: ticket.customerEmail,
      subject: settings.subject,
      html: buildTicketEmailHtml(ticket, qrDataUri, settings),
    }),
  });
  return response.ok;
}
