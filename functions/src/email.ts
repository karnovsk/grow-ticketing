import nodemailer from 'nodemailer';
import * as FirebaseFirestore from 'firebase-admin/firestore';
import { Ticket } from './types';
import { EmailSettings, getEmailSettings } from './settings';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Gmail (and most webmail clients) refuse to render `data:` URI images in
// the body of a received HTML email — they only show inline images that are
// real MIME attachments referenced by Content-ID. So the QR is sent as a
// `cid:` reference here; each provider is responsible for attaching the
// actual image bytes under that same cid (see sendViaGmail).
export const QR_IMAGE_CID = 'ticket-qr';

function formatDate(timestamp: FirebaseFirestore.Timestamp): string {
  const date = timestamp.toDate();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}

export function buildTicketEmailHtml(ticket: Ticket, qrCid: string, settings: EmailSettings): string {
  const align = settings.direction === 'rtl' ? 'right' : 'left';

  const itemsHtml = ticket.items
    .map(
      (item) =>
        `<tr><td style="padding:4px 0;text-align:${align};font-size:14px;color:#333333;">${item.quantity} x ${escapeHtml(item.name)}</td></tr>`,
    )
    .join('');

  const logoHtml = settings.logoUrl
    ? `<img src="${escapeHtml(settings.logoUrl)}" alt="${escapeHtml(settings.businessName)}" width="48" height="48" style="display:block;margin:0 auto 8px auto;border-radius:8px;" />`
    : '';

  // Two small circles, filled with the body's white background, sitting at the
  // hero band's bottom corners to read as a ticket's punch holes. Outlook
  // desktop's rendering engine (Word) handles absolute positioning and
  // border-radius poorly, so it's excluded via MSO conditional comments —
  // Outlook simply sees the plain rectangular band underneath instead.
  const notchesHtml = `<!--[if !mso]><!-->
        <div style="position:absolute;bottom:-10px;left:-10px;width:20px;height:20px;border-radius:50%;background:#ffffff;"></div>
        <div style="position:absolute;bottom:-10px;right:-10px;width:20px;height:20px;border-radius:50%;background:#ffffff;"></div>
        <!--<![endif]-->`;

  return `
    <div dir="${settings.direction}" style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
        <tr>
          <td style="position:relative;background:${escapeHtml(settings.primaryColor)};padding:24px 16px 34px;text-align:center;color:#ffffff;">
            ${logoHtml}
            <div style="font-size:16px;font-weight:bold;">${escapeHtml(settings.businessName)}</div>
            <p style="margin:8px 0 0;font-size:14px;">Hi ${escapeHtml(ticket.customerName)}, ${escapeHtml(settings.greeting)}</p>
            ${notchesHtml}
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:24px 16px 8px;">
            <img src="cid:${qrCid}" alt="Pickup QR code" width="300" height="300" />
            <p style="font-size:13px;color:#555555;margin:8px 0 0;">${escapeHtml(settings.qrInstructions)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px 24px;">
            <p style="font-size:13px;color:#333333;text-align:${align};margin:0 0 8px;">${escapeHtml(settings.itemsLabel)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${itemsHtml}
              <tr>
                <td style="padding:8px 0 0;border-top:1px solid #eeeeee;font-weight:bold;text-align:${align};font-size:14px;color:#333333;">
                  ${escapeHtml(settings.totalLabel)}: ${escapeHtml(settings.currencySymbol)}${ticket.paymentSum.toFixed(2)}
                </td>
              </tr>
            </table>
            <p style="font-size:11px;color:#999999;margin:12px 0 0;text-align:${align};">
              ${escapeHtml(settings.confirmationCodeLabel)}: ${escapeHtml(ticket.transactionCode)} &middot; ${escapeHtml(settings.dateLabel)}: ${formatDate(ticket.issuedAt)}
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function qrDataUriToBuffer(qrDataUri: string): Buffer {
  return Buffer.from(qrDataUri.split(',')[1], 'base64');
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
  // NOTE: this provider is not currently reachable in production (no
  // RESEND_API_KEY secret is declared/bound — see secrets.ts and the
  // README's "Switching email providers" section).
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
      html: buildTicketEmailHtml(ticket, QR_IMAGE_CID, settings),
      attachments: [
        {
          filename: 'ticket-qr.png',
          content: qrDataUri.split(',')[1],
          content_id: QR_IMAGE_CID,
        },
      ],
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
      html: buildTicketEmailHtml(ticket, QR_IMAGE_CID, settings),
      attachments: [
        {
          filename: 'ticket-qr.png',
          content: qrDataUriToBuffer(qrDataUri),
          cid: QR_IMAGE_CID,
        },
      ],
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
