import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post, tokenStore, onUnauthorized } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setReady(true); return null; }
    try {
      const res = await get('/auth/me', null, { skipAuthRedirect: true });
      setUser(res.data);
      return res.data;
    } catch {
      tokenStore.set(null); setUser(null);
      return null;
    } finally { setReady(true); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onUnauthorized(() => { tokenStore.set(null); setUser(null); }), []);

  const loginWith = useCallback(async (url, body) => {
    const res = await post(url, body);
    tokenStore.set(res.data.token);
    setUser(res.data.user);
    refresh();
    return res.data.user;
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await post('/auth/logout'); } catch { /* ignore */ }
    tokenStore.set(null); setUser(null);
  }, []);

  const can = useCallback((...perms) => !!user && (user.is_super || perms.some((p) => user.permissions?.includes(p))), [user]);

  const value = useMemo(() => ({
    user, ready, refresh, logout, can, setUser,
    login: (b) => loginWith('/auth/login', b),
    adminLogin: (b) => loginWith('/auth/admin/login', b),
    register: (b) => loginWith('/auth/register', b),
    googleLogin: (credential) => loginWith('/auth/google', { credential }),
    setToken: (t) => tokenStore.set(t),
  }), [user, ready, refresh, logout, can, loginWith]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
