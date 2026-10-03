import { h } from './dom';

/** 共有URLが不正なとき。黙って別の地点を出さず、理由と入力画面への導線を示す。 */
export function mountErrorPage(root: HTMLElement, errors: string[]): void {
  root.append(
    h(
      'main',
      { class: 'error-page' },
      h('div', { class: 'error-emoji', 'aria-hidden': 'true' }, '🌏💦'),
      h('h1', {}, 'このリンクでは場所を表示できません'),
      h('ul', { class: 'error-list' }, ...errors.map((e) => h('li', {}, e))),
      h('p', {}, 'リンクが途中で切れていないか、送ってくれた人に確認してください。'),
      h('a', { class: 'btn btn-primary', href: './' }, '場所を作る画面へ'),
    ),
  );
}
