export class BackupCancelledError extends Error {
  constructor(message = 'Backup cancelled') {
    super(message);
    this.name = 'BackupCancelledError';
  }
}
