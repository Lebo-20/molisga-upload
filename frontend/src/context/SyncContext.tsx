import React, { createContext, useContext, useState, useEffect } from 'react';
import { getQueueItems, dequeueUpload, updateQueueItemStatus, base64ToBlob } from '../utils/db';
import type { QueueItem } from '../utils/db';
import api from '../services/api';

interface SyncContextType {
  isOnline: boolean;
  pendingCount: number;
  syncQueue: QueueItem[];
  triggerSync: () => Promise<void>;
  syncingItemId: string | null;
  syncProgress: { status: string; progress: number } | null;
  manualRetryItem: (id: string) => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncQueue, setSyncQueue] = useState<QueueItem[]>([]);
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ status: string; progress: number } | null>(null);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showBrowserNotification('Koneksi Terhubung', 'Sistem mendeteksi Anda kembali online. Memulai sinkronisasi antrean...');
      triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      showBrowserNotification('Koneksi Terputus', 'Sistem beralih ke Mode Offline. Laporan Anda akan disimpan sebagai draft lokal.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check and request permission for notification
    refreshQueueInfo();
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshQueueInfo = async () => {
    try {
      const items = await getQueueItems();
      setSyncQueue(items);
      setPendingCount(items.length);
    } catch (err) {
      console.error('[Sync] Error loading queue:', err);
    }
  };

  // Helper to send browser notifications
  const showBrowserNotification = (title: string, body: string) => {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
      });
    }
  };

  // Upload single item with SSE progress tracking & retries
  const uploadQueueItem = async (item: QueueItem, bypassRetryCount = false): Promise<boolean> => {
    setSyncingItemId(item.id);
    setSyncProgress({ status: 'Memulai upload...', progress: 5 });

    // 1. Build FormData
    const formData = new FormData();
    Object.keys(item.formData).forEach((key) => {
      const value = item.formData[key as keyof typeof item.formData];
      if (value !== undefined) {
        formData.append(key, value.toString());
      }
    });

    // Reconstruct File Blobs from base64
    item.files.forEach((f) => {
      const blob = base64ToBlob(f.base64Data, f.mimeType);
      const file = new File([blob], f.fileName, { type: f.mimeType });
      formData.append(f.fieldName, file);
    });

    try {
      // 2. Submit report and get Job ID
      setSyncProgress({ status: 'Mengirim data ke server...', progress: 15 });
      const response = await api.post('/api/upload/report', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const { jobId } = response.data;
      if (!jobId) {
        throw new Error('Server tidak mengembalikan Job ID');
      }

      // 3. Connect to Server-Sent Events (SSE) for progress streaming
      return new Promise<boolean>((resolve, reject) => {
        const eventSource = new EventSource(`/api/upload/progress/${jobId}`);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.status === 'completed') {
              eventSource.close();
              setSyncProgress({ status: 'Upload Berhasil!', progress: 100 });
              resolve(true);
            } else if (data.status === 'failed') {
              eventSource.close();
              reject(new Error(data.error || 'Proses upload server gagal.'));
            } else {
              // Map backend states to readable Indonesian text
              const statusMap: Record<string, string> = {
                duplication_check: 'Memeriksa duplikasi SPK...',
                processing_ocr: 'Validasi OCR & Scan Dokumen...',
                uploading_drive: 'Mengunggah file ke Google Drive...',
                saving_sheet: 'Menyimpan data ke Google Sheets...',
                saving_db: 'Menyimpan ke Database...',
              };
              const readableStatus = statusMap[data.status] || 'Sedang memproses...';
              setSyncProgress({ status: readableStatus, progress: data.progress });
            }
          } catch (e) {
            console.error('[Sync SSE] Error parsing SSE payload:', e);
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          reject(new Error('Koneksi event stream terputus.'));
        };
      });

    } catch (err: any) {
      console.warn(`[Sync] Upload item ${item.id} failed:`, err.message);

      // Handle Auto-Retry delays: 2s, 5s, 10s
      const retryDelays = [2000, 5000, 10000];
      const nextAttempt = item.retries + 1;

      if (nextAttempt <= 3 && !bypassRetryCount) {
        const delay = retryDelays[item.retries];
        setSyncProgress({
          status: `Gagal. Mencoba kembali otomatis (${nextAttempt}/3) dalam ${delay / 1000} detik...`,
          progress: 50,
        });

        // Update retry attempt in LocalForage
        await updateQueueItemStatus(item.id, 'uploading', { retries: nextAttempt, error: err.message });
        
        // Wait and run upload recursively
        await new Promise((r) => setTimeout(r, delay));
        return await uploadQueueItem({ ...item, retries: nextAttempt }, bypassRetryCount);
      } else {
        // Retries exhausted
        await updateQueueItemStatus(item.id, 'failed', { error: err.message });
        showBrowserNotification(
          'Upload Gagal',
          `Laporan SPK #${item.formData.spk_number || 'Tanpa SPK'} gagal disinkronkan setelah 3 kali percobaan.`
        );
        throw err;
      }
    }
  };

  // Process all queue items sequentially
  const triggerSync = async () => {
    if (!isOnline || syncingItemId) return;

    const items = await getQueueItems();
    const pending = items.filter((item) => item.status !== 'failed');

    if (pending.length === 0) return;

    console.log(`[Sync] Found ${pending.length} items to sync.`);
    
    for (const item of pending) {
      try {
        await updateQueueItemStatus(item.id, 'uploading');
        await refreshQueueInfo();

        const success = await uploadQueueItem(item);
        if (success) {
          await dequeueUpload(item.id);
          showBrowserNotification(
            'Upload Berhasil!',
            `Laporan SPK #${item.formData.spk_number} berhasil disinkronkan ke Google Sheet & Drive.`
          );
        }
      } catch (err: any) {
        console.error(`[Sync] Queue execution failed for item ${item.id}:`, err.message);
      } finally {
        setSyncingItemId(null);
        setSyncProgress(null);
        await refreshQueueInfo();
      }
    }
  };

  // Manual retry trigger from Pending List
  const manualRetryItem = async (id: string) => {
    if (!isOnline) {
      throw new Error('Anda sedang offline. Tidak dapat mengunggah.');
    }
    if (syncingItemId) {
      throw new Error('Ada proses upload lain yang sedang berjalan.');
    }

    const items = await getQueueItems();
    const item = items.find((i) => i.id === id);
    if (!item) throw new Error('Laporan tidak ditemukan dalam antrean.');

    try {
      await updateQueueItemStatus(item.id, 'uploading', { retries: 0 }); // Reset retry counter
      await refreshQueueInfo();
      
      const success = await uploadQueueItem({ ...item, retries: 0 }, true); // Force bypass retry count to allow direct retry
      if (success) {
        await dequeueUpload(item.id);
        showBrowserNotification(
          'Upload Berhasil!',
          `Laporan SPK #${item.formData.spk_number} berhasil disinkronkan.`
        );
      }
    } catch (err: any) {
      console.error('[Sync] Manual retry failed:', err.message);
      throw err;
    } finally {
      setSyncingItemId(null);
      setSyncProgress(null);
      await refreshQueueInfo();
    }
  };

  // Run initial trigger sync once online status loads
  useEffect(() => {
    if (isOnline) {
      triggerSync();
    }
  }, [isOnline]);

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        pendingCount,
        syncQueue,
        triggerSync,
        syncingItemId,
        syncProgress,
        manualRetryItem,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
