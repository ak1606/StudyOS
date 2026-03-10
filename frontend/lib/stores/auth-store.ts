import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "@/lib/api";
import type { User } from "@/types";

export type UserRole = "admin" | "teacher" | "student" | "parent";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;

  // Actions
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;

  // Async actions
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
    role: "teacher" | "student"
  ) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem("access_token", accessToken);
        set({ user, accessToken, refreshToken });
      },

      clearAuth: () => {
        localStorage.removeItem("access_token");
        set({ user: null, accessToken: null, refreshToken: null });
      },

      isAuthenticated: () => !!get().accessToken,

      login: async (email: string, password: string) => {
        const { data } = await api.post("/api/auth/login", { email, password });
        const { access_token, refresh_token } = data;
        localStorage.setItem("access_token", access_token);
        set({ accessToken: access_token, refreshToken: refresh_token });

        // Set session cookie NOW so edge middleware sees it before router.push fires
        if (typeof window !== "undefined") {
          document.cookie = `lms-session=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        }

        // Load full user profile
        const { data: user } = await api.get("/api/auth/me");
        set({ user });
      },

      register: async (
        email: string,
        password: string,
        fullName: string,
        role: "teacher" | "student"
      ) => {
        await api.post("/api/auth/register", {
          email,
          password,
          full_name: fullName,
          role,
        });
        // Auto-login after registration
        await get().login(email, password);
      },

      logout: () => {
        localStorage.removeItem("access_token");
        set({ user: null, accessToken: null, refreshToken: null });
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      },

      loadUser: async () => {
        try {
          const { data: user } = await api.get("/api/auth/me");
          set({ user });
        } catch {
          get().clearAuth();
        }
      },
    }),
    {
      name: "lms-auth",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);
