/** Parseo mínimo del header `Cookie` (sin dependencia nueva — formato `k=v; k2=v2`). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  return cookies;
}

export interface CookieOptions {
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: 'Strict' | 'Lax' | 'None';
  readonly path?: string;
  readonly maxAgeSeconds?: number;
}

/** Serializa un `Set-Cookie` (sin dependencia nueva). */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path ?? '/'}`);
  if (options.maxAgeSeconds !== undefined) {
    segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  }
  if (options.httpOnly) {
    segments.push('HttpOnly');
  }
  if (options.secure) {
    segments.push('Secure');
  }
  segments.push(`SameSite=${options.sameSite ?? 'Lax'}`);
  return segments.join('; ');
}

/** `Set-Cookie` para borrar una cookie (Max-Age=0). */
export function expireCookie(name: string, options: Omit<CookieOptions, 'maxAgeSeconds'> = {}): string {
  return serializeCookie(name, '', { ...options, maxAgeSeconds: 0 });
}
