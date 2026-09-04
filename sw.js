/* FX Entry Checklist — Service Worker（S28）
 *
 * 役割はオフライン用のキャッシュ制御だけ。アプリのロジックは index.html に閉じたまま
 * なので、このファイルにアプリのコードを書き足さないこと。
 *
 * ⚠ index.html を更新したら CACHE の版番号を上げること。
 *   上げ忘れても HTML は network-first なので最新が届くが、assets の差し替えは届かない。
 */
const CACHE = 'fx-checklist-v24';

/* 起動に最低限必要なもの。画像は重いので事前取得せず、使われたときに入れる。 */
const PRECACHE = ['./', './index.html', './manifest.webmanifest',
                  './assets/icon-192.png', './assets/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      /* 1つでも取れないと install ごと失敗して以後ずっと未登録になる。
         オフライン対応は次回訪問で追いつけばよいので、失敗は握って先へ進める。 */
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('fx-checklist-') && k !== CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  /* 別オリジン（Supabase など）は絶対に触らない。
     同期リクエストがキャッシュから返ると、古いデータで上書きする事故になる。 */
  if (url.origin !== self.location.origin) return;

  /* HTML は network-first。更新したら次のオンライン起動で必ず新版になる。
     ここを cache-first にすると「直したのに反映されない」典型的な事故が起きる。 */
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* それ以外（画像・manifest）は cache-first。内容が変わらない前提のもの。 */
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
