import { validateObjectKey } from "./objectKeys";

export interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

export interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

export interface R2Object {
  key: string;
  size: number;
  etag: string;
  httpEtag?: string;
  uploaded: Date;
  httpMetadata: R2HTTPMetadata;
  customMetadata: Record<string, string>;
  checksums?: Record<string, ArrayBuffer>;
  storageClass?: string;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream<Uint8Array> | null;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  blob(): Promise<Blob>;
}

export interface R2UploadedPart {
  partNumber: number;
  etag: string;
}

export interface R2MultipartUploadBinding {
  readonly key: string;
  readonly uploadId: string;
  uploadPart(partNumber: number, value: R2RequestBody, options?: { httpMetadata?: R2HTTPMetadata; customMetadata?: Record<string, string> }): Promise<R2UploadedPart>;
  complete(uploadedParts: R2UploadedPart[]): Promise<R2Object>;
  abort(): Promise<void>;
}

export type R2PutValue = ReadableStream | ArrayBuffer | Uint8Array | string | Blob | null;

export type R2RequestBody = ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string | Blob | null;

export interface R2BucketBinding {
  head(key: string): Promise<R2Object | null>;
  get(key: string, options?: { range?: { offset: number; length: number } | { suffix: number } }): Promise<R2ObjectBody | null>;
  put(key: string, value: R2PutValue, options?: R2PutOptions): Promise<R2Object | null>;
  delete(key: string | string[]): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string; delimiter?: string; include?: string[] }): Promise<{
    objects: R2Object[];
    truncated: boolean;
    cursor?: string;
    delimitedPrefixes: string[];
  }>;
  createMultipartUpload(key: string, options?: R2PutOptions): Promise<R2MultipartUploadBinding>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUploadBinding;
}

export interface PutObjectOptions {
  contentType: string;
  size?: number;
  maxSizeBytes?: number;
  metadata?: Record<string, string>;
  httpMetadata?: R2HTTPMetadata;
  checksum?: string;
}

export interface StoredObjectMetadata {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  contentType?: string;
  checksum?: string;
  customMetadata: Record<string, string>;
}

export const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_PART_NUMBER = 10000;

function requireValidContentType(contentType: string): void {
  if (contentType.trim().length === 0) {
    throw new Error("contentType is required");
  }
}

function validateSize(size: number): void {
  if (!Number.isFinite(size) || size < 0) {
    throw new Error("size must be a non-negative finite number");
  }
}

export function toStoredObjectMetadata(object: R2Object): StoredObjectMetadata {
  return {
    key: object.key,
    size: object.size,
    etag: object.etag,
    uploaded: object.uploaded,
    contentType: object.httpMetadata?.contentType,
    checksum: object.customMetadata?.checksum,
    customMetadata: object.customMetadata ?? {},
  };
}

export class R2MultipartUpload {
  readonly key: string;
  readonly uploadId: string;
  private readonly binding: R2MultipartUploadBinding;

  constructor(binding: R2MultipartUploadBinding) {
    this.key = binding.key;
    this.uploadId = binding.uploadId;
    this.binding = binding;
  }

  async uploadPart(partNumber: number, value: R2RequestBody): Promise<R2UploadedPart> {
    return this.binding.uploadPart(partNumber, value);
  }

  async complete(uploadedParts: R2UploadedPart[]): Promise<R2Object> {
    return this.binding.complete(uploadedParts);
  }

  async abort(): Promise<void> {
    await this.binding.abort();
  }
}

export class R2ObjectStore {
  private readonly bucket: R2BucketBinding;

  constructor(bucket: R2BucketBinding) {
    this.bucket = bucket;
  }

  async put(key: string, value: R2PutValue, options: PutObjectOptions): Promise<R2Object> {
    validateObjectKey(key);
    requireValidContentType(options.contentType);
    if (options.size !== undefined) {
      validateSize(options.size);
    }
    if (options.maxSizeBytes !== undefined) {
      if (!Number.isSafeInteger(options.maxSizeBytes) || options.maxSizeBytes <= 0) {
        throw new Error("maxSizeBytes must be a positive safe integer");
      }
      if (options.size !== undefined && options.size > options.maxSizeBytes) {
        throw new Error(`object size ${options.size} exceeds maxSizeBytes ${options.maxSizeBytes}`);
      }
    }
    const httpMetadata = { ...(options.httpMetadata ?? {}), contentType: options.contentType };
    const customMetadata: Record<string, string> = { ...(options.metadata ?? {}) };
    if (options.checksum !== undefined) {
      customMetadata.checksum = options.checksum;
    }
    const object = await this.bucket.put(key, value, { httpMetadata, customMetadata });
    if (object === null) {
      throw new Error(`R2 put returned no object for key "${key}"`);
    }
    return object;
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    validateObjectKey(key);
    return this.bucket.get(key);
  }

  async head(key: string): Promise<R2Object | null> {
    validateObjectKey(key);
    return this.bucket.head(key);
  }

  async delete(key: string): Promise<void> {
    validateObjectKey(key);
    await this.bucket.delete(key);
  }

  async list(prefix?: string): Promise<StoredObjectMetadata[]> {
    if (prefix !== undefined && prefix.length > 0) {
      validateObjectKey(prefix);
    }
    const { objects } = await this.bucket.list({ prefix });
    return objects.map(toStoredObjectMetadata);
  }

  async createMultipartUpload(key: string, options?: { contentType?: string; metadata?: Record<string, string> }): Promise<R2MultipartUpload> {
    validateObjectKey(key);
    let putOptions: R2PutOptions | undefined;
    if (options?.contentType !== undefined || options?.metadata !== undefined) {
      const httpMetadata = options?.contentType !== undefined ? { contentType: options.contentType } : undefined;
      putOptions = {
        ...(httpMetadata !== undefined ? { httpMetadata } : {}),
        ...(options?.metadata !== undefined ? { customMetadata: options.metadata } : {}),
      };
    }
    const binding = await this.bucket.createMultipartUpload(key, putOptions);
    return new R2MultipartUpload(binding);
  }

  async uploadPart(multipart: R2MultipartUpload, partNumber: number, value: R2RequestBody, options?: { size?: number; isFinal?: boolean }): Promise<R2UploadedPart> {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_PART_NUMBER) {
      throw new Error(`partNumber must be an integer between 1 and ${MAX_PART_NUMBER}`);
    }
    if (options?.size !== undefined) {
      validateSize(options.size);
      if (options.size < MIN_PART_SIZE_BYTES && options.isFinal !== true) {
        throw new Error(`parts must be at least ${MIN_PART_SIZE_BYTES} bytes unless they are final`);
      }
    }
    return multipart.uploadPart(partNumber, value);
  }

  async completeMultipartUpload(multipart: R2MultipartUpload, uploadedParts: R2UploadedPart[]): Promise<R2Object> {
    if (uploadedParts.length === 0) {
      throw new Error("cannot complete a multipart upload without parts");
    }
    const sorted = [...uploadedParts].sort((a, b) => a.partNumber - b.partNumber);
    return multipart.complete(sorted);
  }

  async abortMultipartUpload(multipart: R2MultipartUpload): Promise<void> {
    await multipart.abort();
  }
}