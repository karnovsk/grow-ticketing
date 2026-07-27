import nodemailer from 'nodemailer';
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

async function sendViaResend(ticket: Ticket, qrDataUri: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  const fromAddress = process.env.TICKET_EMAIL_FROM;
  if (!fromAddress) {
    throw new Error('TICKET_EMAIL_FROM is not configured');
  }
  const settings = await getEmailSettings();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: ticket.customerEmail,
      subject: settings.subject,
      html: buildTicketEmailHtml(ticket, qrDataUri, settings),
    }),
  });
  return response.ok;
}

async function sendViaGmail(ticket: Ticket, qrDataUri: string): Promise<boolean> {
  const user = process.env.GMAIL_USER;
  if (!user) {
    throw new Error('GMAIL_USER is not configured');
  }
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  if (!appPassword) {
    throw new Error('GMAIL_APP_PASSWORD is not configured');
  }
  const settings = await getEmailSettings();
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword },
  });
  try {
    await transporter.sendMail({
      from: user,
      to: ticket.customerEmail,
      subject: settings.subject,
      html: buildTicketEmailHtml(ticket, qrDataUri, settings),
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendTicketEmail(ticket: Ticket, qrDataUri: string): Promise<boolean> {
  if (process.env.EMAIL_PROVIDER === 'gmail') {
    return sendViaGmail(ticket, qrDataUri);
  }
  return sendViaResend(ticket, qrDataUri);
}
