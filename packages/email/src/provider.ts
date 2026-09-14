import { Resend } from 'resend';
import type { EmailProvider, OutboundEmail } from './types.js';

export class NoopEmailProvider implements EmailProvider {
  send(_message: OutboundEmail): Promise<{ id: string | null }> {
    return Promise.resolve({ id: null });
  }
}

export interface ResendEmailProviderOptions {
  apiKey: string;
  from: string;
}

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;

  constructor(private readonly options: ResendEmailProviderOptions) {
    this.client = new Resend(options.apiKey);
  }

  async send(message: OutboundEmail): Promise<{ id: string | null }> {
    const response = await this.client.emails.send({
      from: this.options.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: message.tags,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return { id: response.data.id };
  }
}

export function createEmailProvider(options: {
  apiKey?: string;
  from: string;
}): EmailProvider {
  if (!options.apiKey) {
    return new NoopEmailProvider();
  }

  return new ResendEmailProvider({ apiKey: options.apiKey, from: options.from });
}
