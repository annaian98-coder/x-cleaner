// 지울 대상을 조금씩 가져온다. 가능하면 요청으로 페이지 단위로 받고, 막히면 스크롤로 바꾼다.
(function (root) {
  const XC = (root.XC = root.XC || {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hhmm = (t) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  // 요청으로 20개씩 받는다. 화면을 움직이지 않는다.
  function apiSource(kind) {
    let cursor = null;
    let empties = 0;
    let done = false;
    let first = true;
    return {
      mode: "api",
      async next(shouldStop) {
        if (done || shouldStop()) return null;
        if (!first) await sleep(800 + Math.random() * 700); // 목록 요청 사이 간격
        first = false;
        const page = await XC.api.timelinePage(kind, cursor);
        empties = page.items.length ? 0 : empties + 1;
        // 다음 페이지 표시가 없거나 같거나, 빈 페이지가 두 번 이어지면 끝까지 온 것이다.
        if (!page.cursor || page.cursor === cursor || empties >= 2) done = true;
        cursor = page.cursor;
        return page.items;
      },
    };
  }

  // 화면을 내리며 보이는 글을 읽는다. 요청이 막혔을 때와 재게시 탭에서 쓴다.
  function scrollSource() {
    let idle = 0;
    const seen = new Set();
    return {
      mode: "scroll",
      async next(shouldStop) {
        if (shouldStop() || idle >= 6) return null;
        const vis = XC.collectVisible().filter((it) => !seen.has(XC.itemKey(it)));
        vis.forEach((it) => seen.add(XC.itemKey(it)));
        idle = vis.length ? 0 : idle + 1;
        window.scrollBy(0, Math.round(window.innerHeight * 0.85));
        await sleep(1200 + Math.random() * 900);
        if (!vis.length && idle >= 6) return null; // 새 글이 6번 연속 없으면 끝
        return vis;
      },
    };
  }

  // hooks.onStatus(text): 요청 제한 대기 안내, hooks.onSwitch(err): 스크롤로 바꿀 때
  XC.makeCollector = function (kind, hooks = {}) {
    let src = XC.api.canList(kind) ? apiSource(kind) : scrollSource();
    let rechecked = src.mode === "api";
    const all = new Set();
    return {
      get mode() {
        return src.mode;
      },
      // 새 항목 배열(비어 있을 수 있음)을 돌려주고, 끝이면 null.
      async next(shouldStop) {
        // 처음에 요청 기록이 없어서 스크롤로 정했으면, 기록을 한 번 더 받아 보고 요청 방식으로 바꾼다.
        if (!rechecked) {
          rechecked = true;
          await XC.api.refreshCaptured();
          if (XC.api.canList(kind)) src = apiSource(kind);
        }
        for (;;) {
          try {
            const batch = await src.next(shouldStop);
            if (!batch) return null;
            const fresh = batch.filter((it) => !all.has(XC.itemKey(it)));
            fresh.forEach((it) => all.add(XC.itemKey(it)));
            return fresh;
          } catch (e) {
            if (e instanceof XC.RateLimitError) {
              const until = e.resetAt + 5000;
              hooks.onStatus && hooks.onStatus(`불러오기 제한: ${hhmm(until)}에 이어서 불러옵니다.`);
              while (Date.now() < until && !shouldStop()) await sleep(1000);
              hooks.onStatus && hooks.onStatus("");
              if (shouldStop()) return null;
              continue;
            }
            if (src.mode === "api") {
              hooks.onSwitch && hooks.onSwitch(e);
              src = scrollSource();
              continue;
            }
            throw e;
          }
        }
      },
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
