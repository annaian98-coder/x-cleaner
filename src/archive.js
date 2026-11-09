// 아카이브 파싱, 필터, CSV. 브라우저와 Node 테스트 양쪽에서 돈다.
(function (root) {
  const XC = (root.XC = root.XC || {});

  const TWITTER_EPOCH = 1288834974657n;
  const SNOWFLAKE_MIN = 30000000000000000n; // 2010년 11월 이전 ID에는 시간이 들어 있지 않다.

  // 글에 붙은 미디어 종류. 움직이는 GIF는 동영상으로 본다. 정보가 없으면 null.
  XC.mediaOf = function (legacy) {
    if (!legacy) return null;
    const list = (legacy.extended_entities && legacy.extended_entities.media) || (legacy.entities && legacy.entities.media) || [];
    const m = { photo: false, video: false };
    for (const x of list) {
      if (x.type === "photo") m.photo = true;
      else if (x.type === "video" || x.type === "animated_gif") m.video = true;
    }
    return m;
  };

  XC.TYPE_LABEL = { tweet: "게시물", reply: "답글", retweet: "재게시", like: "마음" };
  XC.TYPES = ["tweet", "reply", "retweet", "like"];

  XC.idToDate = function (id) {
    try {
      const n = BigInt(id);
      if (n < SNOWFLAKE_MIN) return null;
      return new Date(Number((n >> 22n) + TWITTER_EPOCH));
    } catch (e) {
      return null;
    }
  };

  // "window.YTD.tweets.part0 = [ ... ]" 형식의 파일 하나를 읽는다.
  XC.parseArchiveText = function (text) {
    const eq = text.indexOf("=");
    if (eq < 0) throw new Error("아카이브 형식이 아닙니다");
    const head = text.slice(0, eq);
    const m = head.match(/window\.YTD\.([\w-]+)\.part\d+/);
    if (!m) throw new Error("아카이브 형식이 아닙니다");
    const body = text.slice(eq + 1).trim().replace(/;\s*$/, "");
    return { kind: m[1], data: JSON.parse(body) };
  };

  function tweetToItem(raw) {
    const t = raw.tweet || raw;
    const id = t.id_str || t.id;
    if (!id) return null;
    const text = t.full_text || t.text || "";
    let type = "tweet";
    if (/^RT @/.test(text)) type = "retweet";
    else if (t.in_reply_to_status_id_str || t.in_reply_to_status_id) type = "reply";
    const d = t.created_at ? new Date(t.created_at) : XC.idToDate(id);
    const likes = t.favorite_count != null ? Number(t.favorite_count) : null;
    return {
      id: String(id),
      type,
      date: d && !isNaN(d) ? d.toISOString() : null,
      text,
      likes: Number.isFinite(likes) ? likes : null,
      selfLiked: t.favorited === true || t.favorited === "true",
      media: XC.mediaOf(t),
      src: "archive",
    };
  }

  function likeToItem(raw) {
    const l = raw.like || raw;
    const id = l.tweetId;
    if (!id) return null;
    const d = XC.idToDate(id); // 마음 누른 날이 아니라 원글이 올라온 날
    return {
      id: String(id),
      type: "like",
      date: d ? d.toISOString() : null,
      text: l.fullText || "",
      likes: null,
      src: "archive",
    };
  }

  // 파싱된 파일 하나를 항목 배열로 바꾼다. 관련 없는 파일이면 null.
  XC.archiveToItems = function (parsed) {
    const { kind, data } = parsed;
    if (!Array.isArray(data)) return null;
    if (kind === "tweets" || kind === "tweet") return data.map(tweetToItem).filter(Boolean);
    if (kind === "like") return data.map(likeToItem).filter(Boolean);
    return null;
  };

  XC.itemKey = (it) => `${it.type}:${it.id}`;

  XC.mergeItems = function (base, add) {
    const map = new Map(base.map((it) => [XC.itemKey(it), it]));
    for (const it of add) if (!map.has(XC.itemKey(it))) map.set(XC.itemKey(it), it);
    return [...map.values()];
  };

  XC.splitKeywords = (s) =>
    (s || "")
      .split(/[,\n]/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);

  // "https://x.com/a/status/123/photo/1", "123" 같은 입력에서 글 ID만 뽑는다.
  XC.parseIds = function (s) {
    const ids = new Set();
    for (const tok of (s || "").split(/[\s,]+/)) {
      const m = tok.match(/status(?:es)?\/(\d+)/) || tok.match(/^(\d{6,})$/);
      if (m) ids.add(m[1]);
    }
    return ids;
  };

  // f: { types, from, to, include, exclude, keepMinLikes, keepIds, keepPinned, pinnedIds(Set), keepSelfLiked }
  // from/to는 "YYYY-MM-DD", 둘 다 그 날을 포함한다(사용자 현지 시간 기준).
  XC.filterItems = function (items, f) {
    const types = new Set(f.types || XC.TYPES);
    const from = f.from ? new Date(f.from + "T00:00:00").getTime() : null;
    const to = f.to ? new Date(f.to + "T23:59:59.999").getTime() : null;
    const inc = XC.splitKeywords(f.include);
    const exc = XC.splitKeywords(f.exclude);
    const keepMin = f.keepMinLikes === "" || f.keepMinLikes == null ? null : Number(f.keepMinLikes);
    const keep = XC.parseIds(f.keepIds);
    const stats = { noDate: 0 };
    const out = items.filter((it) => {
      if (!types.has(it.type)) return false;
      if (keep.has(it.id)) return false;
      const mine = it.type === "tweet" || it.type === "reply";
      if (f.keepPinned && mine && f.pinnedIds && f.pinnedIds.has(it.id)) return false; // 고정한 글
      if (f.keepSelfLiked && mine && it.selfLiked) return false; // 내가 마음 누른 내 글
      if (f.keepPhoto && it.media && it.media.photo) return false; // 사진 있는 글
      if (f.keepVideo && it.media && it.media.video) return false; // 동영상 있는 글
      if (from != null || to != null) {
        if (!it.date) {
          stats.noDate++;
          return false; // 날짜를 모르면 지우지 않는다.
        }
        const t = new Date(it.date).getTime();
        if (from != null && t < from) return false;
        if (to != null && t > to) return false;
      }
      const text = (it.text || "").toLowerCase();
      if (inc.length && !inc.some((w) => text.includes(w))) return false;
      if (exc.length && exc.some((w) => text.includes(w))) return false;
      if (keepMin != null && Number.isFinite(keepMin) && it.type !== "like" && it.likes != null && it.likes >= keepMin) return false;
      return true;
    });
    out.stats = stats;
    return out;
  };

  XC.countByType = function (items) {
    const c = { tweet: 0, reply: 0, retweet: 0, like: 0 };
    for (const it of items) c[it.type] = (c[it.type] || 0) + 1;
    return c;
  };

  XC.statusUrl = (id) => `https://x.com/i/status/${id}`;

  XC.toCsv = function (items, extra) {
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cols = ["id", "종류", "날짜", "마음수", "주소", "내용"].concat(extra ? ["사유"] : []);
    const rows = items.map((it) =>
      [it.id, XC.TYPE_LABEL[it.type] || it.type, it.date || "", it.likes ?? "", XC.statusUrl(it.id), it.text]
        .concat(extra ? [it.reason || ""] : [])
        .map(esc)
        .join(",")
    );
    return "﻿" + [cols.join(",")].concat(rows).join("\r\n");
  };
})(typeof window !== "undefined" ? window : globalThis);
