import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { isAuthenticated, getCurrentUserInfo } from '../utils/auth';

interface AuthContextType {
  isLoggedIn: boolean;
  isLoading: boolean;
  user: any | null;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any | null>(null);

  const checkAuth = async () => {
    try {
      const authenticated = await isAuthenticated();
      setIsLoggedIn(authenticated);
      if (authenticated) {
        const userInfo = await getCurrentUserInfo();
        setUser(userInfo);
      } else {
        setUser(null);
      }
    } catch (error) {
      setIsLoggedIn(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggedIn, isLoading, user, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

