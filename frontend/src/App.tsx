import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { FormReport } from './pages/FormReport';
import { History } from './pages/History';
import { Drafts } from './pages/Drafts';
import { Admin } from './pages/Admin';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-semibold uppercase tracking-wider">Memuat Portal Molis...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar Navbar */}
      <Navbar />

      {/* Main View Shell Container */}
      <main className="flex-1 h-screen overflow-y-auto overflow-x-hidden bg-zinc-950 relative">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload-spk" element={<FormReport />} />
          <Route path="/upload-service" element={<FormReport />} />
          <Route path="/history" element={<History />} />
          <Route path="/drafts" element={<Drafts />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <SyncProvider>
          <AppContent />
        </SyncProvider>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
