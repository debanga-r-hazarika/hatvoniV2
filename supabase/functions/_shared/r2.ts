import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getOptionalEnv(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value && value.length > 0 ? value : null;
}

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string | null;
  endpoint: string;
};

export type R2UploadResult = {
  key: string;
  bucket: string;
  endpoint: string;
  publicUrl: string | null;
  etag: string | null;
};

export function getR2Config(): R2Config {
  const accountId = getRequiredEnv('R2_ACCOUNT_ID');
  const bucket = getRequiredEnv('R2_BUCKET');
  const accessKeyId = getRequiredEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = getRequiredEnv('R2_SECRET_ACCESS_KEY');
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const publicBaseUrl = getOptionalEnv('R2_PUBLIC_BASE_URL');

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    endpoint,
  };
}

export function isR2Configured(): boolean {
  return Boolean(
    Deno.env.get('R2_ACCOUNT_ID') &&
      Deno.env.get('R2_BUCKET') &&
      Deno.env.get('R2_ACCESS_KEY_ID') &&
      Deno.env.get('R2_SECRET_ACCESS_KEY'),
  );
}

export function buildR2ObjectKey(prefix: string, extension = 'json'): string {
  const safePrefix = prefix.replace(/^\/+|\/+$/g, '');
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const id = crypto.randomUUID();
  return `${safePrefix}/${stamp}-${id}.${extension.replace(/^\./, '')}`;
}

export function getR2PublicUrl(key: string): string | null {
  const { publicBaseUrl } = getR2Config();
  if (!publicBaseUrl) return null;
  return `${publicBaseUrl.replace(/\/$/, '')}/${key.replace(/^\/+/, '')}`;
}

function decodeXmlEntities(input: string): string {
  return input
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

async function uploadToR2(
  key: string,
  body: BodyInit,
  contentType: string,
  metadata: Record<string, string> = {},
): Promise<R2UploadResult> {
  const config = getR2Config();
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const objectUrl = `${config.endpoint}/${config.bucket}/${key}`;
  const headers = new Headers({
    'Content-Type': contentType,
  });

  for (const [k, v] of Object.entries(metadata)) {
    headers.set(`x-amz-meta-${k.toLowerCase()}`, v);
  }

  const response = await client.fetch(objectUrl, {
    method: 'PUT',
    headers,
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`R2 upload failed (${response.status}): ${errorBody || response.statusText}`);
  }

  return {
    key,
    bucket: config.bucket,
    endpoint: config.endpoint,
    publicUrl: getR2PublicUrl(key),
    etag: response.headers.get('etag'),
  };
}

export async function uploadBytesToR2(
  key: string,
  bytes: ArrayBuffer | Uint8Array,
  contentType = 'application/octet-stream',
  metadata: Record<string, string> = {},
): Promise<R2UploadResult> {
  return uploadToR2(key, bytes, contentType, metadata);
}

export async function listR2Objects(prefix = '', maxKeys = 50) {
  const config = getR2Config();
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const params = new URLSearchParams({
    'list-type': '2',
    'max-keys': String(Math.max(1, Math.min(1000, Math.floor(maxKeys)))),
  });
  if (prefix.trim()) params.set('prefix', prefix.trim());

  const url = `${config.endpoint}/${config.bucket}?${params.toString()}`;
  const response = await client.fetch(url, { method: 'GET' });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`R2 list failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const xml = await response.text();
  const items = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, block]) => {
    const key = decodeXmlEntities(block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] || '');
    const lastModified = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] || null;
    const etagRaw = block.match(/<ETag>([\s\S]*?)<\/ETag>/)?.[1] || '';
    const etag = etagRaw.replaceAll('"', '') || null;
    const size = Number(block.match(/<Size>([\s\S]*?)<\/Size>/)?.[1] || 0);
    return {
      key,
      size,
      etag,
      last_modified: lastModified,
      public_url: getR2PublicUrl(key),
    };
  });

  const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const nextContinuationToken = decodeXmlEntities(
    xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] || '',
  ) || null;

  return {
    bucket: config.bucket,
    prefix: prefix.trim(),
    objects: items,
    is_truncated: isTruncated,
    next_continuation_token: nextContinuationToken,
  };
}

export async function deleteR2Object(key: string) {
  const trimmedKey = key.trim();
  if (!trimmedKey) throw new Error('R2 key is required for delete');

  const config = getR2Config();
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const url = `${config.endpoint}/${config.bucket}/${trimmedKey}`;
  const response = await client.fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`R2 delete failed (${response.status}): ${errorBody || response.statusText}`);
  }

  return {
    bucket: config.bucket,
    key: trimmedKey,
    deleted: true,
  };
}

export async function uploadJsonToR2(
  key: string,
  payload: unknown,
  metadata: Record<string, string> = {},
) {
  return uploadToR2(key, JSON.stringify(payload), 'application/json', metadata);
}
