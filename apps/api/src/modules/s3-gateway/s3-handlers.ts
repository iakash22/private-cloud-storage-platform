import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import type { StorageModule } from '../storage/storage.module.js';
import { requestMeta } from '../../lib/audit.js';
import type { S3Principal } from './s3-auth.strategy.js';
import type { S3RequestTarget } from './s3-operations.js';
import { filterAllowedBuckets, requireS3Permission } from './s3-authorization.js';
import {
  parseCompleteMultipartXml,
  parseCopySource,
  readLimitedBody,
} from './s3-request-body.js';
import {
  renderCompleteMultipartUploadXml,
  renderCopyObjectXml,
  renderInitiateMultipartUploadXml,
  renderListBucketsXml,
  renderListObjectsV2Xml,
} from './s3-xml-responses.js';

export class S3GatewayHandlers {
  constructor(private readonly storage: StorageModule) {}

  private requireBucket(target: S3RequestTarget): string {
    if (!target.bucket) {
      throw new Error('S3 bucket is required');
    }
    return target.bucket;
  }

  private requireKey(target: S3RequestTarget): string {
    if (!target.key) {
      throw new Error('S3 object key is required');
    }
    return target.key;
  }

  private requireUploadId(target: S3RequestTarget): string {
    if (!target.uploadId) {
      throw new Error('S3 upload id is required');
    }
    return target.uploadId;
  }

  private requirePartNumber(target: S3RequestTarget): number {
    if (target.partNumber === undefined) {
      throw new Error('S3 part number is required');
    }
    return target.partNumber;
  }

  async handle(principal: S3Principal, target: S3RequestTarget, req: Request, res: Response): Promise<void> {
    requireS3Permission(principal, target.operation, target.bucket);

    switch (target.operation) {
      case 'ListBuckets':
        return this.listBuckets(principal, res);
      case 'CreateBucket':
        return this.createBucket(principal, this.requireBucket(target), req, res);
      case 'HeadBucket':
        return this.headBucket(principal, this.requireBucket(target), res);
      case 'DeleteBucket':
        return this.deleteBucket(principal, this.requireBucket(target), req, res);
      case 'ListObjects':
      case 'ListObjectsV2':
        return this.listObjects(principal, this.requireBucket(target), req, res);
      case 'PutObject':
        return this.putObject(principal, this.requireBucket(target), this.requireKey(target), req, res);
      case 'GetObject':
        return this.getObject(principal, this.requireBucket(target), this.requireKey(target), req, res);
      case 'HeadObject':
        return this.headObject(principal, this.requireBucket(target), this.requireKey(target), res);
      case 'DeleteObject':
        return this.deleteObject(principal, this.requireBucket(target), this.requireKey(target), req, res);
      case 'CopyObject':
        return this.copyObject(principal, this.requireBucket(target), this.requireKey(target), req, res);
      case 'CreateMultipartUpload':
        return this.createMultipartUpload(principal, this.requireBucket(target), this.requireKey(target), req, res);
      case 'UploadPart':
        return this.uploadPart(principal, target, req, res);
      case 'CompleteMultipartUpload':
        return this.completeMultipartUpload(principal, target, req, res);
      case 'AbortMultipartUpload':
        return this.abortMultipartUpload(principal, target, req, res);
      default:
        res.status(501).end();
    }
  }

  private meta(req: Request) {
    return requestMeta(req);
  }

  private async listBuckets(principal: S3Principal, res: Response): Promise<void> {
    const buckets = filterAllowedBuckets(
      principal,
      await this.storage.buckets.list(principal.organizationId),
    );
    res.status(200).type('application/xml').send(renderListBucketsXml(buckets));
  }

  private async createBucket(
    principal: S3Principal,
    bucketName: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    await this.storage.buckets.create(
      principal.organizationId,
      principal.principalId,
      { name: bucketName },
      this.meta(req),
    );
    res.status(200).end();
  }

  private async headBucket(principal: S3Principal, bucketName: string, res: Response): Promise<void> {
    await this.storage.buckets.getByName(principal.organizationId, bucketName);
    res.status(200).end();
  }

  private async deleteBucket(
    principal: S3Principal,
    bucketName: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const bucket = await this.storage.buckets.getByName(principal.organizationId, bucketName);
    await this.storage.buckets.remove(
      principal.organizationId,
      bucket.id,
      principal.principalId,
      this.meta(req),
    );
    res.status(204).end();
  }

  private async listObjects(
    principal: S3Principal,
    bucketName: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const bucket = await this.storage.buckets.getByName(principal.organizationId, bucketName);
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : undefined;
    const page = await this.storage.objects.list(principal.organizationId, bucket.id, {
      prefix,
      delimiter: '/',
      limit: 1000,
      cursor: typeof req.query['continuation-token'] === 'string' ? req.query['continuation-token'] : undefined,
    });

    res
      .status(200)
      .type('application/xml')
      .send(
        renderListObjectsV2Xml({
          bucket: bucket.name,
          prefix,
          objects: page.objects,
          prefixes: page.prefixes,
          isTruncated: page.isTruncated,
          nextContinuationToken: page.nextCursor,
        }),
      );
  }

  private async putObject(
    principal: S3Principal,
    bucketName: string,
    key: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const bucket = await this.storage.buckets.getByName(principal.organizationId, bucketName);
    const object = await this.storage.objects.put({
      organizationId: principal.organizationId,
      bucketId: bucket.id,
      key,
      body: req,
      contentType: req.header('content-type') ?? undefined,
      userId: principal.principalId,
    });

    res.status(200).header('ETag', `"${object.etag}"`).end();
  }

