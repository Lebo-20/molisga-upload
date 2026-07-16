import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { google } from 'googleapis';
import fs from 'fs';

// Helper to get Google Auth
const getGoogleAuth = () => {
  const SA_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

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
  } catch {}
  return null;
};

// OCR Preprocessing using Sharp
export async function preprocessForOcr(buffer: Buffer): Promise<Buffer> {
  try {
    // 1. Resize to max 1600px width/height to make it lightweight
    // 2. Grayscale to remove color noise
    // 3. Contrast adjustment using linear expansion (multiply by 1.6, offset by -0.15)
    // 4. Sharpen to make character edges crisp
    return await sharp(buffer)
      .resize({ width: 1600, fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .linear(1.6, -0.15)
      .sharpen()
      .toBuffer();
  } catch (err: any) {
    console.error('[OCR Preprocessing] Error during Sharp processing:', err.message);
    return buffer; // Fallback to raw buffer if preprocessing fails
  }
}

// Extract SPK number using high-precision Regex scanning
export function extractSpkFromText(text: string): { spkNumber: string | null; confidence: number } {
  if (!text) return { spkNumber: null, confidence: 0 };

  const normalized = text
    .replace(/[oO]/g, '0')   // OCR often misreads O as 0 in numbers
    .replace(/[lI]/g, '1')   // OCR often misreads l/I as 1
    .replace(/\r/g, '\n');    // Normalize line endings

  // Patterns ordered by confidence level (highest first)
  // Pattern 0: Explicit "NO." or "NO:" keyword directly before digits (most reliable)
  // Pattern 1: "SPK", "Invoice", "Inv" keyword label
  // Pattern 2: "Nomor" or "Nomer" keyword (Indonesian)
  // Pattern 3: Hashtag # followed by digits
  // Pattern 4: Digits on a line that also contains SPK-related keywords anywhere
  // Pattern 5: Any 4–8 digit standalone number (fallback)
  const patterns: { re: RegExp; conf: number }[] = [
    { re: /\bno\.?\s*[:.-]?\s*(\d{4,8})\b/gi,                      conf: 98 },
    { re: /\b(?:spk|invoice|inv|faktur|pesanan)\s*[:.-]?\s*(\d{4,8})\b/gi, conf: 96 },
    { re: /\b(?:nomor|nomer|nmbr|nmr)\s*[:.-]?\s*(\d{4,8})\b/gi,  conf: 94 },
    { re: /#\s*(\d{4,8})/g,                                          conf: 90 },
    { re: /(?:^|\n|\t)[^\n]*(?:spk|surat pesanan|pesanan kendaraan|tanda jadi)[^\n]*(\d{4,8})/gi, conf: 88 },
    { re: /\b(\d{5,7})\b/g,                                          conf: 70 },
  ];

  let bestMatch: string | null = null;
  let highestConfidence = 0;

  for (const { re, conf } of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(normalized)) !== null) {
      const num = match[1];
      if (!num) continue;
      let score = conf;
      // Slight boost for typical 5-digit SPK numbers
      if (num.length === 5) score += 2;
      if (score > highestConfidence) {
        highestConfidence = score;
        bestMatch = num;
      }
    }
    // Stop early if we have a highly confident match
    if (highestConfidence >= 95 && bestMatch) break;
  }

  return {
    spkNumber: bestMatch,
    confidence: Math.min(highestConfidence, 100)
  };
}

// Auto classify document category based on text analysis
export function classifyDocumentType(text: string): 'SPK' | 'KTP' | 'PEMBAYARAN' | 'UNKNOWN' {
  const t = text.toLowerCase();

  // KTP terms
  if (t.includes('nik') || t.includes('kartu tanda penduduk') || t.includes('provinsi') || t.includes('gol. darah')) {
    return 'KTP';
  }

  // Payment terms
  if (t.includes('bukti transfer') || t.includes('nominal') || t.includes('kuitansi') || t.includes('transfer berhasil') || t.includes('jumlah bayar') || t.includes('struk ATM')) {
    return 'PEMBAYARAN';
  }

  // SPK terms
  if (t.includes('surat pesanan') || t.includes('spk') || t.includes('tanda jadi') || t.includes('pembelian motor') || t.includes('nama pemesan') || t.includes('salesman')) {
    return 'SPK';
  }

  return 'UNKNOWN';
}

// Google Cloud Vision OCR
async function runGoogleVisionOcr(imageBuffer: Buffer): Promise<string> {
  const auth = getGoogleAuth();
  if (!auth) throw new Error('Google authentication not available for Vision API.');

  const vision = google.vision({ version: 'v1', auth });
  
  const response = await vision.images.annotate({
    requestBody: {
      requests: [
        {
          image: {
            content: imageBuffer.toString('base64'),
          },
          features: [
            {
              type: 'TEXT_DETECTION',
            },
          ],
        },
      ],
    },
  });

  const responses = response.data.responses;
  if (!responses || responses.length === 0) {
    throw new Error('No responses from Google Vision.');
  }

  const textAnnotations = responses[0].textAnnotations;
  if (!textAnnotations || textAnnotations.length === 0) {
    return '';
  }

  return textAnnotations[0].description || '';
}

// Tesseract.js local fallback OCR
async function runTesseractOcr(imageBuffer: Buffer): Promise<string> {
  console.log('[OCR] Google Vision unavailable. Running Tesseract.js local fallback.');
  // Use Indonesian + English — better for local SPK documents with mixed Bahasa/numeric
  const result = await Tesseract.recognize(imageBuffer, 'ind+eng', {
    logger: (m: any) => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r[OCR Tesseract] Progress: ${Math.round(m.progress * 100)}%`);
      }
    }
  } as any);
  console.log(''); // Newline after progress
  return result.data.text || '';
}

// Main OCR Execution
export async function performOcr(imageBuffer: Buffer): Promise<{
  text: string;
  spkNumber: string | null;
  ocrConfidence: number;
  ocrStatus: 'success' | 'failed' | 'low_confidence';
  classification: string;
}> {
  let text = '';
  let status: 'success' | 'failed' | 'low_confidence' = 'failed';
  
  // 1. Run image preprocessing to enhance text readability
  const preprocessedBuffer = await preprocessForOcr(imageBuffer);

  // 2. Try Google Vision OCR first, fallback to Tesseract
  try {
    text = await runGoogleVisionOcr(preprocessedBuffer);
    status = 'success';
  } catch (err: any) {
    console.warn('[OCR] Google Vision API error:', err.message);
    try {
      text = await runTesseractOcr(preprocessedBuffer);
      status = 'success';
    } catch (tessErr: any) {
      console.error('[OCR] Tesseract.js fallback error:', tessErr.message);
      return {
        text: '',
        spkNumber: null,
        ocrConfidence: 0,
        ocrStatus: 'failed',
        classification: 'UNKNOWN'
      };
    }
  }

  // 3. Extract SPK number and calculate confidence
  const { spkNumber, confidence } = extractSpkFromText(text);

  // Debug: Print first 500 chars of OCR text so we can verify what was read
  console.log('[OCR] Raw text preview (first 500 chars):');
  console.log('---');
  console.log(text.substring(0, 500));
  console.log('---');
  console.log(`[OCR] Detected SPK: "${spkNumber}" | Confidence: ${confidence}%`);

  // 4. Classify document
  const classification = classifyDocumentType(text);

  // Determine final status
  if (spkNumber) {
    status = confidence >= 80 ? 'success' : 'low_confidence';
  } else {
    status = 'failed';
  }

  return {
    text,
    spkNumber,
    ocrConfidence: confidence,
    ocrStatus: status,
    classification
  };
}
