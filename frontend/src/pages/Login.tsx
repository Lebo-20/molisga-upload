import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Sparkles, UserCheck, AlertTriangle, Mail, Lock, LogIn, UserPlus } from 'lucide-react';
import api from '../services/api';

export const Login: React.FC = () => {
  const { loginWithGoogleToken, loginWithEmail, loginMock, googleClientId } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form input states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'sales' | 'service'>('sales');

  // Load Google SDK Script dynamically
  useEffect(() => {
    if (!googleClientId) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      // Initialize Google GSI
      /* @ts-ignore */
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleLoginResponse,
      });

      /* @ts-ignore */
      google.accounts.id.renderButton(
        document.getElementById('google-signin-btn'),
        { theme: 'filled_dark', size: 'large', width: '320' }
      );
    };

    return () => {
      document.body.removeChild(script);
    };
  }, [googleClientId]);

  /* @ts-ignore */
  const handleGoogleLoginResponse = async (response) => {
    setIsLoading(true);
    setError(null);
    try {
      await loginWithGoogleToken(response.credential);
    } catch (err: any) {
      setError(err.message || 'Gagal login dengan Google');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email dan Password wajib diisi');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await loginWithEmail(email, password);
    } catch (err: any) {
      setError(err.message || 'Email atau Password salah');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name) {
      setError('Nama, Email, dan Password wajib diisi');
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post('/api/auth/register', {
        email,
        password,
        name,
        role
      });
      setSuccess('Registrasi Berhasil! Anda akan otomatis masuk...');
      
      // Auto login after registration success
      setTimeout(async () => {
        try {
          await loginWithEmail(email, password);
        } catch (err: any) {
          setError(err.message || 'Gagal masuk otomatis');
          setIsRegisterMode(false);
        }
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Registrasi gagal. Email mungkin sudah terdaftar.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMockLogin = async (role: 'admin' | 'sales' | 'service') => {
    setIsLoading(true);
    setError(null);
    try {
      const emailVal = `${role}@molis.com`;
      const nameMap = {
        admin: 'Joko (Admin Dealer)',
        sales: 'Budi (Sales Representative)',
        service: 'Ani (Service Technician)',
      };
      await loginMock(emailVal, nameMap[role], role);
    } catch (err: any) {
      setError(err.message || 'Gagal mock login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 relative overflow-hidden">
      {/* Background Neon Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 backdrop-blur-md relative shadow-2xl">
        {/* Header Logo */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3 relative">
            <Shield className="w-7 h-7 text-emerald-400" />
            <div className="absolute -top-1 -right-1">
              <Sparkles className="w-4 h-4 text-emerald-300 animate-pulse" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Molis Portal</h1>
          <p className="text-xs text-zinc-400 mt-1">Sistem Laporan Internal Dealer Motor Listrik</p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs flex gap-2.5 items-center">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-5 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-xs">
            {success}
          </div>
        )}

        {/* Email & Password Form (Dynamic Mode) */}
        {!isRegisterMode ? (
          // =============================================
          // LOGIN FORM
          // =============================================
          <form onSubmit={handleEmailLoginSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Email Karyawan</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-600" />
                <input
                  type="email"
                  placeholder="sales@molisgemilang.my.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-zinc-700"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Kata Sandi</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-600" />
                <input
                  type="password"
                  placeholder="Masukkan kata sandi"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-zinc-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-600 rounded-xl py-3 text-xs font-bold transition-all duration-200 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {isLoading ? 'Menghubungkan...' : 'Masuk Portal'}
            </button>
          </form>
        ) : (
          // =============================================
          // REGISTRATION FORM
          // =============================================
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Nama Lengkap *</label>
              <input
                type="text"
                placeholder="cth: Ahmad Ridwan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-zinc-700"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Email Aktif *</label>
              <input
                type="email"
                placeholder="cth: ahmad@molisgemilang.my.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-zinc-700"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Buat Kata Sandi *</label>
              <input
                type="password"
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-zinc-700"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Pilih Role Akses *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none text-white"
              >
                <option value="sales">Sales (Input Laporan Penjualan)</option>
                <option value="service">Service Center (Input Minimalis)</option>
              </select>
              <span className="text-[9px] text-zinc-500 block leading-tight mt-1">
                Catatan: Pendaftar pertama pada database otomatis ditugaskan sebagai **Admin Utama (Admin Dealer)**.
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-600 rounded-xl py-3 text-xs font-bold transition-all duration-200 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              {isLoading ? 'Mendaftarkan...' : 'Daftar Akun'}
            </button>
          </form>
        )}

        {/* Toggle Form Mode Button */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setError(null);
            }}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
          >
            {isRegisterMode ? 'Sudah punya akun? Masuk di sini' : 'Belum punya akun? Daftar sekarang'}
          </button>
        </div>

        <div className="relative w-full my-5 text-center">
          <span className="bg-zinc-900 px-3 text-[10px] text-zinc-500 uppercase tracking-wider relative z-10">ATAU LOGIN GOOGLE</span>
          <hr className="absolute top-1/2 left-0 right-0 border-zinc-800 -z-0" />
        </div>

        {/* Auth Buttons Wrapper */}
        <div className="space-y-4">
          {googleClientId ? (
            <div className="flex flex-col items-center">
              <div id="google-signin-btn" className="w-full flex justify-center"></div>
            </div>
          ) : (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-[10px] text-center">
              ℹ️ Google OAuth Client ID belum dikonfigurasi.
            </div>
          )}

          {/* Demo Users Selection */}
          <div className="border-t border-zinc-800/80 pt-4 space-y-2">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Pilih Akun Demo (Quick Access)</h3>
            
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleMockLogin('admin')}
                disabled={isLoading}
                className="bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/40 text-purple-400 py-2 rounded-xl text-[10px] font-semibold transition-all duration-200"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => handleMockLogin('sales')}
                disabled={isLoading}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 py-2 rounded-xl text-[10px] font-semibold transition-all duration-200"
              >
                Sales
              </button>
              <button
                type="button"
                onClick={() => handleMockLogin('service')}
                disabled={isLoading}
                className="bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 py-2 rounded-xl text-[10px] font-semibold transition-all duration-200"
              >
                Service
              </button>
            </div>
          </div>
        </div>

        <div className="text-center mt-6 text-[10px] text-zinc-600">
          Molis PWA &copy; 2026. Secure Portal.
        </div>
      </div>
    </div>
  );
};