  private async getObject(
    principal: S3Principal,
    bucketName: string,
    key: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const bucket = await this.storage.buckets.getByName(principal.organizationId, bucketName);
    const object = await this.storage.objects.findByKey(principal.organizationId, bucket.id, key);
    const download = await this.storage.objects.openDownload(principal.organizationId, object.id);

    res.status(200);
    res.setHeader('Content-Type', download.object.contentType);
    res.setHeader('Content-Length', String(download.object.size));
    res.setHeader('ETag', `"${download.object.etag}"`);

    await pipeline(download.stream.body, res);
  }

  private async headObject(
    principal: S3Principal,
    bucketName: string,
    key: string,
    res: Response,
  ): Promise<void> {
    const bucket = await this.storage.buckets.getByName(principal.organizationId, bucketName);
    const object = await this.storage.objects.findByKey(principal.organizationId, bucket.id, key);
    res.status(200);
    res.setHeader('Content-Type', object.contentType);
    res.setHeader('Content-Length', String(object.size));
    res.setHeader('ETag', `"${object.etag}"`);
    res.end();
  }

  private async deleteObject(
    principal: S3Principal,
    bucketName: string,
    key: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const bucket = await this.storage.buckets.getByName(principal.organizationId, bucketName);
    const object = await this.storage.objects.findByKey(principal.organizationId, bucket.id, key);
    await this.storage.objects.remove(
      principal.organizationId,
      object.id,
      principal.principalId,
      this.meta(req),
    );
    res.status(204).end();
  }

  private async copyObject(
    principal: S3Principal,
    destinationBucketName: string,
    destinationKey: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const source = parseCopySource(req.header('x-amz-copy-source'));
    const sourceBucket = await this.storage.buckets.getByName(principal.organizationId, source.bucket);
    const sourceObject = await this.storage.objects.findByKey(
      principal.organizationId,
      sourceBucket.id,
      source.key,
    );
    const destinationBucket = await this.storage.buckets.getByName(
      principal.organizationId,
      destinationBucketName,
    );

    const copied = await this.storage.objects.copy({
      organizationId: principal.organizationId,
      objectId: sourceObject.id,
      destinationBucketId: destinationBucket.id,
      destinationKey,
      userId: principal.principalId,
      meta: this.meta(req),
    });

    res.status(200).type('application/xml').send(renderCopyObjectXml(copied));
  }

  private async createMultipartUpload(
    principal: S3Principal,
    bucketName: string,
    key: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const bucket = await this.storage.buckets.getByName(principal.organizationId, bucketName);
    const initiated = await this.storage.uploads.initiateMultipart({
      organizationId: principal.organizationId,
      bucketId: bucket.id,
      key,
      contentType: req.header('content-type') ?? undefined,
      userId: principal.principalId,
      meta: this.meta(req),
    });

    res.status(200).type('application/xml').send(renderInitiateMultipartUploadXml(initiated.providerUploadId));
  }

  private async uploadPart(
    principal: S3Principal,
    target: S3RequestTarget,
    req: Request,
    res: Response,
  ): Promise<void> {
    const bucket = await this.storage.buckets.getByName(principal.organizationId, this.requireBucket(target));
    const uploadId = await this.storage.uploads.resolveMultipartUploadId({
      organizationId: principal.organizationId,
      bucketId: bucket.id,
      providerUploadId: this.requireUploadId(target),
    });

    const part = await this.storage.uploads.uploadPart({
      organizationId: principal.organizationId,
      uploadId,
      partNumber: this.requirePartNumber(target),
      body: req,
    });

    res.status(200).type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><Part><PartNumber>${part.partNumber}</PartNumber><ETag>"${part.etag}"</ETag></Part>`,
    );
  }

  private async completeMultipartUpload(
    principal: S3Principal,
    target: S3RequestTarget,
    req: Request,
    res: Response,
  ): Promise<void> {
    const bucket = await this.storage.buckets.getByName(principal.organizationId, this.requireBucket(target));
    const uploadId = await this.storage.uploads.resolveMultipartUploadId({
      organizationId: principal.organizationId,
      bucketId: bucket.id,
      providerUploadId: this.requireUploadId(target),
    });
    const body = await readLimitedBody(req);
    const parts = parseCompleteMultipartXml(body);

    const object = await this.storage.uploads.completeMultipart({
      organizationId: principal.organizationId,
      uploadId,
      userId: principal.principalId,
      parts,
      meta: this.meta(req),
    });

    res.status(200).type('application/xml').send(renderCompleteMultipartUploadXml(object));
  }

  private async abortMultipartUpload(
    principal: S3Principal,
    target: S3RequestTarget,
    req: Request,
    res: Response,
  ): Promise<void> {
    const bucket = await this.storage.buckets.getByName(principal.organizationId, this.requireBucket(target));
    const uploadId = await this.storage.uploads.resolveMultipartUploadId({
      organizationId: principal.organizationId,
      bucketId: bucket.id,
      providerUploadId: this.requireUploadId(target),
    });

    await this.storage.uploads.abortMultipart({
      organizationId: principal.organizationId,
      uploadId,
      userId: principal.principalId,
      meta: this.meta(req),
    });

    res.status(204).end();
  }
}
