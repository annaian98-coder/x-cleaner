// 툴바 아이콘을 누르면 x.com 탭의 패널을 열고 닫는다.
chrome.action.onClicked.addListener(async (tab) => {
  // 먼저 패널에 신호를 보낸다. x.com 탭이면 이걸로 끝난다.
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "xc-toggle" });
    return;
  } catch (e) {
    // 스크립트가 없는 탭이다.
  }
  const onX = tab.url && /^https:\/\/(x|twitter)\.com\//.test(tab.url);
  if (onX) {
    // 확장을 설치하기 전부터 열려 있던 x.com 탭. 새로고침하면 스크립트가 붙고, 그 뒤 아이콘을 다시 누르면 열린다.
    await chrome.tabs.reload(tab.id);
  } else {
    chrome.tabs.create({ url: "https://x.com/home" });
  }
});

// X 웹 번들에서 내부 요청 ID(queryId)와 필요한 설정값 이름을 찾는다. X가 바꿔도 따라가기 위함.
const OPS = [
  "DeleteTweet", "DeleteRetweet", "FavoriteTweet", "UnfavoriteTweet",
  "UserTweets", "UserTweetsAndReplies", "Likes",
];

const names = (s) => (s.match(/"([^"]+)"/g) || []).map((x) => x.slice(1, -1));

async function scanBundles(urls) {
  const ids = {};
  const meta = {};
  for (const url of urls) {
    if (!/^https:\/\/abs\.twimg\.com\//.test(url)) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const js = await res.text();
      for (const op of OPS) {
        if (ids[op]) continue;
        const full = js.match(
          new RegExp(`queryId:"([\\w-]+)",operationName:"${op}",operationType:"\\w+",metadata:\\{featureSwitches:\\[([^\\]]*)\\],fieldToggles:\\[([^\\]]*)\\]`)
        );
        if (full) {
          ids[op] = full[1];
          meta[op] = { features: names(full[2]), toggles: names(full[3]) };
          continue;
        }
        const a = js.match(new RegExp(`queryId:"([\\w-]+)",operationName:"${op}"`));
        const b = js.match(new RegExp(`operationName:"${op}",[^}]{0,80}?queryId:"([\\w-]+)"`));
        const m = a || b;
        if (m) ids[op] = m[1];
      }
      if (OPS.every((op) => ids[op])) break;
    } catch (e) {
      // 한 파일이 실패해도 나머지를 계속 본다.
    }
  }
  return { ids, meta };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "xc-scan-bundles") {
    scanBundles(msg.urls || []).then(sendResponse);
    return true;
  }
  return false;
});
