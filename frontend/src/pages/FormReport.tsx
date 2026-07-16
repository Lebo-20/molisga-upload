import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import api from '../services/api';
import { 
  saveDraft, getDraft, clearDraft, enqueueUpload, fileToBase64 
} from '../utils/db';
import type { FormDraft, QueueFile } from '../utils/db';
import { compressImageClient, validateFile } from '../utils/image';
import { 
  UploadCloud, CheckCircle2, AlertCircle, RefreshCw, AlertTriangle, ShieldCheck,
  X, Camera, Images, CreditCard, Receipt, Bike, Hash, Settings2
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const FormReport: React.FC = () => {
  const { user } = useAuth();
  const { isOnline } = useSync();

  // Form Fields States
  const [formData, setFormData] = useState<Omit<FormDraft, 'updated_at'>>({
    spk_number: '',
    buyer_name: '',
    phone: '-',
    address: '-',
    date: new Date().toISOString().substring(0, 10),
    motor: 'Uwinfly',
    type: 'Moped',
    color: '-',
    dp: '0',
    price: '0',
    payment_method: 'Cash',
  });

  // Files States
  const [files, setFiles] = useState<Record<string, File>>({});
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});

  // OCR Status States
  const [ocrLoading, setOcrLoading] = useState(false);
  const [, setOcrStatus] = useState<'success' | 'failed' | 'low_confidence' | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);

  // Duplication warning info
  const [duplicateWarning, setDuplicateWarning] = useState<any>(null);
  const [bypassDuplicate, setBypassDuplicate] = useState(false);

  // Upload Progress States
  const [, setUploadJobId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<{ status: string; progress: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Load Autosaved Draft on Mount
  useEffect(() => {
    if (user) {
      getDraft(user.email).then((draft) => {
        if (draft) {
          const { updated_at, ...rest } = draft;
          setFormData((prev) => ({ ...prev, ...rest }));
        }
      });
    }
  }, [user]);

  // Autosave Form Fields to IndexedDB
  useEffect(() => {
    if (!user) return;
    const save = async () => {
      await saveDraft(user.email, {
        ...formData,
        updated_at: new Date().toISOString(),
      });
    };
    
    // Simple debounce for autosave
    const timer = setTimeout(save, 500);
    return () => clearTimeout(timer);
  }, [formData, user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Perform immediate OCR upon selecting SPK file
  const handleSpkFileChange = async (file: File) => {
    if (!isOnline) {
      setOcrMessage('Sistem sedang offline. OCR dimatikan, mohon isi Nomor SPK manual.');
      return;
    }

    setOcrLoading(true);
    setOcrStatus(null);
    setOcrConfidence(null);
    setOcrMessage(null);
    setDuplicateWarning(null);

    try {
      // 1. Compress file client-side first
      const compressed = await compressImageClient(file);
      
      // 2. Prepare upload payload for preview OCR
      const payload = new FormData();
      payload.append('file', compressed);

      // 3. Post to backend
      const res = await api.post('/api/upload/ocr', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { spkNumber, ocrConfidence: conf, ocrStatus: status } = res.data;

      if (spkNumber) {
        setFormData((prev) => ({ ...prev, spk_number: spkNumber }));
        setOcrConfidence(conf);
        setOcrStatus(status);
        
        // Auto-check duplicates for this detected SPK number
        checkSpkDuplication(spkNumber);
      } else {
        setOcrStatus('failed');
        setOcrMessage('Nomor SPK tidak dapat dideteksi, silakan foto ulang atau isi manual.');
      }
    } catch (err: any) {
      console.error('[OCR Frontend] Error:', err);
      setOcrStatus('failed');
      setOcrMessage('Nomor SPK tidak dapat dideteksi, silakan foto ulang atau isi manual.');
    } finally {
      setOcrLoading(false);
    }
  };

  // Check duplicate SPK
  const checkSpkDuplication = async (spk: string) => {
    if (!isOnline || !spk) return;
    try {
      // Check sheet duplication via post to query
      const res = await api.get(`/api/reports/${spk}`);
      if (res.data) {
        setDuplicateWarning(res.data);
      }
    } catch {
      // 404 report not found is success (no duplicate)
      setDuplicateWarning(null);
    }
  };

  const handleFileChange = (fieldName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type and size
    const validation = validateFile(file);
    if (!validation.isValid) {
      setFileErrors((prev) => ({ ...prev, [fieldName]: validation.error || 'File tidak valid' }));
      return;
    }
    
    // Clear errors
    setFileErrors((prev) => {
      const copy = { ...prev };
      delete copy[fieldName];
      return copy;
    });


    setFiles((prev) => ({ ...prev, [fieldName]: file }));
    setFilePreviews((prev) => ({ ...prev, [fieldName]: URL.createObjectURL(file) }));

    // SPK specific OCR trigger
    if (fieldName === 'spk') {
      handleSpkFileChange(file);
    }
  };


  const removeSupportingFile = (keyName: string) => {
    setFiles((prev) => {
      const copy = { ...prev };
      delete copy[keyName];
      return copy;
    });
    setFilePreviews((prev) => {
      const copy = { ...prev };
      delete copy[keyName];
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;
    
    // Reset statuses
    setUploadError(null);
    setUploadSuccess(false);

    // Simple validation of text fields
    if (!formData.spk_number) {
      alert('Nomor SPK wajib diisi!');
      return;
    }

    // Validate files selected (Only SPK/Invoice is mandatory now)
    if (!files['spk']) {
      alert('Dokumen SPK / Invoice wajib diunggah!');
      return;
    }

    // ==========================================
    // OFFLINE SUBMISSION FLOW (INDEXEDDB QUEUE)
    // ==========================================
    if (!isOnline) {
      setUploading(true);
      setUploadState({ status: 'Sistem offline. Menyimpan laporan ke antrean PWA...', progress: 40 });
      
      try {
        const queueFiles: QueueFile[] = [];
        for (const fieldName of Object.keys(files)) {
          const file = files[fieldName];
          // Compress file before saving offline to save storage space
          const compressed = await compressImageClient(file);
          const base64 = await fileToBase64(compressed);
          queueFiles.push({
            fieldName,
            fileName: file.name,
            mimeType: 'image/jpeg',
            base64Data: base64,
          });
        }

        const queueItem = {
          id: Math.random().toString(36).substr(2, 9),
          userEmail: user.email,
          userName: user.name,
          userRole: (user.role === 'service' ? 'service' : 'sales') as 'sales' | 'service',
          formData: { ...formData },
          files: queueFiles,
          timestamp: new Date().toISOString(),
          status: 'pending' as const,
          retries: 0,
        };

        await enqueueUpload(queueItem);
        
        // Reset form & clear draft
        clearForm();
        setUploadState({ status: 'Disimpan!', progress: 100 });
        setUploadSuccess(true);
        setTimeout(() => {
          setUploading(false);
          setUploadSuccess(false);
        }, 3000);
      } catch (err: any) {
        setUploadError('Gagal menyimpan ke antrean offline: ' + err.message);
      }
      return;
    }

    // ==========================================
    // ONLINE SUBMISSION FLOW (SSE EVENTSTREAM)
    // ==========================================
    setUploading(true);
    setUploadState({ status: 'Menyiapkan berkas...', progress: 5 });

    const reportPayload = new FormData();
    Object.keys(formData).forEach((key) => {
      const val = formData[key as keyof typeof formData];
      if (val !== undefined) {
        reportPayload.append(key, val.toString());
      }
    });

    if (bypassDuplicate) {
      reportPayload.append('bypassDuplicate', 'true');
    }

    // Compress & Append files to FormData
    try {
      setUploadState({ status: 'Kompresi gambar di perangkat...', progress: 15 });
      for (const fieldName of Object.keys(files)) {
        const file = files[fieldName];
        const compressed = await compressImageClient(file);
        reportPayload.append(fieldName, compressed);
      }

      // Send report
      setUploadState({ status: 'Mengirim formulir laporan...', progress: 25 });
      const res = await api.post('/api/upload/report', reportPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { jobId } = res.data;
      setUploadJobId(jobId);

      // Listen to SSE
      const eventSource = new EventSource(`/api/upload/progress/${jobId}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === 'completed') {
          eventSource.close();
          setUploadState({ status: 'Selesai!', progress: 100 });
          setUploadSuccess(true);
          clearForm();
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 }
          });
        } else if (data.status === 'failed') {
          eventSource.close();
          setUploadError(data.error || 'Gagal terunggah.');
        } else {
          // Status Map
          const statusMap: Record<string, string> = {
            duplication_check: 'Memeriksa duplikasi SPK...',
            processing_ocr: 'Validasi OCR & Scan Dokumen...',
            uploading_drive: 'Mengunggah file ke Google Drive...',
            saving_sheet: 'Menyimpan data ke Google Sheets...',
            saving_db: 'Menyimpan ke Database...',
          };
          setUploadState({
            status: statusMap[data.status] || 'Memproses...',
            progress: data.progress,
          });
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setUploadError('Koneksi terputus saat memantau status upload.');
      };

    } catch (err: any) {
      setUploadError(err.message || 'Gagal memulai proses upload.');
    }
  };

  const clearForm = () => {
    if (user) clearDraft(user.email);
    setFormData({
      spk_number: '',
      buyer_name: '',
      phone: '',
      address: '',
      date: new Date().toISOString().substring(0, 10),
      motor: 'Gesits',
      type: 'G1',
      color: 'Hitam',
      dp: '',
      price: '',
      payment_method: 'Cash',
    });
    setFiles({});
    setFilePreviews({});
    setOcrStatus(null);
    setOcrConfidence(null);
    setOcrMessage(null);
    setDuplicateWarning(null);
    setBypassDuplicate(false);
  };

  // Determine Form UI structure
  const formRole = user?.role === 'service' ? 'service' : 'sales';

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto text-zinc-100">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Form Laporan {formRole === 'sales' ? 'Sales SPK' : 'Service Center'}
        </h1>
        <p className="text-sm text-zinc-400 mt-2">
          {formRole === 'sales' 
            ? 'Isi formulir penjualan motor listrik dan upload seluruh berkas fisik pendukung.'
            : 'Upload SPK motor dan bukti pelunasan biaya perbaikan service.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 bg-zinc-900/40 p-6 md:p-8 rounded-2xl border border-zinc-800 backdrop-blur-sm">
        
        {/* DUPLICATE WARNING DIALOG */}
        {duplicateWarning && (
          <div className="p-4 bg-amber-500/10 border-l-4 border-amber-500 rounded text-amber-300 text-sm space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>⚠️ Nomor SPK Sudah Pernah Diupload!</span>
            </div>
            <p>
              Nomor SPK <strong>#{formData.spk_number}</strong> sudah diupload oleh{' '}
              <strong>{duplicateWarning.user_name || duplicateWarning.user_email}</strong> pada{' '}
              {new Date(duplicateWarning.created_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })} dengan status{' '}
              <span className="font-bold text-white bg-zinc-800 px-2 py-0.5 rounded text-xs capitalize">
                {duplicateWarning.status}
              </span>.
            </p>
            {user?.role === 'admin' ? (
              <label className="flex items-center gap-2 mt-3 cursor-pointer bg-zinc-800/60 p-2.5 rounded-lg border border-zinc-700/60 w-fit">
                <input
                  type="checkbox"
                  checked={bypassDuplicate}
                  onChange={(e) => setBypassDuplicate(e.target.checked)}
                  className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 bg-zinc-900"
                />
                <span className="text-xs font-semibold text-white">Bypass & Upload Duplikasi (Akses Admin)</span>
              </label>
            ) : (
              <p className="text-xs text-rose-300 mt-2">
                User non-admin dilarang melakukan upload ulang untuk SPK yang sama. Silakan ganti berkas atau ubah Nomor SPK.
              </p>
            )}
          </div>
        )}

        {/* =============================================
            FORM SERVICE CENTER (role === 'service')
            Hanya: Nama/No SPK, Foto SPK, Bukti Bayar
        ============================================= */}
        {formRole === 'service' ? (
          <div className="space-y-6">

            {/* Nama / Nomor SPK */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                Nama / Nomor SPK *
              </label>
              <input
                type="text"
                name="spk_number"
                value={formData.spk_number}
                onChange={(e) => {
                  handleInputChange(e);
                  checkSpkDuplication(e.target.value);
                }}
                placeholder="cth: 12142 atau nama pelanggan"
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white font-bold"
              />
              <span className="text-[10px] text-zinc-500 block">
                Diisi otomatis via scan OCR, atau diinput manual.
              </span>
            </div>

            {/* Foto SPK */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                Foto SPK *
              </label>
              <span className="text-[10px] text-zinc-500 block -mt-1">Upload 1 supported file. Max 10 MB.</span>

              {/* Preview */}
              {filePreviews['spk'] && (
                <div className="mb-2 rounded-xl overflow-hidden border border-zinc-800">
                  <img src={filePreviews['spk']} alt="SPK" className="w-full h-36 object-cover" />
                  <div className="px-3 py-1.5 bg-zinc-900 text-[10px] text-zinc-400 truncate flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    {files['spk']?.name}
                  </div>
                </div>
              )}

              {/* OCR Result */}
              {ocrLoading && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Memproses OCR (Mendeteksi Nomor SPK)...</span>
                </div>
              )}
              {ocrConfidence !== null && (
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl border bg-zinc-950 text-xs border-zinc-800">
                  <span className="text-zinc-500">OCR Confidence:</span>
                  <span className={`px-2 py-0.5 rounded font-bold ${
                    ocrConfidence >= 95 ? 'bg-emerald-500/20 text-emerald-400' :
                    ocrConfidence >= 80 ? 'bg-amber-500/20 text-amber-400' :
                    'bg-rose-500/20 text-rose-400'
                  }`}>{ocrConfidence}%</span>
                  {ocrConfidence >= 95 && (
                    <span className="text-emerald-500 flex items-center gap-1 font-semibold">
                      <ShieldCheck className="w-4 h-4" /> Valid
                    </span>
                  )}
                </div>
              )}
              {ocrMessage && <p className="text-rose-400 text-xs font-semibold">{ocrMessage}</p>}

              {/* Kamera + Galeri */}
              <div className="flex gap-2">
                <label className="flex-1 relative cursor-pointer">
                  <input
                    type="file" accept="image/*" capture="environment"
                    onChange={(e) => handleFileChange('spk', e)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                  <div className={`flex items-center justify-center gap-2 rounded-xl py-3 px-3 text-xs font-semibold transition-all duration-200 ${
                    files['spk']
                      ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-zinc-950'
                  }`}>
                    <Camera className="w-4 h-4" />
                    {files['spk'] ? 'Ambil Ulang' : 'Kamera'}
                  </div>
                </label>
                <label className="flex-1 relative cursor-pointer">
                  <input
                    type="file" accept="image/*"
                    onChange={(e) => handleFileChange('spk', e)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                  <div className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl py-3 px-3 text-xs font-semibold transition-all duration-200">
                    <Images className="w-4 h-4" />
                    Galeri
                  </div>
                </label>
              </div>
              {fileErrors['spk'] && <p className="text-rose-400 text-xs">{fileErrors['spk']}</p>}
            </div>

            {/* Foto Bukti Pembayaran */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                Foto Bukti Pembayaran *
              </label>

              {/* Preview */}
              {filePreviews['pembayaran'] && (
                <div className="mb-2 rounded-xl overflow-hidden border border-zinc-800">
                  <img src={filePreviews['pembayaran']} alt="Bukti Bayar" className="w-full h-36 object-cover" />
                  <div className="px-3 py-1.5 bg-zinc-900 text-[10px] text-zinc-400 truncate flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    {files['pembayaran']?.name}
                  </div>
                </div>
              )}

              {/* Kamera + Galeri */}
              <div className="flex gap-2">
                <label className="flex-1 relative cursor-pointer">
                  <input
                    type="file" accept="image/*" capture="environment"
                    onChange={(e) => handleFileChange('pembayaran', e)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                  <div className={`flex items-center justify-center gap-2 rounded-xl py-3 px-3 text-xs font-semibold transition-all duration-200 ${
                    files['pembayaran']
                      ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-zinc-950'
                  }`}>
                    <Camera className="w-4 h-4" />
                    {files['pembayaran'] ? 'Ambil Ulang' : 'Kamera'}
                  </div>
                </label>
                <label className="flex-1 relative cursor-pointer">
                  <input
                    type="file" accept="image/*"
                    onChange={(e) => handleFileChange('pembayaran', e)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                  <div className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl py-3 px-3 text-xs font-semibold transition-all duration-200">
                    <Images className="w-4 h-4" />
                    Galeri
                  </div>
                </label>
              </div>
              {fileErrors['pembayaran'] && <p className="text-rose-400 text-xs">{fileErrors['pembayaran']}</p>}
            </div>
          </div>

        ) : (
          /* =============================================
             FORM SALES / ADMIN — Section 1, 2, 3
          ============================================= */
          <>
            {/* SECTION 1: SPK UPLOAD & OCR */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2">
                1. Scan Dokumen Utama
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* SPK File Picker */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Foto Surat Pesanan Kendaraan (SPK) *
                  </label>

                  <div className="flex gap-2">
                    <label className="flex-1 relative cursor-pointer">
                      <input
                        type="file" accept="image/*" capture="environment"
                        onChange={(e) => handleFileChange('spk', e)}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      />
                      <div className={`flex items-center justify-center gap-2 rounded-xl py-3 px-3 text-xs font-semibold transition-all duration-200 ${
                        files['spk']
                          ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                          : 'bg-emerald-500 hover:bg-emerald-600 text-zinc-950'
                      }`}>
                        <Camera className="w-4 h-4" />
                        {files['spk'] ? 'Ambil Ulang' : 'Kamera'}
                      </div>
                    </label>
                    <label className="flex-1 relative cursor-pointer">
                      <input
                        type="file" accept="image/*"
                        onChange={(e) => handleFileChange('spk', e)}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      />
                      <div className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl py-3 px-3 text-xs font-semibold transition-all duration-200">
                        <Images className="w-4 h-4" />
                        Galeri
                      </div>
                    </label>
                  </div>

                  {filePreviews['spk'] && (
                    <div className="rounded-xl overflow-hidden border border-zinc-800">
                      <img src={filePreviews['spk']} alt="SPK" className="w-full h-32 object-cover" />
                      <div className="px-3 py-1.5 bg-zinc-900 text-[10px] text-zinc-400 truncate flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        {files['spk']?.name}
                      </div>
                    </div>
                  )}

                  {fileErrors['spk'] && <p className="text-rose-400 text-xs">{fileErrors['spk']}</p>}

                  {/* OCR Result Badge */}
                  {ocrLoading && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>Memproses OCR (Mendeteksi Nomor SPK)...</span>
                    </div>
                  )}
                  {ocrConfidence !== null && (
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl border bg-zinc-950 text-xs border-zinc-800">
                      <span className="text-zinc-500">OCR Confidence:</span>
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        ocrConfidence >= 95 ? 'bg-emerald-500/20 text-emerald-400' :
                        ocrConfidence >= 80 ? 'bg-amber-500/20 text-amber-400' :
                        'bg-rose-500/20 text-rose-400'
                      }`}>{ocrConfidence}%</span>
                      {ocrConfidence >= 95 && (
                        <span className="text-emerald-500 flex items-center gap-1 font-semibold">
                          <ShieldCheck className="w-4 h-4" /> Valid
                        </span>
                      )}
                    </div>
                  )}
                  {ocrMessage && <p className="text-rose-400 text-xs font-semibold">{ocrMessage}</p>}
                </div>

                {/* SPK Number Input */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                    Nomor SPK *
                  </label>
                  <input
                    type="text"
                    name="spk_number"
                    value={formData.spk_number}
                    onChange={(e) => {
                      handleInputChange(e);
                      checkSpkDuplication(e.target.value);
                    }}
                    placeholder="cth: 12142"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white font-bold"
                  />
                  <span className="text-[10px] text-zinc-500 block">
                    Diisi otomatis via scan OCR SPK, atau diinput manual jika scan tidak terbaca.
                  </span>
                </div>
              </div>
            </div>

            {/* SECTION 2: REPORT DETAILS */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2">
                2. Data Detail Laporan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Tanggal Laporan *</label>
                  <input
                    type="date" name="date" value={formData.date}
                    onChange={handleInputChange}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Nama Pembeli *</label>
                  <input
                    type="text" name="buyer_name" value={formData.buyer_name}
                    onChange={handleInputChange} placeholder="Nama Lengkap Pembeli" required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Model Motor/sepeda *</label>
                  <select
                    name="motor" value={formData.motor} onChange={handleInputChange}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white"
                  >
                    <option value="Uwinfly">Uwinfly</option>
                    <option value="Yadea">Yadea</option>
                    <option value="Ofero">Ofero</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 3: SUPPORTING DOCS */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2">
                3. Upload Berkas Pendukung (Opsional)
              </h3>

              {/* Chip ringkasan jenis berkas yang diharapkan */}
              <div className="flex flex-wrap gap-2 mb-4">
                {([
                  { label: 'KTP Pembeli', key: 'ktp',        Icon: CreditCard },
                  { label: 'Bukti Bayar', key: 'pembayaran',  Icon: Receipt },
                  { label: 'Unit',        key: 'unit',        Icon: Bike },
                  { label: 'No Rangka',   key: 'noka',        Icon: Hash },
                  { label: 'No Mesin',    key: 'nosin',       Icon: Settings2 },
                ] as const).map(({ label, key, Icon }) => (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                      files[key as string]
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                    {files[key as string] && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                  </span>
                ))}
              </div>

              {/* Grid slot per jenis berkas */}
              <div className="grid grid-cols-1 gap-4">
                {([
                  { key: 'ktp',        label: 'KTP Pembeli',        Icon: CreditCard },
                  { key: 'pembayaran', label: 'Bukti Pembayaran',    Icon: Receipt },
                  { key: 'noka',       label: 'No Rangka Unit',      Icon: Hash },
                  { key: 'nosin',      label: 'No Mesin Unit',       Icon: Settings2 },
                  { key: 'unit',       label: 'Serah Terima Unit',   Icon: Bike },
                ] as const).map(({ key, label, Icon }) => {
                  const file = files[key as string];
                  const preview = filePreviews[key as string];
                  return (
                    <div
                      key={key}
                      className={`border rounded-2xl p-4 transition-all duration-200 ${
                        file ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-950/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-white flex items-center gap-2">
                          <Icon className="w-4 h-4 text-zinc-400" />
                          {label}
                        </span>
                        {file && (
                          <button
                            type="button"
                            onClick={() => removeSupportingFile(key)}
                            className="text-zinc-500 hover:text-rose-400 p-1 rounded-lg hover:bg-zinc-900 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {preview && (
                        <div className="mb-3 rounded-xl overflow-hidden border border-zinc-800">
                          <img src={preview} alt={label} className="w-full h-28 object-cover" />
                          <div className="px-3 py-1.5 bg-zinc-900 text-[10px] text-zinc-400 truncate flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            {file?.name}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <label className="flex-1 relative cursor-pointer">
                          <input
                            type="file" accept="image/*" capture="environment"
                            onChange={(e) => handleFileChange(key, e)}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          />
                          <div className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold transition-all duration-200 ${
                            file
                              ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                              : 'bg-emerald-500 hover:bg-emerald-600 text-zinc-950'
                          }`}>
                            <Camera className="w-4 h-4" />
                            {file ? 'Ambil Ulang' : 'Kamera'}
                          </div>
                        </label>
                        <label className="flex-1 relative cursor-pointer">
                          <input
                            type="file" accept="image/*"
                            onChange={(e) => handleFileChange(key, e)}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          />
                          <div className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl py-2.5 px-3 text-xs font-semibold transition-all duration-200">
                            <Images className="w-4 h-4" />
                            Galeri
                          </div>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Submit Actions */}
        <div className="flex gap-4 border-t border-zinc-800 pt-6">
          <button
            type="submit"
            disabled={uploading || (duplicateWarning && !bypassDuplicate)}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-600 rounded-xl py-3.5 font-bold transition-all duration-200 shadow-lg cursor-pointer"
          >
            <UploadCloud className="w-5 h-5" />
            {uploading ? 'Sedang Mengunggah...' : isOnline ? 'Submit Laporan' : 'Submit Offline (Simpan Draft)'}
          </button>
          
          <button
            type="button"
            onClick={clearForm}
            className="px-6 py-3.5 bg-zinc-800 hover:bg-zinc-700 hover:text-white text-zinc-400 rounded-xl font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      </form>

      {/* UPLOAD PROGRESS SSE DIALOG MODAL */}
      {uploading && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-6">
            <h3 className="font-extrabold text-white text-lg tracking-tight">Status Proses Upload</h3>

            {uploadError ? (
              <div className="space-y-4 text-center py-4">
                <AlertCircle className="w-16 h-16 text-rose-500 mx-auto" />
                <div className="text-rose-400 text-sm font-semibold p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  {uploadError}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setUploadError(null);
                      handleSubmit({ preventDefault: () => {} } as any);
                    }}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl py-2.5 font-bold text-sm"
                  >
                    Retry Upload
                  </button>
                  <button
                    onClick={() => setUploading(false)}
                    className="px-4 py-2.5 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-sm font-medium"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : uploadSuccess ? (
              <div className="space-y-4 text-center py-4">
                <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto animate-pulse" />
                <div className="text-white font-bold">Upload Berhasil!</div>
                <p className="text-xs text-zinc-400">
                  Data SPK #{formData.spk_number} telah berhasil disimpan ke Google Sheets dan seluruh foto tersimpan di Google Drive.
                </p>
                <button
                  onClick={() => setUploading(false)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl py-2.5 font-medium text-sm"
                >
                  Selesai
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Stepper Status */}
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-medium">{uploadState?.status}</span>
                  <span className="font-bold text-emerald-400">{uploadState?.progress}%</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    style={{ width: `${uploadState?.progress}%` }}
                  />
                </div>

                <div className="text-[10px] text-zinc-500 text-center leading-relaxed">
                  Proses ini memerlukan waktu beberapa detik untuk mengompresi gambar dan mengunggah ke Google Drive Cloud. Jangan tutup browser.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


