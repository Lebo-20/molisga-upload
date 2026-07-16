import fs from 'fs';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/cloud-platform', // Vision API
];

// Helper to load credentials
const getGoogleAuth = () => {
  const SA_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  try {
    if (SA_JSON) {
      const creds = JSON.parse(SA_JSON);
      return new google.auth.JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: SCOPES,
      });
    } else if (SA_FILE && fs.existsSync(SA_FILE)) {
      const creds = JSON.parse(fs.readFileSync(SA_FILE, 'utf-8'));
      return new google.auth.JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: SCOPES,
      });
    }
  } catch (err: any) {
    console.error('[Google API] Error parsing service account credentials:', err.message);
  }
  return null;
};

const auth = getGoogleAuth();
const drive = auth ? google.drive({ version: 'v3', auth }) : null;
const sheets = auth ? google.sheets({ version: 'v4', auth }) : null;

// OAuth2 Client for verifying user ID tokens from frontend
const oauthClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

// ==========================================
// GOOGLE OAUTH USER TOKEN VERIFICATION
// ==========================================
export async function verifyGoogleToken(idToken: string) {
  if (!oauthClient) {
    console.warn('[Google Auth] GOOGLE_CLIENT_ID is not configured. Simulating auth verification.');
    // Simulated token decoding for local development without client ID configured
    try {
      const payloadBase64 = idToken.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      return {
        googleId: payload.sub || 'simulated-id',
        email: payload.email || 'user@example.com',
        name: payload.name || 'Simulated User',
        picture: payload.picture || 'https://via.placeholder.com/150',
      };
    } catch {
      throw new Error('Failed to parse simulated token. Ensure GOOGLE_CLIENT_ID is set in production.');
    }
  }

  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error('Invalid token payload');

  return {
    googleId: payload.sub,
    email: payload.email!,
    name: payload.name!,
    picture: payload.picture!,
  };
}

// ==========================================
// GOOGLE DRIVE INTEGRATION
// ==========================================

// Helper to find or create a folder under a parent
async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const driveClient = drive;
  if (!driveClient) throw new Error('Google Drive client is not initialized.');

  const parentQuery = parentId ? `'${parentId}' in parents` : "'root' in parents";
  const query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and ${parentQuery} and trashed = false`;

  const res = await driveClient.files.list({
    q: query,
    spaces: 'drive',
    fields: 'files(id, name)',
    pageSize: 1,
  });

  const files = res.data.files;
  if (files && files.length > 0) {
    return files[0].id!;
  }

  // Create new folder
  const folderMetadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined,
  };

  const folder = await driveClient.files.create({
    requestBody: folderMetadata,
    fields: 'id',
  });

  return folder.data.id!;
}

// Share folder link with anyone as reader
async function shareFolderPublicly(folderId: string) {
  const driveClient = drive;
  if (!driveClient) return;
  try {
    await driveClient.permissions.create({
      fileId: folderId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (err: any) {
    console.error(`[Google Drive] Error sharing folder ${folderId}:`, err.message);
  }
}

// Build folder path Year -> Month -> Day -> SPK Number
export async function createReportFolder(spkNumber: string, dateStr: string): Promise<{ folderId: string; folderLink: string }> {
  if (!drive) {
    console.warn('[Google Drive] Client not initialized. Returning dummy folder info.');
    return { folderId: 'dummy-folder-id', folderLink: 'https://drive.google.com/dummy' };
  }

  const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || undefined;

  const dateObj = new Date(dateStr);
  const year = dateObj.getFullYear().toString();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  // Navigate/Create hierarchy
  const yearId = await findOrCreateFolder(year, parentFolderId);
  const monthId = await findOrCreateFolder(month, yearId);
  const dayId = await findOrCreateFolder(day, monthId);
  const spkFolderId = await findOrCreateFolder(spkNumber, dayId);

  // Share SPK folder publicly so that users clicking links in sheet can view photos
  await shareFolderPublicly(spkFolderId);

  const folderLink = `https://drive.google.com/drive/folders/${spkFolderId}`;
  return { folderId: spkFolderId, folderLink };
}

// Upload file to Google Drive
export async function uploadFileToDrive(
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  folderId: string
): Promise<string> {
  const driveClient = drive;
  if (!driveClient) {
    console.warn('[Google Drive] Client not initialized. Returning dummy file link.');
    return `https://drive.google.com/file/dummy-${fileName}`;
  }

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const media = {
    mimeType,
    body: stream,
  };

  const response = await driveClient.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink, webContentLink',
  });

  const fileId = response.data.id;
  
  // Also share this file publicly just in case the folder permission doesn't inherit instantly
  try {
    await driveClient.permissions.create({
      fileId: fileId!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch {}

  return response.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
}

// ==========================================
// GOOGLE SHEETS INTEGRATION
// ==========================================

// Check if SPK already exists in Sheet
export async function checkDuplicateSpkInSheet(spkNumber: string): Promise<{ exists: boolean; userName?: string; uploadDate?: string; status?: string } | null> {
  if (!sheets) {
    return null;
  }

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return null;

  try {
    // Read SPK number column (column C)
    const range = 'Sheet1!A2:V';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows) return { exists: false };

    // Column indices:
    // A: Tanggal (0)
    // B: Jam (1)
    // C: Nomor SPK (2)
    // E: Email User (4)
    // F: Nama User (5)
    // M: Status Upload (12)
    // W: Upload Time (22)
    for (const row of rows) {
      if (row[2] && row[2].toString().trim() === spkNumber.toString().trim()) {
        return {
          exists: true,
          userName: row[5] || 'Unknown User',
          uploadDate: row[0] || 'Unknown Date',
          status: row[12] || 'completed',
        };
      }
    }
    return { exists: false };
  } catch (err: any) {
    console.error('[Google Sheets] Error checking duplication in sheet:', err.message);
    return null;
  }
}

// Append report record to Sheet
export async function appendReportToSheet(report: any): Promise<boolean> {
  if (!sheets) {
    console.warn('[Google Sheets] Client not initialized. Skipping Sheet write.');
    return false;
  }

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return false;

  const dateObj = new Date(report.date || new Date());
  const tanggal = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  const jam = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`;

  // Columns:
  // Tanggal, Jam, Nomor SPK, Nama Pembeli, Email User, Nama User, Role, Motor, Tipe, Warna, Harga, DP, Status Upload, Folder Drive, Link SPK, Link KTP, Link NOKA, Link NOSIN, Link Pembayaran, Link Unit, OCR Confidence, Status OCR, Upload Time
  const rowValue = [
    tanggal,                             // A
    jam,                                 // B
    report.spk_number || '',             // C
    report.buyer_name || '',             // D
    report.user_email || '',             // E
    report.user_name || '',              // F
    report.user_role || '',              // G
    report.motor || '',                  // H
    report.type || '',                   // I
    report.color || '',                  // J
    report.price !== undefined ? report.price : '', // K
    report.dp !== undefined ? report.dp : '',       // L
    report.status || '',                 // M
    report.drive_folder_link || '',       // N
    report.spk_link || '',               // O
    report.ktp_link || '',               // P
    report.noka_link || '',              // Q
    report.nosin_link || '',             // R
    report.pembayaran_link || '',        // S
    report.unit_link || '',              // T
    report.ocr_confidence !== undefined ? `${report.ocr_confidence}%` : '', // U
    report.ocr_status || '',             // V
    report.upload_time || new Date().toISOString() // W
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:W',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowValue],
      },
    });
    return true;
  } catch (err: any) {
    console.error('[Google Sheets] Error writing to sheet:', err.message);
    throw err;
  }
}
