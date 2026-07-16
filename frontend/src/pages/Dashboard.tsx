import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import api from '../services/api';
import { 
  Award, CheckCircle, AlertCircle, RefreshCw, BarChart2, Zap 
} from 'lucide-react';

interface Stats {
  todayCount: number;
  successCount: number;
  failedCount: number;
  userTotalCount: number;
  globalTotalCount: number;
  weeklyUploads: { day: string; count: number }[];
  rankings: { name: string; email: string; count: number }[];
  ocrAccuracy: number;
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { pendingCount, isOnline } = useSync();
  const [stats, setStats] = useState<Stats>({
    todayCount: 0,
    successCount: 0,
    failedCount: 0,
    userTotalCount: 0,
    globalTotalCount: 0,
    weeklyUploads: [
      { day: 'Sen', count: 0 },
      { day: 'Sel', count: 0 },
      { day: 'Rab', count: 0 },
      { day: 'Kam', count: 0 },
      { day: 'Jum', count: 0 },
      { day: 'Sab', count: 0 },
      { day: 'Min', count: 0 }
    ],
    rankings: [],
    ocrAccuracy: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, [isOnline]);

  const fetchDashboardStats = async () => {
    if (!isOnline) {
      setLoading(false);
      return; // Fetch skipped offline
    }

    try {
      const res = await api.get('/api/reports');
      const allReports = res.data;

      // Group and calculate statistics
      const today = new Date().toDateString();
      const todayReports = allReports.filter(
        (r: any) => new Date(r.created_at || r.date).toDateString() === today
      );

      const success = allReports.filter((r: any) => r.status === 'completed');
      const failed = allReports.filter((r: any) => r.status === 'failed');

      const userReports = allReports.filter(
        (r: any) => r.user_email?.toLowerCase() === user?.email?.toLowerCase()
      );

      // OCR Stats
      const completedReports = allReports.filter((r: any) => r.status === 'completed');
      const ocrSuccessCount = completedReports.filter((r: any) => r.ocr_status === 'success').length;
      const ocrAcc = completedReports.length > 0 
        ? Math.round((ocrSuccessCount / completedReports.length) * 100) 
        : 100;

      // Rankings
      const userUploadCounts: Record<string, { name: string; count: number }> = {};
      allReports.forEach((r: any) => {
        const email = r.user_email;
        if (email) {
          if (!userUploadCounts[email]) {
            userUploadCounts[email] = { name: r.user_name || email, count: 0 };
          }
          userUploadCounts[email].count++;
        }
      });
      const rankings = Object.keys(userUploadCounts)
        .map((email) => ({
          email,
          name: userUploadCounts[email].name,
          count: userUploadCounts[email].count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Weekly uploads chart mapping (last 7 days helper)
      const dayLabels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      // Rearrange day labels to end with today
      const orderedLabels: string[] = [];
      const orderedCounts: number[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayIdx = d.getDay();
        orderedLabels.push(dayLabels[dayIdx]);
        
        // Count reports uploaded on this date
        const dateString = d.toDateString();
        const count = allReports.filter(
          (r: any) => new Date(r.created_at || r.date).toDateString() === dateString
        ).length;
        orderedCounts.push(count);
      }

      const weeklyUploads = orderedLabels.map((day, idx) => ({
        day,
        count: orderedCounts[idx],
      }));

      setStats({
        todayCount: todayReports.length,
        successCount: success.length,
        failedCount: failed.length,
        userTotalCount: userReports.length,
        globalTotalCount: allReports.length,
        weeklyUploads,
        rankings,
        ocrAccuracy: ocrAcc,
      });
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 w-48 shimmer-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 shimmer-pulse rounded-xl"></div>
          ))}
        </div>
        <div className="h-96 shimmer-pulse rounded-xl"></div>
      </div>
    );
  }

  // Find max count for chart scaling
  const maxWeeklyCount = Math.max(...stats.weeklyUploads.map((w) => w.count), 5);
  const chartHeight = 200;
  const chartWidth = 500;
  const points = stats.weeklyUploads.map((w, idx) => {
    const x = (idx * (chartWidth - 40)) / 6 + 20;
    const y = chartHeight - (w.count / maxWeeklyCount) * (chartHeight - 40) - 20;
    return { x, y, count: w.count, day: w.day };
  });

  const svgPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = points.length > 0 
    ? `${svgPath} L ${points[points.length - 1].x} ${chartHeight - 20} L ${points[0].x} ${chartHeight - 20} Z` 
    : '';

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-[1600px] mx-auto text-zinc-100">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Dashboard Analitik</h1>
          <p className="text-sm text-zinc-400 mt-1">Halo, {user?.name}. Selamat datang kembali di sistem laporan.</p>
        </div>
        <button
          onClick={fetchDashboardStats}
          className="self-start md:self-auto flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-sm transition-colors duration-200"
        >
          <RefreshCw className="w-4 h-4" />
          Perbarui Data
        </button>
      </div>

      {/* Stats Widgets Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Laporan Hari Ini</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{stats.todayCount}</span>
            <span className="text-xs text-zinc-500">berkas</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-emerald-500/10 group-hover:scale-110 transition-transform">
            <CheckCircle className="w-12 h-12" />
          </div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Berhasil Terunggah</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-400">{stats.successCount}</span>
            <span className="text-xs text-emerald-500/70">100% cloud</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-rose-500/10 group-hover:scale-110 transition-transform">
            <AlertCircle className="w-12 h-12" />
          </div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Gagal Upload</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-rose-400">{stats.failedCount}</span>
            <span className="text-xs text-rose-500/70">perlu diulang</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-amber-500/10 group-hover:scale-110 transition-transform">
            <RefreshCw className="w-12 h-12" />
          </div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Antrean Offline</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-400">{pendingCount}</span>
            <span className="text-xs text-amber-500/70">pending sync</span>
          </div>
        </div>
      </div>

      {/* Main Chart Split Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Chart Card */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-white">Grafik Upload Mingguan</h3>
            </div>
            <span className="text-xs text-zinc-500">7 hari terakhir</span>
          </div>

          {/* SVG Area Chart */}
          <div className="w-full overflow-hidden">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full overflow-visible">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 1, 2, 3].map((g) => {
                const lineY = 20 + g * ((chartHeight - 40) / 3);
                return (
                  <line
                    key={g}
                    x1="20"
                    y1={lineY}
                    x2={chartWidth - 20}
                    y2={lineY}
                    stroke="#27272a"
                    strokeWidth="0.8"
                    strokeDasharray="4,4"
                  />
                );
              })}

              {/* Fill Area */}
              {areaPath && <path d={areaPath} fill="url(#chartGradient)" />}

              {/* Chart Line Path */}
              {svgPath && (
                <path
                  d={svgPath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_2px_8px_rgba(16,185,129,0.3)]"
                />
              )}

              {/* Interactive Nodes */}
              {points.map((p, idx) => (
                <g key={idx} className="group/node cursor-pointer">
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="4"
                    fill="#10b981"
                    stroke="#09090b"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="10"
                    fill="#10b981"
                    fillOpacity="0"
                    className="hover:fill-opacity-10 transition-all duration-200"
                  />
                  {/* Tooltip on Node */}
                  <text
                    x={p.x}
                    y={p.y - 12}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="bold"
                    className="opacity-0 group-hover/node:opacity-100 bg-zinc-950 px-1 py-0.5 rounded transition-opacity pointer-events-none"
                  >
                    {p.count}
                  </text>
                </g>
              ))}

              {/* X Axis Labels */}
              {points.map((p, idx) => (
                <text
                  key={idx}
                  x={p.x}
                  y={chartHeight - 2}
                  textAnchor="middle"
                  fill="#71717a"
                  fontSize="11"
                  className="font-medium"
                >
                  {p.day}
                </text>
              ))}
            </svg>
          </div>
        </div>

        {/* Side Performance / Leaderboard Cards */}
        <div className="space-y-6">
          {/* Dashboard Summary stats */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Laporan Saya
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <span className="text-zinc-400 text-sm">Total Upload Saya</span>
                <span className="font-bold text-white text-lg">{stats.userTotalCount}</span>
              </div>
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <span className="text-zinc-400 text-sm">Total Dealer (Semua)</span>
                <span className="font-bold text-white text-lg">{stats.globalTotalCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Keakuratan OCR SPK</span>
                <span className={`font-bold text-lg ${
                  stats.ocrAccuracy >= 90 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {stats.ocrAccuracy}%
                </span>
              </div>
            </div>
          </div>

          {/* Leaderboard Card */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-400" />
              Rangking Karyawan Teraktif
            </h3>
            
            <div className="space-y-3">
              {stats.rankings.length === 0 ? (
                <div className="text-center py-4 text-xs text-zinc-500">Belum ada aktivitas laporan</div>
              ) : (
                stats.rankings.map((rank, idx) => (
                  <div key={rank.email} className="flex items-center justify-between bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-amber-400 text-zinc-950' : 
                        idx === 1 ? 'bg-zinc-300 text-zinc-950' :
                        idx === 2 ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{rank.name}</div>
                        <div className="text-zinc-500 text-xs truncate">{rank.email}</div>
                      </div>
                    </div>
                    <span className="text-xs bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                      {rank.count} Lap
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
