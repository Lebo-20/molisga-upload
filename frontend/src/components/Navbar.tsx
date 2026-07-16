import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { 
  LayoutDashboard, FileText, History, RefreshCw, 
  Settings, LogOut, Menu, X, Download, Shield, CloudOff, Wifi 
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { isOnline, pendingCount } = useSync();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // Catch PWA Install Prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  const handleLogoutClick = () => {
    logout();
    navigate('/');
  };

  const getMenuItems = () => {
    if (!user) return [];
    
    const items = [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    ];

    if (user.role === 'sales' || user.role === 'admin') {
      items.push({ path: '/upload-spk', label: 'Upload SPK Sales', icon: FileText });
    }
    
    if (user.role === 'service' || user.role === 'admin') {
      items.push({ path: '/upload-service', label: 'Upload SPK Service', icon: FileText });
    }

    items.push(
      { path: '/history', label: 'Riwayat Laporan', icon: History },
      { path: '/drafts', label: `Pending & Drafts`, icon: RefreshCw }
    );

    if (user.role === 'admin') {
      items.push({ path: '/admin', label: 'Admin Control Panel', icon: Settings });
    }

    return items;
  };

  const menuItems = getMenuItems();

  return (
    <>
      {/* Mobile Top Navbar Header */}
      <header className="md:hidden flex items-center justify-between px-5 py-4 bg-zinc-900 border-b border-zinc-800 text-white sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-emerald-400" />
          <span className="font-bold tracking-tight">MOLIS Portal</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Network status Indicator */}
          {isOnline ? (
            <Wifi className="w-5 h-5 text-emerald-400" />
          ) : (
            <CloudOff className="w-5 h-5 text-rose-400" />
          )}

          <button onClick={() => setIsOpen(!isOpen)} className="text-zinc-400 hover:text-white">
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col justify-between
        transform transition-transform duration-300 md:translate-x-0 text-zinc-300
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:sticky md:h-screen
      `}>
        {/* Top Branding Section */}
        <div className="p-6">
          <div className="hidden md:flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <Shield className="w-7 h-7 text-emerald-400" />
              <span className="font-extrabold text-white tracking-tight text-lg">MOLIS PORTAL</span>
            </div>
            
            {/* Status indicator */}
            <div className="flex items-center gap-2 bg-zinc-800/80 px-2 py-1 rounded-full text-xs">
              {isOnline ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="text-emerald-400 font-medium">Online</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  <span className="text-rose-400 font-medium">Offline</span>
                </>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={({ isActive }) => `
                    flex items-center justify-between px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 group
                    ${isActive 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'hover:bg-zinc-800 hover:text-white border border-transparent'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.path === '/drafts' && pendingCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 font-bold">
                      {pendingCount}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Bottom User Profile card & actions */}
        <div className="p-4 border-t border-zinc-800 space-y-4">
          {/* PWA Install callout */}
          {isInstallable && (
            <button
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-2 p-3 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl font-bold text-sm transition-all duration-200 shadow-md animate-bounce"
            >
              <Download className="w-4 h-4" />
              Pasang Aplikasi
            </button>
          )}

          {/* User Profile */}
          {user && (
            <div className="flex items-center gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800/80">
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-10 h-10 rounded-full border border-zinc-700 bg-zinc-800 flex-shrink-0 object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-white text-sm truncate">{user.name}</div>
                <div className="text-zinc-500 text-xs truncate capitalize">{user.role === 'service' ? 'Service Center' : user.role}</div>
              </div>
            </div>
          )}

          {/* Logout Button */}
          <button
            onClick={handleLogoutClick}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-400 hover:text-rose-400 hover:bg-rose-500/5 border border-transparent hover:border-rose-500/10 rounded-xl transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Overlay Backdrop */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
        />
      )}
    </>
  );
};
