import QRCode from 'qrcode';

// margin: 4 is the quiet zone the QR spec requires. It's baked into the PNG so
// scanning doesn't depend on the email body staying white (dark-mode clients
// darken it). An integer `scale` (rather than `width`) keeps every module the
// same pixel size; 16px modules give a 2x-retina source for the 8-CSS-px
// modules the email displays (see QR_DISPLAY_SIZE in email.ts).
export const QR_MARGIN_MODULES = 4;
export const QR_SCALE = 16;

export async function generateQrDataUri(ticketId: string): Promise<string> {
  return QRCode.toDataURL(ticketId, { margin: QR_MARGIN_MODULES, scale: QR_SCALE });
}
