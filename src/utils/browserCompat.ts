export function createBrowserId(prefix = 'id'): string {
  const randomUUID = globalThis.crypto?.randomUUID;

  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }

  const getRandomValues = globalThis.crypto?.getRandomValues;

  if (typeof getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    getRandomValues.call(globalThis.crypto, bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && globalThis.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}

export function observeElementSize(element: Element, onResize: () => void): () => void {
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(onResize);
    observer.observe(element);

    return () => observer.disconnect();
  }

  window.addEventListener('resize', onResize, { passive: true });

  return () => window.removeEventListener('resize', onResize);
}

export function getSafeBrowserReturnPath(returnTo: string | null | undefined, fallback = '/app'): string {
  if (!returnTo || typeof window === 'undefined') {
    return fallback;
  }

  try {
    const parsed = new URL(returnTo, window.location.origin);

    if (parsed.origin !== window.location.origin || parsed.pathname.startsWith('/api/')) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function navigateTopLevel(destination: string, mode: 'assign' | 'replace' = 'assign') {
  const targetUrl = new URL(destination, window.location.origin).toString();
  const navigate = mode === 'replace' ? 'replace' : 'assign';

  try {
    if (window.top && window.top !== window.self) {
      window.top.location[navigate](targetUrl);
      return;
    }
  } catch {}

  try {
    window.location[navigate](targetUrl);
  } catch {
    window.location.href = targetUrl;
  }
}