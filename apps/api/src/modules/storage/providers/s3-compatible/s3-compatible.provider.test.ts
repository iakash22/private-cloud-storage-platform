import { CreateBucketCommand, DeleteBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { createS3CompatibleProvider } from './s3-compatible.provider.js';

function mockClient(send = vi.fn().mockResolvedValue({})) {
  return { send } as unknown as S3Client;
}

describe('S3CompatibleStorageProvider dialect options', () => {
  it('omits LocationConstraint when the dialect disables it', async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = createS3CompatibleProvider({
      client: mockClient(send),
      region: 'auto',
      sendCreateBucketLocationConstraint: false,
    });

    await provider.createBucket({ physicalBucket: 'shared-bucket' });

    const command = send.mock.calls[0]?.[0] as CreateBucketCommand;
    expect(command).toBeInstanceOf(CreateBucketCommand);
    expect(command.input.CreateBucketConfiguration).toBeUndefined();
  });

  it('sends LocationConstraint for AWS-style regions other than us-east-1', async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = createS3CompatibleProvider({
      client: mockClient(send),
      region: 'eu-west-1',
      sendCreateBucketLocationConstraint: true,
    });

    await provider.createBucket({ physicalBucket: 'vs-bucket' });

    const command = send.mock.calls[0]?.[0] as CreateBucketCommand;
    expect(command.input.CreateBucketConfiguration).toEqual({ LocationConstraint: 'eu-west-1' });
  });

  it('treats an already-existing bucket as success', async () => {
    const send = vi.fn().mockRejectedValue({ name: 'BucketAlreadyOwnedByYou' });
    const provider = createS3CompatibleProvider({
      client: mockClient(send),
      region: 'us-east-1',
    });

    await expect(provider.createBucket({ physicalBucket: 'existing' })).resolves.toBeUndefined();
  });

  it('does not delete a shared physical bucket', async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = createS3CompatibleProvider({
      client: mockClient(send),
      region: 'us-east-1',
      ownsPhysicalBuckets: false,
    });

    await provider.deleteBucket({ physicalBucket: 'customer-bucket' });

    expect(send).not.toHaveBeenCalled();
  });

  it('deletes provider-owned buckets', async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = createS3CompatibleProvider({
      client: mockClient(send),
      region: 'us-east-1',
      ownsPhysicalBuckets: true,
    });

    await provider.deleteBucket({ physicalBucket: 'vs-owned' });

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteBucketCommand);
  });
});
