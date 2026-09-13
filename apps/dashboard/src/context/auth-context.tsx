import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiClientError } from '@vaultstack/api-client';
import type {
  AuthLoginResult,
  AuthSessionPayload,
  AuthTotpChallengePayload,
  PublicMembership,
  PublicOrganization,
  PublicUser,
} from '@vaultstack/types';
import { apiClient } from '../lib/api.js';
import { clearMultipartSessions, emitSessionCleared } from '../lib/session-events.js';

interface AuthContextValue {
  user: PublicUser | null;
  organizations: PublicOrganization[];
  memberships: PublicMembership[];
  activeOrganizationId: string | null;
  currentSessionId: string | null;
  permissions: string[];
  loading: boolean;
  error: string | null;
  login: (input: { email: string; password: string }) => Promise<AuthLoginResult>;
  verifyTotp: (input: { challengeToken: string; code: string }) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  /** Clear local session + client state without calling logout (used for 401). Returns true if a user was signed in. */
  handleUnauthorized: () => boolean;
  /**
   * Reload session from `/me`.
   * Silent by default when a session already exists (no full-app loading flash).
   */
  refresh: (options?: { silent?: boolean }) => Promise<void>;
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

function isTotpChallenge(payload: AuthLoginResult): payload is AuthTotpChallengePayload {
  return 'totpRequired' in payload && payload.totpRequired;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<AuthSessionPayload | null>(null);

  const applySession = useCallback((payload: AuthSessionPayload | null) => {
    sessionRef.current = payload;
    setSession(payload);
    if (!payload) {
      apiClient.clearSession();
      return;
    }
    if (payload.activeOrganizationId) {
      apiClient.setOrganizationId(payload.activeOrganizationId);
    } else if (payload.organization?.id) {
      apiClient.setOrganizationId(payload.organization.id);
    } else if (payload.organizations[0]?.id) {
      apiClient.setOrganizationId(payload.organizations[0].id);
    }
  }, []);

  const clearLocalAuthState = useCallback(() => {
    applySession(null);
    setError(null);
    clearMultipartSessions();
    emitSessionCleared();
  }, [applySession]);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? sessionRef.current !== null;
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const payload = await apiClient.me();
      applySession(payload);
    } catch (caught) {
      applySession(null);
      if (!(caught instanceof ApiClientError) || caught.status !== 401) {
        if (caught instanceof ApiClientError && caught.status >= 500) {
          setError('Internal server error');
        } else {
          setError(caught instanceof Error ? caught.message : 'Unable to load session');
        }
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const payload = await apiClient.login(input);
      if (isTotpChallenge(payload)) {
        return payload;
      }
      applySession(payload);
      return payload;
    },
    [applySession],
  );

  const verifyTotp = useCallback(
    async (input: { challengeToken: string; code: string }) => {
      const payload = await apiClient.verifyTotpLogin(input);
      applySession(payload);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: { email: string; password: string; name: string; organizationName: string }) => {
      const payload = await apiClient.register(input);
      applySession(payload);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // Still clear local state if the network/logout call fails.
    } finally {
      clearLocalAuthState();
    }
  }, [clearLocalAuthState]);

  const handleUnauthorized = useCallback((): boolean => {
    const hadSession = sessionRef.current !== null;
    clearLocalAuthState();
    return hadSession;
  }, [clearLocalAuthState]);

  const selectOrganization = useCallback(
    async (organizationId: string) => {
      await apiClient.selectOrganization(organizationId);
      await refresh({ silent: true });
    },
    [refresh],
  );

  const value = useMemo<AuthContextValue>(() => {
    const activeOrganizationId =
      session?.activeOrganizationId ??
      session?.organization?.id ??
      session?.organizations[0]?.id ??
      null;
    const permissions =
      activeMembership(session?.memberships ?? [], activeOrganizationId)?.permissions ?? [];

    return {
      user: session?.user ?? null,
      organizations: session?.organizations ?? [],
      memberships: session?.memberships ?? [],
      activeOrganizationId,
      currentSessionId: session?.currentSessionId ?? null,
      permissions,
      loading,
      error,
      login,
      verifyTotp,
      register,
      logout,
      handleUnauthorized,
      refresh,
      selectOrganization,
    };
  }, [
    session,
    loading,
    error,
    login,
    verifyTotp,
    register,
    logout,
    handleUnauthorized,
    refresh,
    selectOrganization,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
