import './styles.css';
import { buildShareUrl, parsePlaceParams } from './lib/place';
import { mountEditor } from './ui/editor';
import { mountErrorPage } from './ui/errorPage';
import { mountViewer } from './ui/viewer';

const root = document.getElementById('app')!;
const parsed = parsePlaceParams(window.location.search);

if (parsed.kind === 'ok') {
  const { name, event } = parsed.place;
  document.title = `${event ? `${event}｜` : ''}${name} | ゴージャス地図（仮）`;
  document.body.classList.add('mode-viewer');
  mountViewer(root, parsed.place, {
    mode: 'share',
    // 閲覧者の共有ボタンも、既知パラメータだけで組み立て直した同じ地点のリンクを共有する
    shareUrl: buildShareUrl(window.location.href, parsed.place),
  });
} else if (parsed.kind === 'error') {
  document.body.classList.add('mode-error');
  mountErrorPage(root, parsed.errors);
} else {
  document.body.classList.add('mode-editor');
  mountEditor(root);
}
