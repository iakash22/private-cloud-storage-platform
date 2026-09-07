import { randomBytes } from 'node:crypto';
import { CryptoUtil } from './crypto.util.js';
import { API_KEY_PREFIX, type GeneratedApiKey } from './types.js';

export class ApiKeyService {
  generate(): GeneratedApiKey {
    const plaintext = `${API_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
    return {
      plaintext,
      hash: this.hash(plaintext),
      prefix: plaintext.slice(0, 12),
    };
  }

  hash(plaintext: string): string {
    return CryptoUtil.hashSha256(plaintext);
  }

  isApiKeyFormat(token: string): boolean {
    return token.startsWith(API_KEY_PREFIX);
  }
}
