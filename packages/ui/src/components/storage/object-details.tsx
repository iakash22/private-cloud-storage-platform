import type { PublicBucket, PublicStorageObject } from '@vaultstack/types';
import { formatBytes, formatDate, splitObjectKey } from '../../lib/storage-utils.js';
import { Badge } from '../badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '../card.js';

export interface ObjectDetailsProps {
  object?: PublicStorageObject;
  bucket?: PublicBucket;
  className?: string;
}

export function ObjectDetails({ object, bucket, className }: ObjectDetailsProps) {
  if (!object) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base">Object details</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Select a file to view metadata.</p>
        </CardContent>
      </Card>
    );
  }

  const { name } = splitObjectKey(object.key);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Object details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Name</p>
          <p className="font-medium text-slate-900">{name}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Key</p>
          <p className="break-all font-mono text-slate-700">{object.key}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Size</p>
            <p>{formatBytes(object.size)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Type</p>
            <p>{object.contentType}</p>
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">ETag</p>
          <p className="break-all font-mono text-xs text-slate-700">{object.etag}</p>
        </div>
        {object.checksum ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Checksum</p>
            <p className="break-all font-mono text-xs text-slate-700">{object.checksum}</p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
            <p>{formatDate(object.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Updated</p>
            <p>{formatDate(object.updatedAt)}</p>
          </div>
        </div>
        {bucket ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Bucket</p>
            <div className="mt-1 flex items-center gap-2">
              <span>{bucket.name}</span>
              <Badge>{bucket.versioning}</Badge>
            </div>
          </div>
        ) : null}
        {object.metadata && Object.keys(object.metadata).length > 0 ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Metadata</p>
            <dl className="space-y-1 rounded-md bg-slate-50 p-3">
              {Object.entries(object.metadata).map(([key, value]: [string, string]) => (
                <div key={key} className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="font-mono text-xs text-slate-500">{key}</dt>
                  <dd className="break-all text-xs text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export interface BucketDetailsProps {
  bucket?: PublicBucket;
  objectCount?: number;
  totalBytes?: number;
}

export function BucketDetails({ bucket, objectCount, totalBytes }: BucketDetailsProps) {
  if (!bucket) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bucket metadata</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Name</p>
          <p className="font-medium">{bucket.name}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Region</p>
            <p>{bucket.region ?? 'Default'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Versioning</p>
            <Badge>{bucket.versioning}</Badge>
          </div>
        </div>
        {objectCount !== undefined ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Objects</p>
              <p>{objectCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Storage used</p>
              <p>{formatBytes(totalBytes ?? 0)}</p>
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
            <p>{formatDate(bucket.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Updated</p>
            <p>{formatDate(bucket.updatedAt)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
