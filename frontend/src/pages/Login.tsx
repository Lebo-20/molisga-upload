import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Sparkles, UserCheck, AlertTriangle } from 'lucide-react';

export const Login: React.FC = () => {
  const { loginWithGoogleToken, loginMock, googleClientId } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  const handleMockLogin = async (role: 'admin' | 'sales' | 'service') => {
    setIsLoading(true);
    setError(null);
    try {
      const email = `${role}@molis.com`;
      const nameMap = {
        admin: 'Joko (Admin Dealer)',
        sales: 'Budi (Sales Representative)',
        service: 'Ani (Service Technician)',
      };
      await loginMock(email, nameMap[role], role);
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
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 relative">
            <Shield className="w-8 h-8 text-emerald-400" />
            <div className="absolute -top-1 -right-1">
              <Sparkles className="w-4 h-4 text-emerald-300 animate-pulse" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Molis Portal</h1>
          <p className="text-sm text-zinc-400 mt-2">Sistem Laporan Internal Dealer Motor Listrik</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Auth Buttons Wrapper */}
        <div className="space-y-6">
          {googleClientId ? (
            <div className="flex flex-col items-center">
              <div id="google-signin-btn" className="w-full flex justify-center"></div>
              <div className="relative w-full my-6 text-center">
                <span className="bg-zinc-900 px-3 text-xs text-zinc-500 uppercase tracking-wider relative z-10">Atau Gunakan Demo</span>
                <hr className="absolute top-1/2 left-0 right-0 border-zinc-800 -z-0" />
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg text-xs mb-4">
              ℹ️ Google OAuth Client ID belum dikonfigurasi. Mengaktifkan <strong>Mode Demo Quick Access</strong>.
            </div>
          )}

          {/* Demo Users Selection */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Pilih Role Demo</h3>
            
            <button
              onClick={() => handleMockLogin('sales')}
              disabled={isLoading}
              className="w-full flex items-center justify-between p-3.5 bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/30 rounded-xl transition-all duration-200 text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-bold group-hover:scale-105 transition-transform">
                  S
                </div>
                <div>
                  <div className="font-semibold text-zinc-200 text-sm">Demo Sales Representative</div>
                  <div className="text-xs text-zinc-500">Akses form penjualan, KTP, SPK OCR</div>
                </div>
              </div>
              <UserCheck className="w-5 h-5 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
            </button>

            <button
              onClick={() => handleMockLogin('service')}
              disabled={isLoading}
              className="w-full flex items-center justify-between p-3.5 bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/30 rounded-xl transition-all duration-200 text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400 font-bold group-hover:scale-105 transition-transform">
                  SC
                </div>
                <div>
                  <div className="font-semibold text-zinc-200 text-sm">Demo Service Center</div>
                  <div className="text-xs text-zinc-500">Akses upload data SPK & pembayaran service</div>
                </div>
              </div>
              <UserCheck className="w-5 h-5 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
            </button>

            <button
              onClick={() => handleMockLogin('admin')}
              disabled={isLoading}
              className="w-full flex items-center justify-between p-3.5 bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/30 rounded-xl transition-all duration-200 text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400 font-bold group-hover:scale-105 transition-transform">
                  A
                </div>
                <div>
                  <div className="font-semibold text-zinc-200 text-sm">Demo Admin Dealer</div>
                  <div className="text-xs text-zinc-500">Akses dashboard analitik, edit, eksport file</div>
                </div>
              </div>
              <UserCheck className="w-5 h-5 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
            </button>
          </div>
        </div>

        <div className="text-center mt-8 text-xs text-zinc-600">
          Molis PWA &copy; 2026. Secure Local Sandbox.
        </div>
      </div>
    </div>
  );
};
