import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import type { Announcement, User } from './types';

export interface Flash { type: 'success' | 'danger' | 'info' | 'warning'; text: string }

interface Ctx {
  ready: boolean;
  user: User | null;
  setUser: (u: User | null) => void;
  announcements: Announcement[];
  serviceOptions: { id: number; title: string }[];
  flash: Flash | null;
  notify: (text: string, type?: Flash['type']) => void;
  clearFlash: () => void;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [serviceOptions, setServiceOptions] = useState<{ id: number; title: string }[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    api('bootstrap/')
      .then((d) => {
        setUser(d.user);
        setAnnouncements(d.announcements);
        setServiceOptions(d.services);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        api('bootstrap/')
          .then((d) => {
            setUser(d.user);
            setAnnouncements(d.announcements);
            setServiceOptions(d.services);
          })
          .catch(() => setUser(null));
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const notify = useCallback((text: string, type: Flash['type'] = 'success') => setFlash({ text, type }), []);
  const clearFlash = useCallback(() => setFlash(null), []);

  return (
    <AppCtx.Provider value={{ ready, user, setUser, announcements, serviceOptions, flash, notify, clearFlash }}>
      {children}
    </AppCtx.Provider>
  );
}
