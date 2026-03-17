import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

const AUTH_KEY = 'ciassist_auth';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem(AUTH_KEY);
    } catch {
      return false;
    }
  });

  const login = useCallback((username: string, password: string) => {
    if (!username?.trim() || !password) return false;
    localStorage.setItem(AUTH_KEY, JSON.stringify({ user: username.trim() }));
    setIsAuthenticated(true);
    return true;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
