"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, refreshSession, setAccessToken, API_URL } from "./api";
import type { Project, User } from "./types";

interface AuthState {
  user: User | null;
  /** undefined = still restoring session, null = signed out */
  ready: boolean;
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (p: Project | null) => void;
  refreshProjects: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const PROJECT_KEY = "if_current_project";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);

  const setCurrentProject = useCallback((p: Project | null) => {
    setCurrentProjectState(p);
    try {
      if (p) localStorage.setItem(PROJECT_KEY, p.id);
      else localStorage.removeItem(PROJECT_KEY);
    } catch { /* ignore */ }
  }, []);

  const refreshProjects = useCallback(async () => {
    const res = await api.get<{ projects: Project[] }>("/api/projects");
    setProjects(res.projects);
    setCurrentProjectState((cur) => {
      if (cur && res.projects.some((p) => p.id === cur.id)) {
        return res.projects.find((p) => p.id === cur.id)!;
      }
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(PROJECT_KEY);
      } catch { /* ignore */ }
      const next =
        (saved && res.projects.find((p) => p.id === saved)) || res.projects[0] || null;
      if (next) {
        try {
          localStorage.setItem(PROJECT_KEY, next.id);
        } catch { /* ignore */ }
      }
      return next;
    });
  }, []);

  // Restore session on mount via the refresh cookie
  useEffect(() => {
    (async () => {
      const token = await refreshSession();
      if (token) {
        try {
          const me = await api.get<{ user: User }>("/api/auth/me");
          setUser(me.user);
          await refreshProjects();
        } catch {
          setUser(null);
        }
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Login failed");
      setAccessToken(body.accessToken);
      setUser(body.user);
      await refreshProjects();
      router.push("/overview");
    },
    [refreshProjects, router]
  );

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Registration failed");
      setAccessToken(body.accessToken);
      setUser(body.user);
      await refreshProjects();
      router.push("/overview");
    },
    [refreshProjects, router]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
    setProjects([]);
    setCurrentProjectState(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        projects,
        currentProject,
        setCurrentProject,
        refreshProjects,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
