import { Storage } from '@google-cloud/storage';

let client: Storage | null = null;

const getStorageClient = (): Storage => {
  if (client) {
    return client;
  }
  const credentialsRaw = process.env.GCS_CREDENTIALS_JSON;
  if (credentialsRaw) {
    client = new Storage({ credentials: JSON.parse(credentialsRaw) });
    return client;
  }
  client = new Storage();
  return client;
};

const normalizePrefix = (value: string | undefined): string => {
  if (!value) {
    return '';
  }
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
};

export const isGcsPath = (value: string): boolean => value.startsWith('gs://');

export const uploadToGcs = async (
  localPath: string,
  filename: string,
  contentType?: string,
): Promise<string> => {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) {
    throw new Error('gcs_bucket_missing');
  }
  const prefix = normalizePrefix(process.env.GCS_PREFIX);
  const key = prefix ? `${prefix}/${filename}` : filename;
  const storage = getStorageClient();
  await storage.bucket(bucketName).upload(localPath, {
    destination: key,
    contentType: contentType || undefined,
    metadata: contentType ? { contentType } : undefined,
  });
  return `gs://${bucketName}/${key}`;
};

export const downloadFromGcs = async (storagePath: string): Promise<Buffer> => {
  const match = storagePath.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error('invalid_gcs_path');
  }
  const [, bucketName, key] = match;
  const storage = getStorageClient();
  const [buffer] = await storage.bucket(bucketName).file(key).download();
  return buffer;
};
