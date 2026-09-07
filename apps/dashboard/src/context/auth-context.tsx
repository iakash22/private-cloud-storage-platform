import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiClientError } from '@vaultstack/api-client';
import type { AuthSessionPayload, PublicMembership, PublicOrganization, PublicUser } from '@vaultstack/types';
import { apiClient } from '../lib/api.js';

interface AuthContextValue {
  user: PublicUser | null;
  organizations: PublicOrganization[];
  memberships: PublicMembership[];
  activeOrganizationId: string | null;
  permissions: string[];
  loading: boolean;
  error: string | null;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  selectOrganization: (organizationId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function activeMembership(
  memberships: PublicMembership[],
  organizationId: string | null,
): PublicMembership | undefined {
  if (!organizationId) {
    return memberships[0];
  }

  return memberships.find((membership) => membership.organizationId === organizationId);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback((payload: AuthSessionPayload | null) => {
    setSession(payload);
    if (payload?.activeOrganizationId) {
      apiClient.setOrganizationId(payload.activeOrganizationId);
    } else if (payload?.organization?.id) {
      apiClient.setOrganizationId(payload.organization.id);
    } else if (payload?.organizations[0]?.id) {
      apiClient.setOrganizationId(payload.organizations[0].id);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await apiClient.me();
      applySession(payload);
    } catch (caught) {
      applySession(null);
      if (!(caught instanceof ApiClientError) || caught.status !== 401) {
        setError(caught instanceof Error ? caught.message : 'Unable to load session');
      }
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const payload = await apiClient.login(input);
      applySession(payload);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      name: string;
      organizationName: string;
    }) => {
      const payload = await apiClient.register(input);
      applySession(payload);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await apiClient.logout();
    applySession(null);
  }, [applySession]);

  const selectOrganization = useCallback(
    async (organizationId: string) => {
      await apiClient.selectOrganization(organizationId);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<AuthContextValue>(() => {
    const activeOrganizationId =
      session?.activeOrganizationId ?? session?.organization?.id ?? session?.organizations[0]?.id ?? null;
    const permissions =
      activeMembership(session?.memberships ?? [], activeOrganizationId)?.permissions ?? [];

    return {
      user: session?.user ?? null,
      organizations: session?.organizations ?? [],
      memberships: session?.memberships ?? [],
      activeOrganizationId,
      permissions,
      loading,
      error,
      login,
      register,
      logout,
      refresh,
      selectOrganization,
    };
  }, [session, loading, error, login, register, logout, refresh, selectOrganization]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
