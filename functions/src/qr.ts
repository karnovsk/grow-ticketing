import QRCode from 'qrcode';

export async function generateQrDataUri(ticketId: string): Promise<string> {
  return QRCode.toDataURL(ticketId, { margin: 1, width: 300 });
}
