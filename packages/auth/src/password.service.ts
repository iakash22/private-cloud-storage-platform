import bcrypt from 'bcryptjs';

export class PasswordService {
  constructor(private readonly nodeEnv: string = 'production') {}

  getRounds(): number {
    return this.nodeEnv === 'test' ? 4 : 10;
  }

  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.getRounds());
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
