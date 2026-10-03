import type { Place } from '../lib/place';
import { h, toast } from './dom';

export function shareText(place: Place): string {
  return place.event ? `🥳「${place.event}」の場所は…📍「${place.name}」！` : `📍「${place.name}」はここ！`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 下の方法を試す */
  }
  try {
    const ta = h('textarea', { readonly: true, style: 'position:fixed;top:-1000px;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** コピーもできない環境向け：選択できるURL欄を出す */
export function showManualCopy(url: string): void {
  document.querySelector('.manual-copy')?.remove();
  const input = h('input', { type: 'url', readonly: true, value: url, 'aria-label': '共有URL' });
  const dialog = h(
    'div',
    { class: 'manual-copy', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'URLをコピー' },
    h(
      'div',
      { class: 'manual-copy-box' },
      h('p', {}, 'このURLを長押し（または選択）してコピーしてください。'),
      input,
      h('button', { type: 'button', class: 'btn', onclick: () => dialog.remove() }, '閉じる'),
    ),
  );
  document.body.append(dialog);
  input.focus();
  input.select();
}

/**
 * 共有ボタン：Web Share API → クリップボード → 手動コピー の順に試す。
 * 必ずユーザーのタップから直接呼ぶこと（Web Share の制約）。
 */
export async function shareLink(place: Place, url: string): Promise<void> {
  const text = shareText(place);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: place.name, text, url });
      return;
    } catch (e) {
      // キャンセルはエラー扱いしない
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // それ以外（NotAllowedError など）はコピーへフォールバック
    }
  }
  if (await copyText(`${text}\n${url}`)) {
    toast('共有用のテキストとURLをコピーしました');
    return;
  }
  showManualCopy(url);
}

export async function copyLink(url: string): Promise<void> {
  if (await copyText(url)) toast('URLをコピーしました');
  else showManualCopy(url);
}
