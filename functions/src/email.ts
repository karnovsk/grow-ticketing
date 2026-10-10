import nodemailer from 'nodemailer';
import { logger } from 'firebase-functions/v2';
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

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;

// generateQrDataUri renders a UUID ticket id as a 37-module (29 + 2x4 quiet
// zone) PNG at 16px per module = 592px; showing it at half that keeps it sharp
// on 2x/3x phone screens and gives 8 CSS px per module.
const QR_DISPLAY_SIZE = 296;

const DARK_TEXT_COLOR = '#1a1a1a';

function formatDate(timestamp: FirebaseFirestore.Timestamp, utcOffsetMinutes: number): string {
  const date = new Date(timestamp.toMillis() + utcOffsetMinutes * 60000);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

function relativeLuminance(hexColor: string): number {
  let hex = hexColor.slice(1);
  if (hex.length <= 4) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// primaryColor is configurable, so pick whichever of white or near-black text
// has the higher WCAG contrast ratio against it.
function heroTextColor(backgroundColor: string): string {
  const background = relativeLuminance(backgroundColor);
  const contrastWithWhite = 1.05 / (background + 0.05);
  const contrastWithDark = (background + 0.05) / (relativeLuminance(DARK_TEXT_COLOR) + 0.05);
  return contrastWithWhite >= contrastWithDark ? '#ffffff' : DARK_TEXT_COLOR;
}

export function buildTicketEmailHtml(ticket: Ticket, qrCid: string, settings: EmailSettings): string {
  const isRtl = settings.direction.toLowerCase() === 'rtl';
  const align = isRtl ? 'right' : 'left';
  const primaryColor = HEX_COLOR_PATTERN.test(settings.primaryColor) ? settings.primaryColor : '#3a3a3a';
  const heroColor = heroTextColor(primaryColor);
  const greetingHtml = escapeHtml(settings.greeting).replace('{customerName}', escapeHtml(ticket.customerName));

  // Grow's payload carries no per-item quantity (only the total paid — see
  // webhookHandler's parsePayload), so lines show the item name alone and the
  // amount appears once, in the total row below.
  const itemsHtml = ticket.items
    .map(
      (item) =>
        `<tr><td style="padding:4px 0;text-align:${align};font-size:16px;color:${DARK_TEXT_COLOR};">${escapeHtml(item.name)}</td></tr>`,
    )
    .join('');

  const logoHtml = settings.logoUrl
    ? `<img src="${escapeHtml(settings.logoUrl)}" alt="${escapeHtml(settings.businessName)}" width="48" height="48" style="display:block;margin:0 auto 8px auto;border-radius:8px;" />`
    : '';

  // Two small circles, filled with the body's white background, sitting at the
  // hero band's bottom corners to read as a ticket's punch holes. Outlook
  // desktop's rendering engine (Word) handles absolute positioning and
  // border-radius poorly, so it's excluded via MSO conditional comments —
  // Outlook simply sees the plain rectangular band underneath instead. Gmail
  // strips `position` from inline styles but does honor `overflow`/`height`,
  // so the zero-height, overflow-hidden wrapper clips the circles there too
  // even though `position:absolute` itself gets stripped in Gmail. In dark
  // mode the body is no longer white, so the circles would show as stray white
  // dots; the .ticket-notches rules in <head> hide them there.
  const notchesHtml = `<!--[if !mso]><!-->
        <div class="ticket-notches" style="position:relative;height:0;overflow:hidden;font-size:0;line-height:0;">
          <div style="position:absolute;bottom:-10px;left:-10px;width:20px;height:20px;border-radius:50%;background:#ffffff;"></div>
          <div style="position:absolute;bottom:-10px;right:-10px;width:20px;height:20px;border-radius:50%;background:#ffffff;"></div>
        </div>
        <!--<![endif]-->`;

  // The preheader is the inbox preview line; it's hidden from the rendered
  // body in every client (mso-hide covers Outlook desktop).
  const preheaderHtml = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${escapeHtml(settings.preheader)}</div>`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @media (prefers-color-scheme: dark) {
        .ticket-notches { display:none !important; }
      }
      [data-ogsc] .ticket-notches { display:none !important; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;">
    ${preheaderHtml}
    <div dir="${escapeHtml(settings.direction)}" style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
        <tr>
          <td style="position:relative;background:${primaryColor};padding:24px 16px 34px;text-align:center;color:${heroColor};">
            ${logoHtml}
            <div style="font-size:18px;font-weight:bold;">${escapeHtml(settings.businessName)}</div>
            <p style="margin:8px 0 0;font-size:16px;line-height:1.5;">${greetingHtml}</p>
            ${notchesHtml}
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:24px 16px 8px;">
            <img src="cid:${qrCid}" alt="${escapeHtml(settings.qrAltText)}" width="${QR_DISPLAY_SIZE}" height="${QR_DISPLAY_SIZE}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />
            <p style="font-size:15px;line-height:1.5;color:#333333;margin:8px 0 0;">${escapeHtml(settings.qrInstructions)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px 24px;">
            <p style="font-size:14px;color:#555555;text-align:${align};margin:0 0 8px;">${escapeHtml(settings.itemsLabel)}:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${itemsHtml}
              <tr>
                <td style="padding:8px 0 0;border-top:1px solid #eeeeee;font-weight:bold;text-align:${align};font-size:16px;color:${DARK_TEXT_COLOR};">
                  ${escapeHtml(settings.totalLabel)}: ${escapeHtml(settings.currencySymbol)}${ticket.paymentSum.toFixed(2)}
                </td>
              </tr>
            </table>
            <p style="font-size:13px;color:#555555;margin:12px 0 0;text-align:${align};">
              ${escapeHtml(settings.confirmationCodeLabel)}: ${escapeHtml(ticket.transactionCode)} &middot; ${escapeHtml(settings.dateLabel)}: ${formatDate(ticket.issuedAt, settings.utcOffsetMinutes)}
            </p>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>
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
  const settings = await getEmailSettings();
  if (!settings.sendingEnabled) {
    logger.info('Email sending disabled via settings/emailTemplate.sendingEnabled; skipping', {
      ticketId: ticket.ticketId,
    });
    return false;
  }

  let recipientTicket = ticket;
  if (settings.redirectAllEmails) {
    if (!settings.redirectAllEmailsTo) {
      logger.warn(
        'redirectAllEmails is enabled but redirectAllEmailsTo is not configured; skipping send',
        { ticketId: ticket.ticketId },
      );
      return false;
    }
    logger.info('Redirecting ticket email due to settings/emailTemplate.redirectAllEmails', {
      ticketId: ticket.ticketId,
      originalRecipient: ticket.customerEmail,
    });
    recipientTicket = { ...ticket, customerEmail: settings.redirectAllEmailsTo };
  }

  if (process.env.EMAIL_PROVIDER === 'gmail') {
    return sendViaGmail(recipientTicket, qrDataUri);
  }
  return sendViaResend(recipientTicket, qrDataUri);
}
