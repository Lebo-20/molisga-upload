import { Router, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import EventEmitter from 'events';
import sharp from 'sharp';
import db, { Report } from '../services/db';
import { checkDuplicateSpkInSheet, createReportFolder, uploadFileToDrive, appendReportToSheet } from '../services/google';
import { performOcr, classifyDocumentType } from '../services/ocr';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { sendSuccessEmail, sendFailureEmail, sendTelegramNotification } from '../services/notifications';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // Max 10MB per file
  },
});

// Event emitter for streaming upload job progress
const jobEvents = new EventEmitter();

// In-memory job registry
interface UploadJob {
  id: string;
  status: 'starting' | 'duplication_check' | 'processing_ocr' | 'compressing' | 'uploading_drive' | 'saving_sheet' | 'saving_db' | 'completed' | 'failed';
  progress: number;
  error?: string;
  data?: any;
}
const jobs = new Map<string, UploadJob>();

// Helper to update job status and emit event
function updateJob(jobId: string, status: UploadJob['status'], progress: number, extra: Partial<UploadJob> = {}) {
  const current = jobs.get(jobId);
  if (!current) return;

  const updated: UploadJob = { ...current, status, progress, ...extra };
  jobs.set(jobId, updated);
  jobEvents.emit(jobId, updated);
}

// Utility to compress image to max 1920px jpeg
async function compressImage(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer)
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

// ==========================================
// 1. OCR REAL-TIME PREVIEW ENDPOINT
// ==========================================
router.post('/ocr', authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const ocrResult = await performOcr(req.file.buffer);
    return res.json({
      text: ocrResult.text,
      spkNumber: ocrResult.spkNumber,
      ocrConfidence: ocrResult.ocrConfidence,
      ocrStatus: ocrResult.ocrStatus,
      classification: ocrResult.classification,
    });
  } catch (err: any) {
    console.error('[Upload API] OCR process error:', err.message);
    return res.status(500).json({ error: 'OCR processing failed: ' + err.message });
  }
});

// ==========================================
// 2. DOCUMENT CLASSIFICATION ENDPOINT
// ==========================================
router.post('/classify', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Perform quick local OCR or fallback
    const result = await performOcr(req.file.buffer);
    return res.json({
      classification: result.classification,
      ocrConfidence: result.ocrConfidence,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Classification failed: ' + err.message });
  }
});

// ==========================================
// 3. START REPORT UPLOAD JOB
// ==========================================
const fieldsUpload = upload.fields([
  { name: 'spk', maxCount: 1 },
  { name: 'ktp', maxCount: 1 },
  { name: 'noka', maxCount: 1 },
  { name: 'nosin', maxCount: 1 },
  { name: 'pembayaran', maxCount: 1 },
  { name: 'unit', maxCount: 1 },
]);

