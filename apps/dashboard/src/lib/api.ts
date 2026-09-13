import { createApiClient, type VaultStackApiClient } from '@vaultstack/api-client';

export const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const apiClient: VaultStackApiClient = createApiClient(apiUrl);
