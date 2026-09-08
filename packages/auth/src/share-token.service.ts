import { randomBytes } from 'node:crypto';
import { CryptoUtil } from './crypto.util.js';
import { SHARE_TOKEN_PREFIX } from './types.js';

export interface GeneratedShareToken {
  plaintext: string;
  hash: string;
  prefix: string;
}

/** High-entropy share tokens. Sequential database ids are never used as public tokens. */
export class ShareTokenService {
  generate(): GeneratedShareToken {
    const plaintext = `${SHARE_TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
    return {
      plaintext,
      hash: this.hash(plaintext),
      prefix: plaintext.slice(0, 12),
    };
  }

  hash(plaintext: string): string {
    return CryptoUtil.hashSha256(plaintext);
  }
}
