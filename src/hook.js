// 페이지 쪽(MAIN world)에서 실행된다. X 웹앱이 목록을 불러올 때 보내는 요청 주소와 헤더를 확장에 알려 준다.
// X는 목록 요청마다 서명 헤더(x-client-transaction-id 등)를 붙이는데, 확장이 스스로 만들 수 없어 X가 쓴 값을 빌린다.
(() => {
  if (window.__xcHook) return;
  window.__xcHook = true;

  // 이름이 바뀌어도 알 수 있게 모든 graphql 요청을 기록한다.
  const RE = /\/i\/api\/graphql\/[\w-]+\/(\w+)/;

  // 확장 본체는 페이지가 다 그려진 뒤에 켜지므로, 그 전에 본 요청은 보관해 뒀다가 물어보면 다시 알려 준다.
  const store = {};
  const seenVia = { fetch: 0, xhr: 0 };
  const post = (rec) => window.postMessage({ __xc: "req", ...rec }, location.origin);

  const report = (url, headers) => {
    try {
      const m = RE.exec(url);
      if (!m) return;
      const rec = { op: m[1], url: new URL(url, location.href).href, headers };
      store[rec.op] = rec;
      post(rec);
    } catch (e) {
      /* 기록 실패는 무시 */
    }
  };

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.__xc !== "ask") return;
    window.postMessage({ __xc: "hello", via: seenVia }, location.origin);
    for (const op in store) post(store[op]);
  });

  const toObj = (h) => {
    const o = {};
    if (!h) return o;
    if (typeof Headers !== "undefined" && h instanceof Headers) h.forEach((v, k) => (o[k.toLowerCase()] = v));
    else if (Array.isArray(h)) h.forEach(([k, v]) => (o[String(k).toLowerCase()] = v));
    else for (const k in h) o[k.toLowerCase()] = h[k];
    return o;
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input && input.url;
      if (url && RE.test(url)) {
        const h = toObj(init && init.headers);
        if (typeof Request !== "undefined" && input instanceof Request) input.headers.forEach((v, k) => !(k in h) && (h[k] = v));
        seenVia.fetch++;
        report(url, h);
      }
    } catch (e) {}
    return origFetch.apply(this, arguments);
  };

  const P = XMLHttpRequest.prototype;
  const open = P.open;
  const setHeader = P.setRequestHeader;
  const send = P.send;
  P.open = function (method, url) {
    this.__xcUrl = String(url);
    this.__xcH = {};
    return open.apply(this, arguments);
  };
  P.setRequestHeader = function (k, v) {
    if (this.__xcH) this.__xcH[String(k).toLowerCase()] = v;
    return setHeader.apply(this, arguments);
  };
  P.send = function () {
    if (this.__xcUrl && RE.test(this.__xcUrl)) {
      seenVia.xhr++;
      report(this.__xcUrl, this.__xcH);
    }
    return send.apply(this, arguments);
  };
})();