router.post('/report', authenticateToken, fieldsUpload, async (req: AuthenticatedRequest, res) => {
  const jobId = crypto.randomUUID();
  const user = req.user!;

  // Parse files
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const body = req.body;

  const spkNumber = body.spk_number;
  const isBypass = body.bypassDuplicate === 'true' || body.bypassDuplicate === true;

  if (!spkNumber) {
    return res.status(400).json({ error: 'spk_number is required' });
  }

  const role = user.role;

  // Validate required uploads (Only SPK/Invoice is mandatory for all roles to scan number)
  if (!files['spk'] || files['spk'].length === 0) {
    return res.status(400).json({ error: 'Dokumen SPK / Invoice wajib diunggah!' });
  }

  // Initialize job in memory
  const job: UploadJob = {
    id: jobId,
    status: 'starting',
    progress: 0,
  };
  jobs.set(jobId, job);

  // Send Job ID immediately to avoid client timeout
  res.json({ jobId });

  // Run the background process
  (async () => {
    try {
      // Create audit log of initiation
      await db.createAuditLog({
        user_email: user.email,
        user_name: user.name,
        action: 'upload_start',
        details: `Started report upload job for SPK #${spkNumber}`,
      });

      // 1. DUPLICATION CHECK
      updateJob(jobId, 'duplication_check', 10);
      const isDuplicateDb = await db.getReportBySpk(spkNumber);
      const isDuplicateSheet = await checkDuplicateSpkInSheet(spkNumber);

      const duplicate = isDuplicateDb || (isDuplicateSheet && isDuplicateSheet.exists ? isDuplicateSheet : null);

      if (duplicate && !isBypass) {
        const uName = 'userName' in duplicate ? duplicate.userName : (duplicate as Report).user_name;
        const uDate = 'uploadDate' in duplicate ? duplicate.uploadDate : new Date((duplicate as Report).created_at).toLocaleDateString('id-ID');
        const uStatus = duplicate.status;
        
        throw new Error(`Duplicate SPK: SPK #${spkNumber} sudah diupload oleh ${uName} pada ${uDate} dengan status [${uStatus}].`);
      }

      // 2. OCR RE-VERIFICATION (Backend Validation)
      updateJob(jobId, 'processing_ocr', 20);
      const spkFile = files['spk'][0];
      const ocrResult = await performOcr(spkFile.buffer);

      // Verify classification warning triggers (just logging warning details)
      let autoClassificationLog = `Auto classification check: SPK field parsed as ${ocrResult.classification}. `;
      const mismatches: string[] = [];

      for (const fieldName of Object.keys(files)) {
        if (!files[fieldName] || files[fieldName].length === 0) continue;
        const file = files[fieldName][0];
        const fileText = await performOcr(file.buffer).then(r => r.text).catch(() => '');
        const fileClass = classifyDocumentType(fileText);
        
        const expectedClassMap: Record<string, string> = {
          spk: 'SPK',
          ktp: 'KTP',
          pembayaran: 'PEMBAYARAN'
        };

        if (expectedClassMap[fieldName] && fileClass !== 'UNKNOWN' && fileClass !== expectedClassMap[fieldName]) {
          mismatches.push(`${fieldName.toUpperCase()} field uploaded image classified as ${fileClass}`);
        }
      }
      if (mismatches.length > 0) {
        autoClassificationLog += `Warnings: ${mismatches.join('; ')}`;
      }

      // 3. DRIVE DIRECTORY CREATION
      updateJob(jobId, 'uploading_drive', 30);
      const reportDate = body.date || new Date().toISOString();
      const folderInfo = await createReportFolder(spkNumber, reportDate);

      // 4. COMPRESS & UPLOAD FILE BY FILE
      const driveLinks: Record<string, string> = {};
      const fileNames = Object.keys(files);
      const stepIncrement = 40 / fileNames.length; // Spend 40% progress space on file uploads

      for (let i = 0; i < fileNames.length; i++) {
        const fieldName = fileNames[i];
        if (!files[fieldName] || files[fieldName].length === 0) continue;
        updateJob(jobId, 'uploading_drive', Math.round(30 + i * stepIncrement));

        const file = files[fieldName][0];
        // Compress photo
        const compressed = await compressImage(file.buffer);
        
        // Dynamic name formatting
        const nameMap: Record<string, string> = {
          spk: 'SPK.jpg',
          ktp: 'KTP.jpg',
          noka: 'NOKA.jpg',
          nosin: 'NOSIN.jpg',
          pembayaran: 'PEMBAYARAN.jpg',
          unit: 'UNIT.jpg',
        };
        const destName = nameMap[fieldName] || `${fieldName.toUpperCase()}.jpg`;

        const link = await uploadFileToDrive(destName, compressed, 'image/jpeg', folderInfo.folderId);
        driveLinks[`${fieldName}_link`] = link;
      }

      // 5. SAVE TO GOOGLE SHEET
      updateJob(jobId, 'saving_sheet', 80);
      const sheetReportData = {
        spk_number: spkNumber,
        buyer_name: body.buyer_name || '',
        user_email: user.email,
        user_name: user.name,
        user_role: role,
        motor: body.motor || '',
        type: body.type || '',
        color: body.color || '',
        price: body.price ? parseFloat(body.price) : undefined,
        dp: body.dp ? parseFloat(body.dp) : undefined,
        status: 'completed',
        drive_folder_link: folderInfo.folderLink,
        spk_link: driveLinks['spk_link'] || '',
        ktp_link: driveLinks['ktp_link'] || '',
        noka_link: driveLinks['noka_link'] || '',
        nosin_link: driveLinks['nosin_link'] || '',
        pembayaran_link: driveLinks['pembayaran_link'] || '',
        unit_link: driveLinks['unit_link'] || '',
        ocr_confidence: ocrResult.ocrConfidence,
        ocr_status: ocrResult.ocrStatus,
        date: reportDate,
        upload_time: new Date().toISOString(),
      };

      await appendReportToSheet(sheetReportData);

      // 6. SAVE TO DATABASE
      updateJob(jobId, 'saving_db', 90);
      const dbReportData: Report = {
        id: crypto.randomUUID(),
        spk_number: spkNumber,
        buyer_name: body.buyer_name || undefined,
        phone: body.phone || undefined,
        address: body.address || undefined,
        date: reportDate,
        motor: body.motor || undefined,
        type: body.type || undefined,
        color: body.color || undefined,
        dp: body.dp ? parseFloat(body.dp) : undefined,
        price: body.price ? parseFloat(body.price) : undefined,
        payment_method: body.payment_method || undefined,
        user_email: user.email,
        user_name: user.name,
        user_role: role as 'sales' | 'service',
        status: 'completed',
        drive_folder_id: folderInfo.folderId,
        drive_folder_link: folderInfo.folderLink,
        spk_link: driveLinks['spk_link'],
        ktp_link: driveLinks['ktp_link'],
        noka_link: driveLinks['noka_link'],
        nosin_link: driveLinks['nosin_link'],
        pembayaran_link: driveLinks['pembayaran_link'],
        unit_link: driveLinks['unit_link'],
        ocr_confidence: ocrResult.ocrConfidence,
        ocr_status: ocrResult.ocrStatus,
        upload_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const savedReport = await db.createReport(dbReportData);

      // Log successful upload audit trail
      await db.createAuditLog({
        user_email: user.email,
        user_name: user.name,
        action: 'upload_success',
        details: `Successfully uploaded report for SPK #${spkNumber}. Folder Link: ${folderInfo.folderLink}. ${autoClassificationLog}`,
      });

      // Send confirmation email
      await sendSuccessEmail(user.email, user.name, spkNumber, reportDate, folderInfo.folderLink);

      // Update job to final complete state
      updateJob(jobId, 'completed', 100, { data: savedReport });

    } catch (err: any) {
      console.error(`[Upload API] Job ${jobId} failed:`, err.message);
      
      // Update DB to register failed attempt
      try {
        const failedReport: Report = {
          id: crypto.randomUUID(),
          spk_number: spkNumber,
          buyer_name: body.buyer_name || undefined,
          date: body.date || new Date().toISOString(),
          user_email: user.email,
          user_name: user.name,
          user_role: role as 'sales' | 'service',
          status: 'failed',
          created_at: new Date().toISOString(),
        };
        await db.createReport(failedReport);

        await db.createAuditLog({
          user_email: user.email,
          user_name: user.name,
          action: 'upload_failed',
          details: `Failed upload attempt for SPK #${spkNumber}. Error: ${err.message}`,
        });
      } catch (logErr: any) {
        console.error('[Upload API] Failed to log failure to DB:', logErr.message);
      }

      // Send failure notification email
      await sendFailureEmail(user.email, user.name, spkNumber, err.message);

      // Send Telegram alert
      const tgAlert = `<b>[MOLIS UPLOAD FAILED]</b>\n` +
                      `User: ${user.name} (${user.email})\n` +
                      `SPK: #${spkNumber}\n` +
                      `Role: ${role.toUpperCase()}\n` +
                      `Error: <code>${err.message}</code>\n` +
                      `<i>Please review pending upload queue.</i>`;
      await sendTelegramNotification(tgAlert);

      // Final failure job state
      updateJob(jobId, 'failed', 100, { error: err.message });
    }
  })();
});

// ==========================================
// 4. SSE PROGRESS ENDPOINT
// ==========================================
router.get('/progress/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // If job doesn't exist, send error and end
  if (!job) {
    res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
    return res.end();
  }

  // Send current status immediately
  res.write(`data: ${JSON.stringify(job)}\n\n`);

  // If already finished, end
  if (job.status === 'completed' || job.status === 'failed') {
    return res.end();
  }

  // Listen to emitter updates
  const progressListener = (updatedJob: UploadJob) => {
    res.write(`data: ${JSON.stringify(updatedJob)}\n\n`);
    if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
      // Remove listener and end
      jobEvents.off(jobId, progressListener);
      res.end();
    }
  };

  jobEvents.on(jobId, progressListener);

  // Clean up if client closes connection
  req.on('close', () => {
    jobEvents.off(jobId, progressListener);
  });
});

export default router;
