import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import api from '../services/api';
import { 
  Search, Calendar, User, RefreshCw, 
  X, FolderOpen, Edit3, Trash2, Link, FileCheck, MapPin, Phone 
} from 'lucide-react';

export const History: React.FC = () => {
  const { user } = useAuth();
  const { isOnline } = useSync();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  // Filters State
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Editing state for Admin
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    fetchReports();
  }, [isOnline, query, status, startDate, endDate]);

  const fetchReports = async () => {
    try {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (status) params.append('status', status);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await api.get(`/api/reports?${params.toString()}`);
      setReports(res.data);
      
      // Update selected report if it exists in the list
      if (selectedReport) {
        const updated = res.data.find((r: any) => r.spk_number === selectedReport.spk_number);
        if (updated) setSelectedReport(updated);
      }
    } catch (err) {
      console.error('[History] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (report: any) => {
    setSelectedReport(report);
    setIsEditing(false);
  };

  const handleClosePanel = () => {
    setSelectedReport(null);
    setIsEditing(false);
  };

  // Admin delete trigger
  const handleDelete = async (spk: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus laporan SPK #${spk}?`)) return;
    try {
      await api.delete(`/api/reports/${spk}`);
      setSelectedReport(null);
      fetchReports();
      alert('Laporan berhasil dihapus');
    } catch (err: any) {
      alert('Gagal menghapus: ' + err.message);
    }
  };

  // Admin retry trigger for failed uploads
  const handleRetry = async (spk: string) => {
    try {
      setSelectedReport((prev: any) => ({ ...prev, status: 'pending' }));
      const res = await api.post(`/api/reports/retry/${spk}`);
      alert(res.data.message || 'Retry berhasil!');
      fetchReports();
    } catch (err: any) {
      alert('Retry gagal: ' + err.message);
      fetchReports();
    }
  };

  // Admin edit submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.put(`/api/reports/${selectedReport.spk_number}`, editForm);
      setSelectedReport(res.data);
      setIsEditing(false);
      fetchReports();
      alert('Data berhasil diperbarui!');
    } catch (err: any) {
      alert('Gagal mengupdate data: ' + err.message);
    }
  };

  const startEditing = () => {
    setEditForm({
      buyer_name: selectedReport.buyer_name || '',
      phone: selectedReport.phone || '',
      address: selectedReport.address || '',
      motor: selectedReport.motor || '',
      type: selectedReport.type || '',
      color: selectedReport.color || '',
      price: selectedReport.price || '',
      dp: selectedReport.dp || '',
    });
    setIsEditing(true);
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto text-zinc-100 flex flex-col h-[calc(100vh-64px)] md:h-screen">
      
      {/* Page Header */}
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Riwayat Laporan</h1>
        <p className="text-sm text-zinc-400 mt-1">Cari dan periksa detail seluruh dokumen SPK yang pernah dikirim.</p>
      </div>

      {/* Interactive Filters Area */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-zinc-900/40 p-4 rounded-2xl border border-zinc-800 mb-6 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Cari SPK, pembeli..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">Semua Status</option>
            <option value="completed">Completed (Berhasil)</option>
            <option value="pending">Pending (Mengunggah)</option>
            <option value="failed">Failed (Gagal)</option>
          </select>
        </div>

        <div className="relative">
          <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="relative">
          <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          onClick={() => {
            setQuery('');
            setStatus('');
            setStartDate('');
            setEndDate('');
          }}
          className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-sm font-semibold transition-colors"
        >
          Reset Filter
        </button>
      </div>

      {/* Main Split Content Panel */}
      <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
        
        {/* Table Container */}
        <div className={`
          bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-full transition-all duration-300
          ${selectedReport ? 'w-full lg:w-2/3' : 'w-full'}
        `}>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-zinc-950 border-b border-zinc-800 z-10">
                <tr>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">SPK</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Tanggal</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Reporter</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Customer / Pembeli</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Motor</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500 text-sm">Loading logs...</td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500 text-sm">Tidak ada laporan ditemukan</td>
                  </tr>
                ) : (
                  reports.map((report) => {
                    const isSelected = selectedReport?.spk_number === report.spk_number;
                    return (
                      <tr
                        key={report.spk_number}
                        onClick={() => handleRowClick(report)}
                        className={`
                          hover:bg-zinc-850/60 cursor-pointer transition-colors duration-150
                          ${isSelected ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : ''}
                        `}
                      >
                        <td className="p-4 font-mono font-bold text-white text-sm">#{report.spk_number}</td>
                        <td className="p-4 text-sm text-zinc-400">
                          {new Date(report.date).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                        </td>
                        <td className="p-4 text-sm text-zinc-400">
                          <div className="font-semibold text-zinc-200">{report.user_name}</div>
                          <div className="text-[10px] text-zinc-500">{report.user_email}</div>
                        </td>
                        <td className="p-4 text-sm text-zinc-400">
                          {report.buyer_name || <span className="text-zinc-600 text-xs italic">Service Center Log</span>}
                        </td>
                        <td className="p-4 text-sm text-zinc-400">
                          {report.motor ? `${report.motor} ${report.type || ''}` : <span className="text-zinc-600">-</span>}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${
                            report.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                            report.status === 'pending' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20 animate-pulse' :
                            'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                          }`}>
                            {report.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETAILS / INVESTIGATION PANEL */}
        {selectedReport && (
          <div className="w-full lg:w-1/3 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl overflow-y-auto flex flex-col h-full relative pwa-banner">
            
            {/* Close Button */}
            <button
              onClick={handleClosePanel}
              className="absolute top-4 right-4 p-1.5 bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Editing Form (Admin only) */}
            {isEditing ? (
              <form onSubmit={handleEditSubmit} className="space-y-4 flex-1">
                <h3 className="font-bold text-white text-lg mb-4 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-emerald-400" />
                  Edit Laporan
                </h3>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 font-semibold block">Nama Pembeli</label>
                  <input
                    type="text"
                    value={editForm.buyer_name}
                    onChange={(e) => setEditForm({ ...editForm, buyer_name: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 font-semibold block">No Telepon</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 font-semibold block">Alamat</label>
                  <textarea
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    rows={2}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 font-semibold block">Model Motor</label>
                    <input
                      type="text"
                      value={editForm.motor}
                      onChange={(e) => setEditForm({ ...editForm, motor: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 font-semibold block">Tipe Motor</label>
                    <input
                      type="text"
                      value={editForm.type}
                      onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 font-semibold block">Warna</label>
                  <input
                    type="text"
                    value={editForm.color}
                    onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 font-semibold block">Harga (Rp)</label>
                    <input
                      type="number"
                      value={editForm.price}
                      onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 font-semibold block">DP (Rp)</label>
                    <input
                      type="number"
                      value={editForm.dp}
                      onChange={(e) => setEditForm({ ...editForm, dp: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-zinc-800">
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl py-2.5 font-bold text-sm"
                  >
                    Simpan Perubahan
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2.5 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-sm font-medium"
                  >
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              // Display mode
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                
                {/* Header Information */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-mono text-zinc-500 font-medium">Laporan Detail</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                      selectedReport.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      selectedReport.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' :
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {selectedReport.status}
                    </span>
                  </div>
                  <h2 className="text-2xl font-extrabold text-white leading-tight">SPK #{selectedReport.spk_number}</h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    Dikirim oleh {selectedReport.user_name} pada {new Date(selectedReport.created_at || selectedReport.date).toLocaleString('id-ID')}
                  </p>
                </div>

                {/* Details Section */}
                <div className="space-y-4 bg-zinc-950 p-4 rounded-xl border border-zinc-850">
                  
                  {/* Reporter details */}
                  <div className="flex items-start gap-3 border-b border-zinc-850 pb-3">
                    <User className="w-5 h-5 text-zinc-500 mt-0.5" />
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase font-semibold">Petugas Upload</div>
                      <div className="text-sm font-semibold text-zinc-200">{selectedReport.user_name}</div>
                      <div className="text-xs text-zinc-500">{selectedReport.user_email} ({selectedReport.user_role})</div>
                    </div>
                  </div>

                  {/* Customer details (Sales only) */}
                  {selectedReport.buyer_name ? (
                    <>
                      <div className="flex items-start gap-3 border-b border-zinc-850 pb-3">
                        <MapPin className="w-5 h-5 text-zinc-500 mt-0.5" />
                        <div>
                          <div className="text-[10px] text-zinc-500 uppercase font-semibold">Nama Pembeli & Alamat</div>
                          <div className="text-sm font-semibold text-zinc-200">{selectedReport.buyer_name}</div>
                          <div className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3.5 h-3.5 text-zinc-500" /> {selectedReport.phone}
                          </div>
                          <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{selectedReport.address}</p>
                        </div>
                      </div>

                      {/* Motor details */}
                      <div className="grid grid-cols-2 gap-4 pb-3 border-b border-zinc-850">
                        <div>
                          <div className="text-[10px] text-zinc-500 uppercase font-semibold">Motor & Tipe</div>
                          <div className="text-sm font-semibold text-zinc-200">{selectedReport.motor} {selectedReport.type}</div>
                          <div className="text-xs text-zinc-500">Warna: {selectedReport.color}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-zinc-500 uppercase font-semibold">Pembayaran</div>
                          <div className="text-sm font-semibold text-zinc-200 capitalize">{selectedReport.payment_method || 'Cash'}</div>
                          <div className="text-xs text-zinc-500">Harga: OTR Rp{Number(selectedReport.price || 0).toLocaleString('id-ID')}</div>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-zinc-500 text-xs uppercase font-semibold">Uang Muka / DP</span>
                        <span className="font-bold text-white">Rp{Number(selectedReport.dp || 0).toLocaleString('id-ID')}</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-zinc-500 italic py-2 text-center">
                      Laporan Service Center. Tidak ada data pelanggan/penjualan.
                    </div>
                  )}
                </div>

                {/* Cloud & Drive Files Links */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Berkas di Google Drive</h4>
                  
                  {selectedReport.drive_folder_link ? (
                    <a
                      href={selectedReport.drive_folder_link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-3 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 hover:border-emerald-500/30 text-emerald-400 rounded-xl transition-colors text-sm font-bold group"
                    >
                      <span className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" /> Buka Folder Laporan Drive
                      </span>
                      <Link className="w-4 h-4 text-emerald-500 group-hover:scale-105 transition-transform" />
                    </a>
                  ) : (
                    <div className="p-3 bg-zinc-950 text-xs text-zinc-600 rounded-xl border border-zinc-850 text-center">
                      Folder Google Drive belum dibuat (status gagal/pending)
                    </div>
                  )}

                  {/* Individual Image Files Checklist */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <FileLinkItem label="Foto SPK" url={selectedReport.spk_link} />
                    <FileLinkItem label="Bukti Bayar" url={selectedReport.pembayaran_link} />
                    <FileLinkItem label="Foto KTP" url={selectedReport.ktp_link} />
                    <FileLinkItem label="No Rangka" url={selectedReport.noka_link} />
                    <FileLinkItem label="No Mesin" url={selectedReport.nosin_link} />
                    <FileLinkItem label="Serah Unit" url={selectedReport.unit_link} />
                  </div>
                </div>

                {/* OCR Accuracy Detail */}
                {selectedReport.ocr_confidence !== undefined && (
                  <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-850 text-xs space-y-1.5">
                    <div className="flex justify-between items-center text-zinc-500">
                      <span>Metrik OCR SPK</span>
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        selectedReport.ocr_confidence >= 95 ? 'bg-emerald-500/20 text-emerald-400' :
                        selectedReport.ocr_confidence >= 80 ? 'bg-amber-500/20 text-amber-400' :
                        'bg-rose-500/20 text-rose-400'
                      }`}>
                        {selectedReport.ocr_confidence}%
                      </span>
                    </div>
                    {/* Sparkline horizontal bar */}
                    <div className="w-full h-1.5 bg-zinc-850 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          selectedReport.ocr_confidence >= 95 ? 'bg-emerald-500' :
                          selectedReport.ocr_confidence >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${selectedReport.ocr_confidence}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Admin-only Panel Actions */}
                {user?.role === 'admin' && (
                  <div className="flex gap-2 pt-4 border-t border-zinc-800">
                    <button
                      onClick={startEditing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-zinc-850 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-sm font-semibold transition-colors"
                    >
                      <Edit3 className="w-4 h-4" /> Edit
                    </button>
                    
                    {selectedReport.status === 'failed' && (
                      <button
                        onClick={() => handleRetry(selectedReport.spk_number)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 text-amber-400 rounded-xl text-sm font-semibold transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" /> Retry
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(selectedReport.spk_number)}
                      className="px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500 hover:text-white text-rose-400 rounded-xl text-sm font-semibold transition-all duration-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}

              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};

// Sub-component for individual file downloads check links
interface FileLinkItemProps {
  label: string;
  url?: string;
}

const FileLinkItem: React.FC<FileLinkItemProps> = ({ label, url }) => {
  if (!url) {
    return (
      <div className="flex items-center gap-1.5 p-2 bg-zinc-950 text-zinc-700 rounded-lg border border-zinc-850 cursor-not-allowed">
        <X className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between p-2 bg-zinc-950 hover:bg-zinc-850 text-zinc-300 hover:text-white rounded-lg border border-zinc-850 hover:border-zinc-700 transition-colors group"
    >
      <span className="flex items-center gap-1.5 truncate">
        <FileCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <Link className="w-3 h-3 text-zinc-600 group-hover:text-emerald-400 flex-shrink-0" />
    </a>
  );
};
