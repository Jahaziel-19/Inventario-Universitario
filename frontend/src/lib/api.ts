const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const mediaBaseUrl = (import.meta.env.VITE_MEDIA_BASE_URL as string | undefined)?.trim();

export const API_BASE_URL = (apiBaseUrl || '').replace(/\/+$/, '');
export const MEDIA_BASE_URL = (mediaBaseUrl || '').replace(/\/+$/, '');

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${normalizedPath}`;
  }
  return normalizedPath;
}

export function buildMediaUrl(path?: string | null): string {
  if (!path) {
    return '';
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = MEDIA_BASE_URL || API_BASE_URL;
  if (base) {
    return `${base}${normalizedPath}`;
  }
  return normalizedPath;
}

export function getAuthHeaders(token: string, extraHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  };
}
