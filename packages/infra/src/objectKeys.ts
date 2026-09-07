export const MAX_OBJECT_KEY_LENGTH = 1024;

export function validateObjectKey(key: string): void {
  if (key.length === 0) {
    throw new Error("object key must not be empty");
  }
  if (key.length > MAX_OBJECT_KEY_LENGTH) {
    throw new Error(`object key exceeds ${MAX_OBJECT_KEY_LENGTH} characters`);
  }
  if (key.includes("\0")) {
    throw new Error("object key must not contain NUL characters");
  }
  if (/[\u0000-\u001f\u007f]/.test(key)) {
    throw new Error("object key must not contain control characters");
  }
  if (key.startsWith("/") || key.startsWith("\\")) {
    throw new Error("object key must not be absolute");
  }
  const normalized = key.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.includes("..")) {
    throw new Error("object key must not contain path traversal segments");
  }
  for (const segment of segments) {
    if (segment.length === 0) {
      throw new Error("object key must not contain empty path segments");
    }
  }
}

export function sanitizeFilename(filename: string): string {
  if (filename.length === 0) {
    throw new Error("filename must not be empty");
  }
  if (/[\u0000-\u001f\u007f]/.test(filename)) {
    throw new Error("filename must not contain control characters");
  }
  const basename = filename.split(/[\\/]/).filter((part) => part.length > 0).pop() ?? "";
  if (basename === "." || basename === "..") {
    throw new Error("filename must not be dot-relative");
  }
  const cleaned = basename.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (cleaned.length === 0) {
    throw new Error("filename contains no safe characters");
  }
  if (cleaned.length > 255) {
    throw new Error("filename exceeds 255 characters");
  }
  return cleaned;
}

function assertId(id: string, field: string): void {
  if (id.length === 0) {
    throw new Error(`${field} must not be empty`);
  }
  if (/[\u0000-\u001f\u007f]/.test(id)) {
    throw new Error(`${field} must not contain control characters`);
  }
  if (/[\\/]/.test(id) || id === "." || id === "..") {
    throw new Error(`${field} must be a plain identifier`);
  }
}

export function sourceAssetObjectKey(projectId: string, sourceAssetId: string, filename: string): string {
  assertId(projectId, "projectId");
  assertId(sourceAssetId, "sourceAssetId");
  const safeFilename = sanitizeFilename(filename);
  const key = `projects/${projectId}/source-assets/${sourceAssetId}/${safeFilename}`;
  validateObjectKey(key);
  return key;
}