import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

export interface User {
  email: string;
  name: string;
  role: 'admin' | 'sales' | 'service';
  avatar_url: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogleToken: (idToken: string) => Promise<void>;
  loginMock: (email: string, name: string, role: 'admin' | 'sales' | 'service') => Promise<void>;
  logout: () => void;
  googleClientId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  // Initialize Auth state
  useEffect(() => {
    const storedToken = localStorage.getItem('molis_jwt_token');
    const storedUser = localStorage.getItem('molis_user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    
    // Fetch system environment to check if Google Client ID is configured
    api.get('/api/health')
      .then(() => {
        // If server is up, attempt to retrieve configuration status
        // In this setup, we can fetch Client ID if backend supplies it
        // Or we let the user pass it via dotenv
        // We will default to standard check or prompt in client
      })
      .catch(() => {});

    // For local fallback, check backend configuration or set blank
    setGoogleClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID || null);
    setIsLoading(false);

    // Event listener for global logouts (e.g. on 401 response)
    const handleLogoutEvent = () => {
      logout();
    };
    window.addEventListener('auth-logout', handleLogoutEvent);

    return () => {
      window.removeEventListener('auth-logout', handleLogoutEvent);
    };
  }, []);

  // Handle successful OAuth verify with backend
  const loginWithGoogleToken = async (idToken: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/api/auth/google', { idToken });
      const { token: jwtToken, user: userProfile } = res.data;

      localStorage.setItem('molis_jwt_token', jwtToken);
      localStorage.setItem('molis_user', JSON.stringify(userProfile));

      setToken(jwtToken);
      setUser(userProfile);
    } catch (err: any) {
      logout();
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Mock login for demo testing role dashboards and offline capability
  const loginMock = async (email: string, name: string, role: 'admin' | 'sales' | 'service') => {
    setIsLoading(true);
    try {
      // Simulate JWT payload locally
      const mockPayload = {
        email: email.toLowerCase(),
        name,
        role,
        avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
      };

      // In mock mode, we create a local JWT signature (dummy token)
      const tokenParts = [
        btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
        btoa(JSON.stringify(mockPayload)),
        'mock-signature'
      ].join('.');

      // If backend is running, we can attempt mock registration to database
      try {
        const res = await api.post('/api/auth/google', { idToken: tokenParts });
        const { token: jwtToken, user: userProfile } = res.data;
        localStorage.setItem('molis_jwt_token', jwtToken);
        localStorage.setItem('molis_user', JSON.stringify(userProfile));
        setToken(jwtToken);
        setUser(userProfile);
      } catch {
        // Local-only mock database fallback if backend is unreachable
        localStorage.setItem('molis_jwt_token', tokenParts);
        localStorage.setItem('molis_user', JSON.stringify(mockPayload));
        setToken(tokenParts);
        setUser(mockPayload);
      }
    } catch (err: any) {
      logout();
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('molis_jwt_token');
    localStorage.removeItem('molis_user');
    setToken(null);
    setUser(null);
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        loginWithGoogleToken,
        loginMock,
        logout,
        googleClientId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
