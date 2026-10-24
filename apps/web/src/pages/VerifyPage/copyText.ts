/**
 * Copies text to the clipboard. Uses the async Clipboard API where the page
 * is a secure context and falls back to a hidden textarea + execCommand
 * elsewhere. Resolves false on failure; never throws.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const cb = navigator.clipboard;
    if (cb && typeof cb.writeText === 'function') {
      await cb.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
