import React, { useState } from 'react';
import { useSync } from '../context/SyncContext';
import { dequeueUpload } from '../utils/db';
import type { QueueItem } from '../utils/db';
import { 
  RefreshCw, Trash2, CloudOff, AlertTriangle, Clock, Wifi 
} from 'lucide-react';
import { formatBytes } from '../utils/image';

export const Drafts: React.FC = () => {
  const { 
    isOnline, pendingCount, syncQueue, syncingItemId, syncProgress, manualRetryItem, triggerSync 
  } = useSync();
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleManualRetry = async (id: string) => {
    setActionError(null);
    setRetryingId(id);
    try {
      await manualRetryItem(id);
    } catch (err: any) {
      setActionError(err.message || 'Gagal sinkronisasi laporan.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDeleteQueue = async (id: string) => {
    if (!window.confirm('Hapus laporan ini dari antrean pending upload? Data akan terhapus permanen dari perangkat.')) return;
    try {
      await dequeueUpload(id);
      window.location.reload(); // Quick refresh to reload context sync state
    } catch (err: any) {
      setActionError('Gagal menghapus: ' + err.message);
    }
  };

  // Helper to calculate total sizes of files in queue
  const calculateQueueSize = (item: QueueItem) => {
    let bytes = 0;
    item.files.forEach((f) => {
      // Approximate bytes from base64 length (3 bytes for every 4 base64 chars)
      bytes += Math.round((f.base64Data.length * 3) / 4);
    });
    return formatBytes(bytes);
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto text-zinc-100 space-y-8">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Antrean Upload & Drafts</h1>
        <p className="text-sm text-zinc-400 mt-2">
          Kelola laporan yang tersimpan secara lokal karena kendala jaringan internet atau kesalahan teknis.
        </p>
      </div>

      {/* Connection Indicator Alert */}
      <div className={`p-4 rounded-2xl border flex gap-3 items-center ${
        isOnline 
          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
          : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
      }`}>
        {isOnline ? (
          <>
            <Wifi className="w-5 h-5 flex-shrink-0 animate-pulse" />
            <div className="text-sm">
              <span className="font-bold">Sistem Terhubung (Online):</span> Antrean pending akan disinkronisasikan secara otomatis ke Cloud. Anda juga dapat memicu upload manual di bawah.
            </div>
          </>
        ) : (
          <>
            <CloudOff className="w-5 h-5 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-bold">Mode Offline Aktif:</span> Seluruh laporan yang Anda submit disimpan aman di memori perangkat (IndexedDB) dan akan otomatis terkirim saat internet kembali tersedia.
            </div>
          </>
        )}
      </div>

      {actionError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/25 text-rose-300 rounded-xl text-sm flex gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Syncing Progress Card */}
      {syncingItemId && syncProgress && (
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center text-sm font-semibold">
            <span className="flex items-center gap-2 text-white">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              Sinkronisasi Laporan (SPK #{syncQueue.find(i => i.id === syncingItemId)?.formData.spk_number})
            </span>
            <span className="text-emerald-400">{syncProgress.progress}%</span>
          </div>

          <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${syncProgress.progress}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500">{syncProgress.status}</p>
        </div>
      )}

      {/* Queue items list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-lg flex items-center gap-2">
            Antrean Tertunda ({pendingCount})
          </h3>
          {isOnline && pendingCount > 0 && !syncingItemId && (
            <button
              onClick={triggerSync}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold rounded-xl text-xs transition-colors"
            >
              Sinkronkan Sekarang
            </button>
          )}
        </div>

        {syncQueue.length === 0 ? (
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500 text-sm">
            🎉 Tidak ada laporan dalam antrean. Seluruh data berhasil sinkron dengan server.
          </div>
        ) : (
          <div className="space-y-4">
            {syncQueue.map((item) => {
              const isSyncingThis = syncingItemId === item.id;
              const isRetryingThis = retryingId === item.id;
              
              return (
                <div
                  key={item.id}
                  className={`
                    bg-zinc-900/60 border rounded-2xl p-5 transition-all duration-200
                    ${item.status === 'failed' ? 'border-rose-500/20 bg-rose-500/[0.01]' : 'border-zinc-800'}
                    ${isSyncingThis ? 'border-emerald-500/20 bg-emerald-500/[0.01]' : ''}
                  `}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Item Information */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-lg">SPK #{item.formData.spk_number}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                          item.status === 'failed' ? 'bg-rose-500/20 text-rose-400' :
                          item.status === 'uploading' ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' :
                          'bg-zinc-800 text-zinc-400'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-xs text-zinc-400">
                        <div>
                          <span className="text-zinc-600 block">Customer:</span>
                          <span className="font-medium text-zinc-300">{item.formData.buyer_name || 'Service Center'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-600 block">Metode Bayar:</span>
                          <span className="font-medium text-zinc-300 capitalize">{item.formData.payment_method || 'Cash'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-600 block">Ukuran Berkas:</span>
                          <span className="font-medium text-zinc-300">{calculateQueueSize(item)}</span>
                        </div>
                        <div>
                          <span className="text-zinc-600 block">Dibuat Pada:</span>
                          <span className="font-medium text-zinc-300 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-zinc-500" />
                            {new Date(item.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 self-end md:self-auto">
                      <button
                        onClick={() => handleManualRetry(item.id)}
                        disabled={!isOnline || !!syncingItemId || isRetryingThis}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-850 text-zinc-950 disabled:text-zinc-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        {isRetryingThis ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        Retry Upload
                      </button>

                      <button
                        onClick={() => handleDeleteQueue(item.id)}
                        disabled={isSyncingThis}
                        className="p-2 bg-zinc-800 hover:bg-rose-500/10 border border-zinc-850 hover:border-rose-500/20 text-zinc-400 hover:text-rose-400 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Failure Message detail */}
                  {item.status === 'failed' && item.error && (
                    <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs flex gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Kesalahan Unggahan:</span>
                        {item.error}
                      </div>
                    </div>
                  )}

                  {/* Sync status progress loader bar inside item */}
                  {isSyncingThis && syncProgress && (
                    <div className="mt-4 space-y-2">
                      <div className="w-full h-1 bg-zinc-950 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${syncProgress.progress}%` }} />
                      </div>
                      <div className="text-[10px] text-emerald-400 animate-pulse">{syncProgress.status}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
