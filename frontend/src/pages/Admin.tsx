import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useSync } from '../context/SyncContext';
import { 
  Users, Activity, Download, RefreshCw, FileSpreadsheet, ShieldAlert, FileArchive, Search, UserCog 
} from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'sales' | 'service';
  created_at: string;
}

interface AuditLog {
  id: string;
  user_email: string;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
}

export const Admin: React.FC = () => {
  const { isOnline } = useSync();
  
  // Data lists
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Search filter for audit logs
  const [logSearch, setLogSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Role action states
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchAuditLogs();
  }, [isOnline]);

  const fetchUsers = async () => {
    if (!isOnline) return;
    try {
      const res = await api.get('/api/users');
      setEmployees(res.data);
    } catch (err) {
      console.error('[Admin] Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchAuditLogs = async () => {
    if (!isOnline) return;
    try {
      const res = await api.get('/api/audit');
      setAuditLogs(res.data);
    } catch (err) {
      console.error('[Admin] Error fetching logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleRoleChange = async (email: string, newRole: Employee['role']) => {
    setUpdatingEmail(email);
    try {
      await api.put(`/api/users/${email}/role`, { role: newRole });
      alert(`Role karyawan ${email} berhasil diubah menjadi ${newRole.toUpperCase()}.`);
      fetchUsers();
      fetchAuditLogs(); // Refresh logs to register edit
    } catch (err: any) {
      alert('Gagal mengubah role: ' + err.message);
    } finally {
      setUpdatingEmail(null);
    }
  };

  // CSV Exporter (Excel-friendly using BOM prefix)
  const handleExportData = async (format: 'csv' | 'xlsx') => {
    try {
      const res = await api.get('/api/reports');
      const reports = res.data;

      if (reports.length === 0) {
        alert('Tidak ada data laporan untuk diekspor.');
        return;
      }

      // Column Headers
      const headers = [
        'Tanggal Laporan', 'Jam', 'Nomor SPK', 'Nama Pembeli', 'No HP', 'Alamat',
        'Motor', 'Tipe', 'Warna', 'Harga', 'DP', 'Metode Bayar', 'Petugas',
        'Email Petugas', 'Role Petugas', 'Status', 'Drive Folder Link', 'OCR Confidence'
      ];

      // Rows
      const rows = reports.map((r: any) => {
        const dateObj = new Date(r.date);
        const tanggal = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        const jam = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`;
        
        return [
          tanggal,
          jam,
          r.spk_number || '',
          r.buyer_name || '',
          r.phone || '',
          (r.address || '').replace(/,/g, ' '), // sanitize commas
          r.motor || '',
          r.type || '',
          r.color || '',
          r.price || 0,
          r.dp || 0,
          r.payment_method || '',
          r.user_name || '',
          r.user_email || '',
          r.user_role || '',
          r.status || '',
          r.drive_folder_link || '',
          r.ocr_confidence !== undefined ? `${r.ocr_confidence}%` : ''
        ];
      });

      // Join CSV array
      const csvContent = [
        headers.join(','),
        ...rows.map((row: any[]) => row.join(','))
      ].join('\n');

      // Excel UTF-8 BOM prefix
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      
      const fileName = `laporan_molis_${new Date().toISOString().substring(0, 10)}.${format === 'csv' ? 'csv' : 'csv'}`;
      link.setAttribute('download', fileName);
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (err: any) {
      alert('Gagal mengekspor data: ' + err.message);
    }
  };

  // ZIP batch download downloader (sequentially trigger image browser downloads)
  const handleZipDownload = async () => {
    try {
      const res = await api.get('/api/reports');
      const reports = res.data.filter((r: any) => r.status === 'completed');

      if (reports.length === 0) {
        alert('Tidak ada file foto untuk diunduh.');
        return;
      }

      if (!window.confirm(`Sistem akan mengunduh seluruh file foto dari ${reports.length} laporan SPK yang berhasil. Lanjutkan?`)) return;

      // Sequential triggering of download tabs for documents
      // In production, backend zipping is cleaner, but this client-side sequential downloader
      // acts as a lightweight browser alternative.
      let count = 0;
      for (const r of reports) {
        const docLinks = [r.spk_link, r.ktp_link, r.pembayaran_link, r.noka_link, r.nosin_link, r.unit_link].filter(Boolean);
        
        for (const link of docLinks) {
          const w = window.open(link, '_blank');
          if (w) count++;
          // Pause slightly to prevent browser blocking popups
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
      
      alert(`Berhasil membuka ${count} file untuk diunduh.`);
    } catch (err: any) {
      alert('Gagal mendownload: ' + err.message);
    }
  };

  const filteredLogs = auditLogs.filter(log => {
    const s = logSearch.toLowerCase();
    const matchesSearch = 
      log.user_email.toLowerCase().includes(s) ||
      log.user_name.toLowerCase().includes(s) ||
      log.action.toLowerCase().includes(s) ||
      log.details.toLowerCase().includes(s);

    const matchesRole = roleFilter ? log.action === roleFilter : true;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto text-zinc-100 space-y-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <UserCog className="w-8 h-8 text-emerald-400" />
            Admin Control Panel
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Ubah hak akses karyawan, periksa audit log aktivitas, dan ekspor data laporan.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchUsers}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Panel
          </button>
        </div>
      </div>

      {/* Export & ZIP Download Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
            <h3 className="font-bold text-white text-sm">Ekspor Laporan Penjualan</h3>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">Unduh seluruh record baris Google Sheets dalam format CSV terstruktur yang dioptimalkan untuk Microsoft Excel.</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExportData('csv')}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Excel/CSV
            </button>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-blue-400">
            <FileArchive className="w-5 h-5" />
            <h3 className="font-bold text-white text-sm">Unduh Semua Foto Berkas</h3>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">Ekspor link folder foto dari Google Drive atau picu unduhan beruntun seluruh gambar berkas fisik KTP, SPK, dan Unit.</p>
          <button
            onClick={handleZipDownload}
            className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold border border-zinc-700 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Unduh Berkas Gambar
          </button>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-rose-400">
            <ShieldAlert className="w-5 h-5" />
            <h3 className="font-bold text-white text-sm">Keamanan Kredensial</h3>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">Seluruh sinkronisasi data divalidasi menggunakan token JWT. Aktivitas login dan edit tersimpan rahasia pada audit trail logs.</p>
          <span className="inline-block text-[10px] bg-rose-500/10 text-rose-300 font-bold px-2 py-1 rounded-md">
            Mode Akses: Full Administrator
          </span>
        </div>
      </div>

      {/* Split section: User Role Editor & Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* User Role Editor (Left, 1/3) */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col h-fit">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            Manajemen Role Karyawan
          </h3>

          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 divide-y divide-zinc-850">
            {loadingUsers ? (
              <div className="text-center py-8 text-xs text-zinc-500">Loading user registry...</div>
            ) : employees.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500">Tidak ada user terdaftar</div>
            ) : (
              employees.map((emp) => (
                <div key={emp.email} className="flex items-center justify-between py-3.5 first:pt-0">
                  <div className="min-w-0 pr-2">
                    <div className="text-sm font-semibold text-white truncate">{emp.name}</div>
                    <div className="text-zinc-500 text-xs truncate">{emp.email}</div>
                  </div>

                  <select
                    value={emp.role}
                    disabled={updatingEmail === emp.email}
                    onChange={(e) => handleRoleChange(emp.email, e.target.value as Employee['role'])}
                    className="bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="sales">Sales</option>
                    <option value="service">Service Center</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Audit Log Activity (Right, 2/3) */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 shadow-sm lg:col-span-2 flex flex-col h-[500px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 flex-shrink-0">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              Audit Log Aktivitas Portal
            </h3>

            {/* Filter Logs */}
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Cari log..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Semua Log</option>
                <option value="login">Login</option>
                <option value="upload_success">Upload Sukses</option>
                <option value="upload_failed">Upload Gagal</option>
                <option value="edit">Edit Data</option>
                <option value="delete">Hapus Data</option>
                <option value="retry">Retry</option>
              </select>
            </div>
          </div>

          {/* Logs List Table */}
          <div className="overflow-y-auto flex-1 border border-zinc-850 rounded-xl bg-zinc-950/40">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-zinc-950 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider z-10">
                <tr>
                  <th className="p-3">Waktu</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Aksi</th>
                  <th className="p-3">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850 text-xs">
                {loadingLogs ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-zinc-500">Loading audit trail...</td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-zinc-500">Tidak ada log aktivitas</td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-900/30">
                      <td className="p-3 text-zinc-500 font-mono whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-zinc-200">{log.user_name}</div>
                        <div className="text-[10px] text-zinc-500">{log.user_email}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold capitalize ${
                          log.action === 'upload_success' || log.action === 'login' ? 'bg-emerald-500/10 text-emerald-400' :
                          log.action === 'upload_failed' || log.action === 'delete' ? 'bg-rose-500/10 text-rose-400' :
                          'bg-zinc-800 text-zinc-400'
                        }`}>
                          {log.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-400 max-w-xs truncate" title={log.details}>
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
};
