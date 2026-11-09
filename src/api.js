// X 웹이 내부적으로 쓰는 요청을 로그인된 세션으로 보낸다.
(function (root) {
  const XC = (root.XC = root.XC || {});

  // x.com 웹 클라이언트에 공개적으로 박혀 있는 토큰. 개인 키가 아니다.
  const WEB_BEARER =
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

  // 번들에서 못 찾았을 때 쓰는 마지막으로 알려진 값.
  const FALLBACK_IDS = {
    DeleteTweet: "VaenaVgh5q5ih7kvyVjgtg",
    DeleteRetweet: "iQtK4dl5hBmXewYZuEOKVw",
    FavoriteTweet: "lI07N6Otwv1PhnEgXILM7A",
    UnfavoriteTweet: "ZYKSe-w7KEslx3JhSIk5LA",
  };

  let queryIds = { ...FALLBACK_IDS };
  let opMeta = {}; // 목록 요청에 필요한 설정값 이름 { op: { features, toggles } }
  let discovered = false;

  class RateLimitError extends Error {
    constructor(resetAt) {
      super("요청 제한");
      this.resetAt = resetAt;
    }
  }
  class AuthError extends Error {}
  class EndpointError extends Error {}
  XC.RateLimitError = RateLimitError;
  XC.AuthError = AuthError;
  XC.EndpointError = EndpointError;

  function csrf() {
    const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    return m ? m[1] : null;
  }

  // X 웹이 직접 보낸 요청을 브라우저 기록에서 읽어 ID와 설정값을 그대로 따라 한다.
  // 답글 탭을 열면 X가 UserTweetsAndReplies를 부르므로 그 주소에 필요한 값이 모두 들어 있다.
  const learned = {}; // op -> { id, features, toggles }
  function learnEntry(name) {
    const m = /\/i\/api\/graphql\/([\w-]+)\/(\w+)\?(.*)$/.exec(name || "");
    if (!m) return;
    try {
      const p = new URLSearchParams(m[3]);
      const rec = { id: m[1] };
      if (p.get("features")) rec.features = JSON.parse(p.get("features"));
      if (p.get("fieldToggles")) rec.toggles = JSON.parse(p.get("fieldToggles"));
      learned[m[2]] = rec;
      queryIds[m[2]] = m[1];
    } catch (e) {
      /* 주소가 잘린 경우 등 */
    }
  }
  // hook.js가 알려 주는 X 웹앱의 실제 요청(주소 + 헤더)
  const captured = {}; // op -> headers
  const capturedUrl = {}; // op -> X가 보낸 주소 (변수 복사용)
  const capturedAt = {}; // op -> 받은 시각
  let hookHello = null; // 감시 스크립트가 살아 있으면 { fetch, xhr } 횟수
  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data) return;
    if (ev.data.__xc === "hello") {
      hookHello = ev.data.via || {};
      return;
    }
    if (ev.data.__xc !== "req") return;
    const { op, url, headers } = ev.data;
    if (!op || !url) return;
    learnEntry(url);
    if (headers && typeof headers === "object") {
      captured[op] = headers;
      capturedUrl[op] = url;
      capturedAt[op] = Date.now();
    }
  });
  // 확장이 켜지기 전에 X가 보낸 요청이 있으면 다시 알려 달라고 한다.
  const askHook = () => window.postMessage({ __xc: "ask" }, location.origin);
  askHook();

  try {
    performance.setResourceTimingBufferSize(3000);
  } catch (e) {}
  try {
    performance.getEntriesByType("resource").forEach((e) => learnEntry(e.name));
    new PerformanceObserver((list) => list.getEntries().forEach((e) => learnEntry(e.name))).observe({ type: "resource", buffered: true });
  } catch (e) {}

  XC.discoverQueryIds = async function (force) {
    if (discovered && !force) return queryIds;
    discovered = true;
    // 처음부터 있던 스크립트와, 나중에 불러온 뒤 태그가 지워진 스크립트까지 모두 본다.
    const urls = [
      ...new Set(
        [...document.querySelectorAll("script[src]")]
          .map((s) => s.src)
          .concat(performance.getEntriesByType("resource").map((e) => e.name))
          .filter((u) => /abs\.twimg\.com\/responsive-web\/.+\.js(\?|$)/.test(u))
      ),
    ].sort((a, b) => (/\/main\./.test(b) ? 1 : 0) - (/\/main\./.test(a) ? 1 : 0));
    try {
      const found = await chrome.runtime.sendMessage({ type: "xc-scan-bundles", urls });
      if (found && found.ids) {
        queryIds = { ...queryIds, ...found.ids };
        opMeta = { ...opMeta, ...(found.meta || {}) };
      }
    } catch (e) {
      // 번들을 못 읽어도 알려진 값으로 진행한다.
    }
    for (const op in learned) queryIds[op] = learned[op].id; // X가 실제로 쓴 값이 우선
    return queryIds;
  };

  function headers(token) {
    return {
      authorization: "Bearer " + WEB_BEARER,
      "content-type": "application/json",
      "x-csrf-token": token,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": document.documentElement.lang || "ko",
    };
  }

  function rateLimitFrom(res) {
    const reset = Number(res.headers.get("x-rate-limit-reset"));
    return new RateLimitError(reset ? reset * 1000 : Date.now() + 15 * 60 * 1000);
  }

  async function gql(op, variables) {
    const token = csrf();
    if (!token) throw new AuthError("로그인 정보(ct0)를 찾지 못했습니다. x.com에 로그인했는지 확인하세요.");
    const id = queryIds[op];
    const res = await fetch(`${location.origin}/i/api/graphql/${id}/${op}`, {
      method: "POST",
      credentials: "include",
      headers: headers(token),
      body: JSON.stringify({ variables, queryId: id }),
    });

    if (res.status === 429) throw rateLimitFrom(res);
    if (res.status === 401) throw new AuthError("로그인이 풀렸습니다. 다시 로그인한 뒤 이어하기를 누르세요.");

    let json = null;
    try {
      json = await res.json();
    } catch (e) {
      /* 본문이 없는 응답 */
    }

    if (!res.ok) {
      const code = json && json.errors && json.errors[0] && json.errors[0].code;
      if (res.status === 403 && (code === 326 || code === 64)) throw new AuthError("계정이 잠겼거나 정지 상태입니다. x.com에서 확인하세요.");
      if (code === 88) throw new RateLimitError(Date.now() + 15 * 60 * 1000);
      throw new EndpointError(`HTTP ${res.status}`);
    }
    return json || {};
  }

  // 결과: "done" | "gone"(이미 없음)
  function interpret(json, okPath) {
    const errs = (json && json.errors) || [];
    if (errs.length) {
      const e = errs[0];
      const msg = String(e.message || "");
      if (e.code === 144 || /not found|No status|doesn't exist|찾을 수 없/i.test(msg)) return "gone";
      if (e.code === 88) throw new RateLimitError(Date.now() + 15 * 60 * 1000);
      if (e.code === 326 || e.code === 64) throw new AuthError("계정이 잠겼거나 정지 상태입니다.");
      if (/query|Unspecified|ValidationError/i.test(msg)) throw new EndpointError(msg);
      throw new Error(msg || "알 수 없는 오류");
    }
    if (okPath && !okPath(json)) throw new EndpointError("예상과 다른 응답");
    return "done";
  }

  // ---------- 목록 불러오기 (스크롤 없이 페이지 단위로) ----------

  // X는 목록 요청 이름을 바꾸기도 한다(예: UserTweetsAndReplies → UserRepliesTimeline).
  // 그래서 X가 실제로 보낸 요청 중 탭에 맞는 이름을 고르고, 못 봤으면 예전 이름을 쓴다.
  const KIND_OPS = {
    posts: { match: [/^UserOriginalsTimeline$/, /^UserTweets$/, /^User(Posts|Tweets|Originals)Timeline$/], fallback: "UserTweets" },
    replies: { match: [/^UserRepliesTimeline$/, /^UserTweetsAndReplies$/, /^User\w*Replies\w*$/], fallback: "UserTweetsAndReplies" },
    likes: { match: [/^Likes$/, /^User\w*Likes\w*$/, /^Likes\w*$/], fallback: "Likes" },
    reposts: { match: [/^User\w*Reposts?\w*$/, /Reposts?Timeline/], fallback: null },
    photos: { match: [/^UserPhotoTimeline$/, /^User\w*Photos?\w*$/], fallback: null },
    videos: { match: [/^UserVideoTimeline$/, /^User\w*Videos?\w*$/, /^UserMedia$/], fallback: null },
  };
  function pickOp(kind) {
    const k = KIND_OPS[kind];
    if (!k) return null;
    for (const re of k.match) {
      const op = Object.keys(captured).find((o) => re.test(o));
      if (op) return op;
    }
    return k.fallback;
  }

  function myUserId() {
    const m = document.cookie.match(/(?:^|;\s*)twid=([^;]+)/);
    if (!m) return null;
    let v = m[1];
    for (let i = 0; i < 2; i++) v = decodeURIComponent(v);
    const id = v.match(/u=(\d+)/);
    return id ? id[1] : null;
  }

  // twid 쿠키를 못 읽을 때: 프로필 요청 응답에서 내 계정 번호를 찾는다.
  let cachedUserId = null;
  async function userIdFromHandle() {
    const h = XC.myHandle && XC.myHandle();
    if (!h) return null;
    const e = performance
      .getEntriesByType("resource")
      .map((x) => x.name)
      .reverse()
      .find((n) => /\/UserByScreenName\?/.test(n) && decodeURIComponent(n).toLowerCase().includes(`"screen_name":"${h}"`));
    if (!e) return null;
    try {
      const res = await fetch(e, { credentials: "include", headers: { ...headers(csrf()), ...(captured.UserByScreenName || {}), "x-csrf-token": csrf() } });
      const j = await res.json();
      return (j && j.data && j.data.user && j.data.user.result && j.data.user.result.rest_id) || null;
    } catch (err) {
      return null;
    }
  }

  // 페이지에 박혀 있는 설정값(__INITIAL_STATE__)에서 값을 읽는다. 없으면 false.
  let stateText = null;
  function featureValue(name) {
    if (stateText == null) {
      const sc = [...document.querySelectorAll("script:not([src])")].find((s) => s.textContent.includes("__INITIAL_STATE__"));
      stateText = sc ? sc.textContent : "";
    }
    const m = stateText.match(new RegExp(`"${name}":\\{"value":(true|false)`));
    return m ? m[1] === "true" : false;
  }

  const extraFeatures = {}; // 서버가 빠졌다고 알려 준 설정값
  // 실패 원인을 좁히기 위한 진단 문구
  function diagnose() {
    const hook = hookHello ? `감시 동작(fetch ${hookHello.fetch || 0}, xhr ${hookHello.xhr || 0})` : "감시 응답 없음";
    const seenOps = Object.keys(captured);
    const perfOps = [
      ...new Set(
        performance
          .getEntriesByType("resource")
          .map((e) => (/\/i\/api\/graphql\/[\w-]+\/(\w+)/.exec(e.name) || [])[1])
          .filter(Boolean)
      ),
    ];
    return `${hook} · 감시가 본 요청: ${seenOps.join(",") || "없음"} · 브라우저 기록: ${perfOps.slice(-12).join(",") || "없음"}`;
  }

  async function gqlGet(op, variables) {
    const token = csrf();
    if (!token) throw new AuthError("로그인 정보(ct0)를 찾지 못했습니다.");
    const id = queryIds[op];
    if (!id) throw new EndpointError(`${op} 요청 ID를 찾지 못했습니다 · ${diagnose()}`);
    if (!captured[op]) {
      askHook();
      await new Promise((r) => setTimeout(r, 400));
    }
    const meta = opMeta[op] || { features: [], toggles: [] };
    const seen = learned[op];
    let nudged = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      let features = {};
      let toggles = null;
      if (seen && seen.features) {
        features = { ...seen.features };
        toggles = seen.toggles || null;
      } else {
        for (const f of meta.features) features[f] = featureValue(f);
        if (meta.toggles.length) {
          toggles = {};
          for (const t of meta.toggles) toggles[t] = false;
        }
      }
      Object.assign(features, extraFeatures[op] || {});
      const qs = new URLSearchParams({ variables: JSON.stringify(variables), features: JSON.stringify(features) });
      if (toggles) qs.set("fieldToggles", JSON.stringify(toggles));
      // X가 같은 목록을 부를 때 쓴 헤더(서명 포함)를 그대로 붙인다.
      const h = { ...headers(token), ...(captured[op] || {}), "x-csrf-token": token };
      const res = await fetch(`${location.origin}/i/api/graphql/${id}/${op}?${qs}`, {
        method: "GET",
        credentials: "include",
        headers: h,
      });
      if (res.status === 429) throw rateLimitFrom(res);
      if (res.status === 401) throw new AuthError("로그인이 풀렸습니다.");
      let json = null;
      try {
        json = await res.json();
      } catch (e) {
        /* 본문 없음 */
      }
      const err = json && json.errors && json.errors[0];
      const missing = err && String(err.message || "").match(/features cannot be null:\s*(.+)$/i);
      if (missing && attempt < 2) {
        extraFeatures[op] = extraFeatures[op] || {};
        for (const f of missing[1].split(/,\s*/)) extraFeatures[op][f.trim()] = false;
        continue;
      }
      if (res.status === 404 && captured[op] && !nudged) {
        nudged = true;
        const before = capturedAt[op] || 0;
        window.scrollTo(0, document.documentElement.scrollHeight); // X가 다음 목록을 새 서명으로 요청하게 한다
        const end = Date.now() + 8000;
        while (Date.now() < end && (capturedAt[op] || 0) <= before) await new Promise((r) => setTimeout(r, 300));
        if ((capturedAt[op] || 0) > before) {
          attempt--;
          continue;
        }
      }
      if (!res.ok || !json || !json.data) {
        const why = res.status === 404 && !captured[op] ? ` (X 요청 못 봄 · ${diagnose()})` : res.status === 404 ? " (X 서명 헤더를 빌려도 거절됨)" : "";
        throw new EndpointError(`${op} ${res.status}${err ? ": " + err.message : ""}${why}`);
      }
      return json;
    }
    throw new EndpointError("설정값을 맞추지 못했습니다");
  }

  const unwrap = (r) => (r && r.__typename === "TweetWithVisibilityResults" ? r.tweet : r);

  // 응답 구조가 바뀌어도 버티도록 전체를 훑어 글 객체와 다음 페이지 표시를 찾는다.
  // 글 객체 안(인용·재게시 원글)까지는 내려가지 않는다.
  function isTweet(o) {
    if (o.__typename === "Tweet") return true;
    return !o.__typename && !!o.rest_id && !!o.legacy && (o.legacy.full_text != null || !!o.legacy.conversation_id_str);
  }
  function walk(o, out) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      for (const x of o) walk(x, out);
      return;
    }
    if (o.__typename && out.types.size < 20) out.types.add(o.__typename);
    const ct = o.cursorType || o.cursor_type;
    if (ct && /bottom/i.test(ct) && o.value) out.cursor = o.value;
    if (o.__typename === "TweetWithVisibilityResults" && o.tweet) {
      out.tweets.push(o.tweet);
      return;
    }
    if (isTweet(o)) {
      out.tweets.push(o);
      return;
    }
    for (const k in o) walk(o[k], out);
  }

  function toItem(r, kind, me) {
    const l = r && r.legacy;
    if (!l) return null;
    const id = r.rest_id || l.id_str;
    if (!id) return null;
    const note = r.note_tweet && r.note_tweet.note_tweet_results && r.note_tweet.note_tweet_results.result;
    const text = (note && note.text) || l.full_text || l.text || "";
    const d = l.created_at ? new Date(l.created_at) : XC.idToDate(id);
    const date = d && !isNaN(d) ? d.toISOString() : null;
    const media = XC.mediaOf(l);
    if (kind === "likes") return { id, type: "like", date, text, likes: null, media, src: "api" };
    if (kind === "reposts" && !l.retweeted_status_result) return { id, type: "retweet", rtSource: true, date, text, likes: null, media, src: "api" };
    // 답글 탭에 섞여 나오는 남의 글은 뺀다. 화면에 보이는 내 아이디와 먼저 비교하고, 없으면 계정 번호로 비교한다.
    const u = r.core && r.core.user_results && r.core.user_results.result;
    const handle = u && ((u.core && u.core.screen_name) || (u.legacy && u.legacy.screen_name));
    const myHandle = XC.myHandle && XC.myHandle();
    if (handle && myHandle) {
      if (handle.toLowerCase() !== myHandle) return null;
    } else if (me && l.user_id_str && l.user_id_str !== me) return null;
    const rt = unwrap(l.retweeted_status_result && l.retweeted_status_result.result);
    if (l.retweeted_status_result) {
      const sid = rt && (rt.rest_id || (rt.legacy && rt.legacy.id_str));
      if (!sid) return null;
      return { id: sid, type: "retweet", rtSource: true, date, text: (rt.legacy && rt.legacy.full_text) || text, likes: null, media: XC.mediaOf(rt.legacy), src: "api" };
    }
    const likes = l.favorite_count != null ? Number(l.favorite_count) : null;
    return { id, type: l.in_reply_to_status_id_str ? "reply" : "tweet", date, text, likes, selfLiked: !!l.favorited, media, src: "api" };
  }

  // 테스트용으로 밖에서도 쓸 수 있게 둔다.
  XC.parseTimeline = function (json, kind, me) {
    const out = { tweets: [], cursor: null, types: new Set() };
    walk(json, out);
    const items = out.tweets.map((t) => toItem(t, kind, me)).filter(Boolean);
    return { items, cursor: out.cursor, found: out.tweets.length, types: [...out.types] };
  };

  XC.api = {
    canList: (kind) => !!pickOp(kind),
    // X가 보낸 요청 기록을 다시 받아 온다(확장이 켜지기 전 요청이 있었을 때).
    async refreshCaptured() {
      askHook();
      await new Promise((r) => setTimeout(r, 400));
    },
    // 내 프로필 정보에서 고정한 글 ID를 읽는다. X가 보낸 프로필 요청을 따라 하되 아이디만 내 것으로 바꾼다.
    async pinnedIds() {
      const h = XC.myHandle && XC.myHandle();
      if (!h) return null;
      if (!capturedUrl.UserByScreenName) {
        askHook();
        await new Promise((r) => setTimeout(r, 400));
      }
      const src = capturedUrl.UserByScreenName;
      if (!src) return null;
      const u = new URL(src);
      let v = {};
      try {
        v = JSON.parse(u.searchParams.get("variables") || "{}");
      } catch (e) {}
      v.screen_name = h;
      u.searchParams.set("variables", JSON.stringify(v));
      const res = await fetch(u.href, { credentials: "include", headers: { ...headers(csrf()), ...captured.UserByScreenName, "x-csrf-token": csrf() } });
      if (!res.ok) return null;
      const j = await res.json().catch(() => null);
      const r = j && j.data && j.data.user && j.data.user.result;
      if (!r) return null;
      const ids = (r.pinned_items && r.pinned_items.tweet_ids_str) || (r.legacy && r.legacy.pinned_tweet_ids_str) || [];
      return new Set(ids.map(String));
    },
    async timelinePage(kind, cursor) {
      if (!KIND_OPS[kind] || !KIND_OPS[kind].match.some((re) => Object.keys(captured).some((o) => re.test(o)))) {
        askHook(); // X가 보낸 목록 요청 기록을 다시 받아 온다
        await new Promise((r) => setTimeout(r, 400));
      }
      const op = pickOp(kind);
      if (!op) throw new EndpointError("이 탭은 요청으로 불러올 수 없습니다");
      await XC.discoverQueryIds();
      let variables;
      if (capturedUrl[op]) {
        // X가 보낸 변수를 그대로 쓰고 다음 페이지 표시만 바꾼다.
        try {
          variables = JSON.parse(new URL(capturedUrl[op]).searchParams.get("variables") || "{}");
        } catch (e) {
          variables = {};
        }
        delete variables.cursor;
      }
      if (!variables || !Object.keys(variables).length) {
        if (!cachedUserId) cachedUserId = myUserId() || (await userIdFromHandle());
        if (!cachedUserId) throw new EndpointError("내 계정 번호를 찾지 못했습니다");
        const extra = {
          UserTweets: { withQuickPromoteEligibilityTweetFields: false },
          UserTweetsAndReplies: { withCommunity: true },
          Likes: { withClientEventToken: false, withBirdwatchNotes: false },
        }[op];
        variables = { userId: cachedUserId, count: 20, includePromotedContent: false, withVoice: true, withV2Timeline: true, ...extra };
      }
      if (cursor) variables.cursor = cursor;
      const me = variables.userId || myUserId();
      const json = await gqlGet(op, variables);
      const page = XC.parseTimeline(json, kind, me);
      if (!cursor && !page.items.length) {
        // 첫 페이지부터 글을 못 꺼냈으면 응답 모양이 바뀐 것이다. 끝났다고 보지 않고 스크롤로 넘긴다.
        const keys = json && json.data ? Object.keys(json.data).join(",") : "없음";
        throw new EndpointError(
          `${op} 응답에서 글을 못 꺼냄 · 찾은 글 ${page.found}개 · 다음 페이지 표시 ${page.cursor ? "있음" : "없음"} · data 키: ${keys} · 종류: ${page.types.join(",") || "없음"} · 내 아이디: ${(XC.myHandle && XC.myHandle()) || "모름"}`
        );
      }
      return page;
    },
    async deleteTweet(id) {
      const j = await gql("DeleteTweet", { tweet_id: id, dark_request: false });
      return interpret(j, (x) => x.data && "delete_tweet" in x.data);
    },
    async deleteRetweet(sourceId) {
      const j = await gql("DeleteRetweet", { source_tweet_id: sourceId, dark_request: false });
      return interpret(j, (x) => x.data && ("unretweet" in x.data || "delete_retweet" in x.data));
    },
    async unlike(id, relike) {
      if (relike) {
        // 오래된 마음은 취소 요청만으로 안 지워지는 경우가 있어 한 번 다시 누른다.
        const f = await gql("FavoriteTweet", { tweet_id: id });
        const ferr = f.errors && f.errors[0];
        if (ferr && ferr.code !== 139) {
          const r = interpret(f);
          if (r === "gone") return "gone";
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      const j = await gql("UnfavoriteTweet", { tweet_id: id });
      return interpret(j, (x) => x.data && "unfavorite_tweet" in x.data);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
