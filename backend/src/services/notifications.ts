import nodemailer from 'nodemailer';
import axios from 'axios';

// Initialize Email Transporter
const createEmailTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[Notifications] SMTP is not fully configured. Email notifications will be bypassed.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
  });
};

const emailTransporter = createEmailTransporter();

// ==========================================
// EMAIL NOTIFICATIONS
// ==========================================

export async function sendSuccessEmail(
  toEmail: string,
  toName: string,
  spkNumber: string,
  dateStr: string,
  driveLink: string
): Promise<boolean> {
  if (!emailTransporter) return false;

  const emailFrom = process.env.EMAIL_FROM || '"Molis Report System" <no-reply@molis.com>';
  
  const mailOptions = {
    from: emailFrom,
    to: toEmail,
    subject: `[BERHASIL] Laporan Penjualan Motor Listrik SPK #${spkNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; rounded-lg: 8px;">
        <h2 style="color: #10b981; margin-bottom: 20px;">Laporan Berhasil Terunggah!</h2>
        <p>Halo <strong>${toName}</strong>,</p>
        <p>Laporan penjualan motor listrik dengan rincian berikut telah berhasil disimpan:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Nomor SPK</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold;">${spkNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Tanggal Laporan</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">${new Date(dateStr).toLocaleDateString('id-ID', { dateStyle: 'long' })}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Status</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; color: #10b981; font-weight: bold;">Done (Google Sheet & Drive Update)</td>
          </tr>
        </table>

        <div style="margin: 30px 0; text-align: center;">
          <a href="${driveLink}" target="_blank" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Buka Folder Google Drive</a>
        </div>

        <p style="color: #9ca3af; font-size: 12px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Ini adalah email otomatis dari Sistem Laporan Internal Molis. Jangan membalas email ini.
        </p>
      </div>
    `,
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`[Notifications] Success email sent to ${toEmail} for SPK #${spkNumber}`);
    return true;
  } catch (err: any) {
    console.error('[Notifications] Failed to send success email:', err.message);
    return false;
  }
}

export async function sendFailureEmail(
  toEmail: string,
  toName: string,
  spkNumber: string,
  errorMessage: string
): Promise<boolean> {
  if (!emailTransporter) return false;

  const emailFrom = process.env.EMAIL_FROM || '"Molis Report System" <no-reply@molis.com>';

  const mailOptions = {
    from: emailFrom,
    to: toEmail,
    subject: `[GAGAL] Upload Laporan SPK #${spkNumber} Tertunda`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; rounded-lg: 8px;">
        <h2 style="color: #ef4444; margin-bottom: 20px;">Upload Laporan Gagal!</h2>
        <p>Halo <strong>${toName}</strong>,</p>
        <p>Laporan penjualan motor listrik dengan Nomor SPK <strong>#${spkNumber}</strong> gagal terunggah ke Google Drive / Google Sheets.</p>
        
        <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; color: #991b1b; padding: 12px; margin: 20px 0; border-radius: 4px;">
          <strong>Detail Error:</strong><br/>
          ${errorMessage}
        </div>

        <p>Laporan Anda saat ini tersimpan di daftar <strong>Draft / Pending Upload</strong>. Silakan buka aplikasi kembali saat koneksi stabil dan klik tombol <strong>Retry Upload</strong>.</p>
        
        <p style="color: #9ca3af; font-size: 12px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Ini adalah email otomatis dari Sistem Laporan Internal Molis. Jangan membalas email ini.
        </p>
      </div>
    `,
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`[Notifications] Failure email sent to ${toEmail} for SPK #${spkNumber}`);
    return true;
  } catch (err: any) {
    console.error('[Notifications] Failed to send failure email:', err.message);
    return false;
  }
}

// ==========================================
// TELEGRAM BOT INTEGRATION
// ==========================================

export async function sendTelegramNotification(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });
    console.log('[Notifications] Telegram alert sent.');
    return true;
  } catch (err: any) {
    console.error('[Notifications] Telegram notification failed:', err.message);
    return false;
  }
}
