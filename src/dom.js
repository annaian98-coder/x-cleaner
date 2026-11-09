// 화면에서 글을 수집하고, 내부 요청이 막힐 때 버튼을 눌러 지운다.
(function (root) {
  const XC = (root.XC = root.XC || {});

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  XC.sleep = sleep;

  async function waitFor(fn, timeout = 8000, step = 200) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  XC.myHandle = function () {
    const a = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (!a) return null;
    return (a.getAttribute("href") || "").replace(/^\//, "").split("/")[0].toLowerCase() || null;
  };

  // X 안에서 새로고침 없이 이동한다.
  XC.gotoPath = function (path) {
    if (location.pathname + location.search === path) return;
    history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  };

  // 지금 보는 페이지가 내 프로필의 어느 탭인지.
  XC.pageKind = function () {
    // 마음 목록은 프로필 탭에서 역사 → 마음에 들어요(/i/history/likes)로 옮겨졌다.
    if (/^\/i\/history\/likes\/?$/.test(location.pathname)) return "likes";
    const me = XC.myHandle();
    const parts = location.pathname.replace(/^\//, "").split("/");
    if (!me || (parts[0] || "").toLowerCase() !== me) return null;
    if (!parts[1]) return "posts";
    if (parts[1] === "with_replies") return "replies";
    if (parts[1] === "reposts") return "reposts";
    if (parts[1] === "likes") return "likes";
    // 미디어는 사진(?filter=photo)과 동영상(그 밖)으로 나뉜다.
    if (parts[1] === "media") return /[?&]filter=photo\b/.test(location.search) ? "photos" : "videos";
    return null;
  };

  function statusLink(article) {
    const time = article.querySelector("time");
    const a = time && time.closest("a");
    const m = a && (a.getAttribute("href") || "").match(/^\/([^/]+)\/status\/(\d+)/);
    return m ? { author: m[1].toLowerCase(), id: m[2], time } : null;
  }

  function likeCount(article) {
    const btn = article.querySelector('[data-testid="like"], [data-testid="unlike"]');
    const label = btn && btn.getAttribute("aria-label");
    const m = label && label.match(/([\d,]+)/);
    return m ? Number(m[1].replace(/,/g, "")) : 0;
  }

  const txt = (el) => (el ? el.innerText || el.textContent || "" : "");

  // 화면의 글에서 사진·동영상을 찾는다. 인용한 글의 미디어는 세지 않는다.
  // 사진: 이 글 주소로 가는 사진 링크(/아이디/status/글ID/photo/N)가 있으면 사진이 있는 것.
  // 동영상: 인용 카드(시각 표시가 들어 있는 div[role="link"]) 밖에 있는 동영상.
  function mediaIn(art, id) {
    const photo = [...art.querySelectorAll('a[href*="/photo/"]')].some((a) => (a.getAttribute("href") || "").includes(`/status/${id}/photo/`));
    const quoteCards = [...art.querySelectorAll('div[role="link"]')].filter((d) => d.querySelector("time"));
    const video = [...art.querySelectorAll('[data-testid="videoPlayer"], [data-testid="videoComponent"], video')].some(
      (v) => !quoteCards.some((q) => q.contains(v))
    );
    return { photo, video };
  }

  const REPOST_RE = /재게시|리트윗|reposted|retweeted/i;
  const REPLY_RE = /^(replying to|답글 대상|님에게 보내는 답글)/i;

  // 화면에 보이는 글 중 지울 수 있는 것을 항목으로 만든다.
  XC.collectVisible = function () {
    const kind = XC.pageKind();
    if (!kind) return [];
    const me = XC.myHandle();
    const out = [];
    if (kind === "photos" || kind === "videos") {
      // 사진·동영상 화면은 격자라서 글 대신 미디어 링크(/아이디/status/ID/photo/1)를 읽는다.
      const seen = new Set();
      for (const a of document.querySelectorAll('a[href*="/status/"]')) {
        const m = (a.getAttribute("href") || "").match(/^\/([^/]+)\/status\/(\d+)\/(photo|video)\//);
        if (!m || m[1].toLowerCase() !== me || seen.has(m[2])) continue;
        seen.add(m[2]);
        const d = XC.idToDate(m[2]);
        const media = { photo: kind === "photos" || m[3] === "photo", video: kind === "videos" || m[3] === "video" };
        out.push({ id: m[2], type: "tweet", date: d ? d.toISOString() : null, text: "", likes: null, media, src: "page" });
      }
      return out;
    }
    for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
      const link = statusLink(art);
      if (!link) continue;
      const text = txt(art.querySelector('[data-testid="tweetText"]'));
      const date = link.time.getAttribute("datetime");
      const base = { id: link.id, date, text, likes: likeCount(art), selfLiked: !!art.querySelector('[data-testid="unlike"]'), media: mediaIn(art, link.id), src: "page" };
      if (kind === "likes") {
        out.push({ ...base, type: "like", likes: null });
        continue;
      }
      const ctx = art.querySelector('[data-testid="socialContext"]');
      // 재게시 탭에 있는 글은 전부 내가 재게시한 것이다. 다른 탭에 섞여 나오면 표시 문구로 가린다.
      if (kind === "reposts" || (ctx && REPOST_RE.test(txt(ctx)))) {
        out.push({ ...base, type: "retweet", rtSource: true, likes: null });
        continue;
      }
      if (link.author !== me) continue; // 답글 탭에 섞여 나오는 남의 원글
      const isReply = [...art.querySelectorAll("div")].some((d) => d.childElementCount <= 2 && REPLY_RE.test(txt(d).trim()));
      out.push({ ...base, type: isReply ? "reply" : "tweet" });
    }
    return out;
  };

  // 아래로 스크롤하며 계속 모은다. 새 글이 몇 번 연속 안 나오면 끝낸다.
  XC.scrollCollect = async function (onBatch, shouldStop) {
    let idle = 0;
    const seen = new Set();
    while (!shouldStop() && idle < 6) {
      const batch = XC.collectVisible().filter((it) => !seen.has(it.type + it.id));
      batch.forEach((it) => seen.add(it.type + it.id));
      if (batch.length) {
        idle = 0;
        onBatch(batch);
      } else idle++;
      window.scrollBy(0, Math.round(window.innerHeight * 0.85));
      await sleep(1200 + Math.random() * 900);
    }
    return seen.size;
  };

  function findArticle(id) {
    for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
      const l = statusLink(art);
      if (l && l.id === id) return art;
    }
    return null;
  }

  function click(el) {
    el.scrollIntoView({ block: "center" });
    el.click();
  }

  // 마음 목록 페이지에 있으면 페이지를 떠나지 않고 아래로 내려가며 찾는다.
  // 수집한 순서대로 처리하므로 다음 항목은 대개 바로 아래에 있다.
  async function findOnLikesPage(id) {
    let art = findArticle(id);
    if (art || XC.pageKind() !== "likes") return art;
    for (let i = 0; i < 6; i++) {
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
      art = await waitFor(() => findArticle(id), 1500);
      if (art) return art;
    }
    return null;
  }

  async function openStatus(id, preferFocal) {
    let art = findArticle(id);
    if (art) return art;
    XC.gotoPath(`/i/status/${id}`);
    art = await waitFor(() => findArticle(id) || (preferFocal && document.querySelector('article[data-testid="tweet"][tabindex="-1"]')), 10000);
    return art;
  }

  // 결과: "done" | "gone"
  XC.dom = {
    async deleteTweet(id) {
      const art = await openStatus(id, false);
      if (!art) return "gone";
      const caret = art.querySelector('[data-testid="caret"]');
      if (!caret) throw new Error("메뉴 버튼을 찾지 못했습니다");
      click(caret);
      const item = await waitFor(() =>
        [...document.querySelectorAll('[role="menuitem"]')].find((m) => /삭제|Delete/.test(txt(m)))
      );
      if (!item) {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        throw new Error("삭제 메뉴가 없습니다(내 글이 아닐 수 있음)");
      }
      click(item);
      const ok = await waitFor(() => document.querySelector('[data-testid="confirmationSheetConfirm"]'));
      if (!ok) throw new Error("확인 버튼을 찾지 못했습니다");
      click(ok);
      await sleep(800);
      return "done";
    },
    async unretweet(id) {
      const art = await openStatus(id, true);
      if (!art) return "gone";
      const btn = art.querySelector('[data-testid="unretweet"]');
      if (!btn) return "gone"; // 이미 취소됨
      click(btn);
      const ok = await waitFor(() => document.querySelector('[data-testid="unretweetConfirm"]'));
      if (!ok) throw new Error("재게시 취소 버튼을 찾지 못했습니다");
      click(ok);
      await sleep(600);
      return "done";
    },
    async unlike(id, relike) {
      const art = (await findOnLikesPage(id)) || (await openStatus(id, false));
      if (!art) return "gone";
      const heart = (sel) => {
        // 하트를 누르면 글 카드가 다시 그려질 수 있어 매번 새로 찾는다.
        const a = findArticle(id) || art;
        return a.querySelector(sel);
      };
      if (!heart('[data-testid="unlike"]')) {
        if (!relike) return "gone"; // 이미 취소된 마음
        const like = heart('[data-testid="like"]');
        if (!like) return "gone";
        click(like);
        if (!(await waitFor(() => heart('[data-testid="unlike"]'), 5000))) throw new Error("다시 누르기가 반영되지 않았습니다");
        await sleep(800);
      }
      click(heart('[data-testid="unlike"]'));
      // 빈 하트로 바뀌는 것까지 확인해야 실제로 취소된 것으로 친다.
      const ok = await waitFor(() => heart('[data-testid="like"]'), 5000);
      if (!ok) throw new Error("마음 취소가 화면에 반영되지 않았습니다");
      await sleep(400);
      return "done";
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
