export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export type AvatarFormat = {
  contentType: "image/avif" | "image/gif" | "image/jpeg" | "image/png" | "image/webp";
  extension: "avif" | "gif" | "jpg" | "png" | "webp";
};

const bytePrefixEquals = (bytes: Uint8Array, prefix: readonly number[]) =>
  bytes.length >= prefix.length && prefix.every((value, index) => bytes[index] === value);

const asciiAt = (bytes: Uint8Array, offset: number, value: string) =>
  bytes.length >= offset + value.length &&
  [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));

export function detectAvatarFormat(bytes: Uint8Array): AvatarFormat | null {
  if (bytePrefixEquals(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (bytePrefixEquals(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", extension: "png" };
  }
  if (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a")) {
    return { contentType: "image/gif", extension: "gif" };
  }
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (asciiAt(bytes, 4, "ftyp")) {
    const brandBytes = bytes.subarray(8, Math.min(bytes.length, 40));
    const brands = String.fromCharCode(...brandBytes);
    if (brands.includes("avif") || brands.includes("avis")) {
      return { contentType: "image/avif", extension: "avif" };
    }
  }
  return null;
}

export function validateAvatarUpload(
  bytes: Uint8Array,
  declaredContentType: string,
): AvatarFormat | null {
  const format = detectAvatarFormat(bytes);
  if (!format) return null;

  const normalizedType = declaredContentType.trim().toLowerCase();
  if (
    normalizedType &&
    normalizedType !== "application/octet-stream" &&
    normalizedType !== format.contentType
  ) {
    return null;
  }
  return format;
}

export function avatarPathFromPublicUrl(url: string, userId: string): string | null {
  if (!url) return null;
  try {
    const pathname = new URL(url).pathname;
    const prefix = "/storage/v1/object/public/media/";
    if (!pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(pathname.slice(prefix.length));
    return path.startsWith(`${userId}/avatars/`) ? path : null;
  } catch {
    return null;
  }
}
