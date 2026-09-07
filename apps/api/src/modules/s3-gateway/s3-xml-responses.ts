import type { PublicBucket, PublicStorageObject } from '@vaultstack/types';
import { renderS3Xml } from './s3-xml.js';

export function renderListBucketsXml(buckets: PublicBucket[]): string {
  return renderS3Xml('ListAllMyBucketsResult', {
    Owner: {
      ID: 'vaultstack',
      DisplayName: 'VaultStack',
    },
    Buckets: buckets.map((bucket) => ({
      Name: bucket.name,
      CreationDate: bucket.createdAt,
    })),
  });
}

export function renderListObjectsV2Xml(input: {
  bucket: string;
  prefix?: string;
  objects: PublicStorageObject[];
  prefixes: string[];
  isTruncated: boolean;
  nextContinuationToken?: string | null;
}): string {
  return renderS3Xml('ListBucketResult', {
    Name: input.bucket,
    Prefix: input.prefix ?? '',
    KeyCount: input.objects.length + input.prefixes.length,
    MaxKeys: 1000,
    IsTruncated: input.isTruncated,
    NextContinuationToken: input.nextContinuationToken ?? null,
    Contents: input.objects.map((object) => ({
      Key: object.key,
      LastModified: object.updatedAt,
      ETag: `"${object.etag}"`,
      Size: object.size,
      StorageClass: 'STANDARD',
    })),
    CommonPrefixes: input.prefixes.map((prefix) => ({ Prefix: prefix })),
  });
}

export function renderInitiateMultipartUploadXml(uploadId: string): string {
  return renderS3Xml('InitiateMultipartUploadResult', {
    Bucket: null,
    Key: null,
    UploadId: uploadId,
  });
}

export function renderCompleteMultipartUploadXml(object: PublicStorageObject): string {
  return renderS3Xml('CompleteMultipartUploadResult', {
    Location: null,
    Bucket: null,
    Key: object.key,
    ETag: `"${object.etag}"`,
  });
}

export function renderCopyObjectXml(object: PublicStorageObject): string {
  return renderS3Xml('CopyObjectResult', {
    LastModified: object.updatedAt,
    ETag: `"${object.etag}"`,
  });
}
