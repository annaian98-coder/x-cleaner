// x.com 위에 뜨는 정리 패널. 화면 네 장: 첫 화면(메뉴) · 기본 정리 · 아카이브 정리 · 진행.
(function () {
  const XC = window.XC;
  if (window.__xcPanelLoaded) return;
  window.__xcPanelLoaded = true;

  const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- 아이콘 (Phosphor regular) ----------
  const P = {
    x: "M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z",
    left: "M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z",
    right: "M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z",
    down: "M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z",
    broom: "M235.5,216.81c-22.56-11-35.5-34.58-35.5-64.8V134.73a15.94,15.94,0,0,0-10.09-14.87L165,110a8,8,0,0,1-4.48-10.34l21.32-53a28,28,0,0,0-16.1-37,28.14,28.14,0,0,0-35.82,16,.61.61,0,0,0,0,.12L108.9,79a8,8,0,0,1-10.37,4.49L73.11,73.14A15.89,15.89,0,0,0,55.74,76.8C34.68,98.45,24,123.75,24,152a111.45,111.45,0,0,0,31.18,77.53A8,8,0,0,0,61,232H232a8,8,0,0,0,3.5-15.19ZM67.14,88l25.41,10.3a24,24,0,0,0,31.23-13.45l21-53c2.56-6.11,9.47-9.27,15.43-7a12,12,0,0,1,6.88,15.92L145.69,93.76a24,24,0,0,0,13.43,31.14L184,134.73V152c0,.33,0,.66,0,1L55.77,101.71A108.84,108.84,0,0,1,67.14,88Zm48,128a87.53,87.53,0,0,1-24.34-42,8,8,0,0,0-15.49,4,105.16,105.16,0,0,0,18.36,38H64.44A95.54,95.54,0,0,1,40,152a85.9,85.9,0,0,1,7.73-36.29l137.8,55.12c3,18,10.56,33.48,21.89,45.16Z",
    archive: "M224,48H32A16,16,0,0,0,16,64V88a16,16,0,0,0,16,16v88a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V104a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48ZM208,192H48V104H208ZM224,88H32V64H224V88ZM96,136a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,136Z",
    file: "M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-42.34-77.66a8,8,0,0,1-11.32,11.32L136,139.31V184a8,8,0,0,1-16,0V139.31l-10.34,10.35a8,8,0,0,1-11.32-11.32l24-24a8,8,0,0,1,11.32,0Z",
  };
  const icon = (name, size = 20) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="${P[name]}"/></svg>`;

  const KIND_LABEL = { posts: "게시물", replies: "답글", reposts: "재게시", photos: "사진", videos: "동영상", likes: "마음" };
  const TARGETS = [
    ["posts", "게시물", ""],
    ["replies", "답글", "/with_replies"],
    ["reposts", "재게시", "/reposts"],
    ["photos", "사진", "/media?filter=photo"],
    ["videos", "동영상", "/media"],
    ["likes", "마음", "/i/history/likes"],
  ];

  // ---------- 상태 ----------
  let host = null;
  let $ = null;
  let $$ = () => [];
  let screen = "home"; // home | work | run
  let mode = "page"; // page(기본 정리) | archive(아카이브 정리)
  const itemsBy = { page: [], archive: [] };
  let pageKindAtCollect = null; // 미리보기로 모은 목록이 어느 탭 것인지
  let filtered = [];
  let collecting = false;
  let logLines = [];
  let pinnedSet = null;
  let armed = false;
  let armTimer = null;
  let switchReason = "";
  let instantScanned = 0;
  let runKindFixed = "";
  let lastRunMode = "page";

  const items = () => itemsBy[mode];

  // ---------- 스타일 ----------
  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap {
    --bg: #FFFFFF; --surface: #F5F5F5; --line: #E3E3E3; --text: #0F1419; --muted: #5B6670;
    --accent: #1D7FD1; --accent-soft: #E8F2FB; --danger: #D93838; --danger-soft: #FCEBEB; --ok: #1E8A4C; --warn: #B26A00; --amber-soft: #FBF1DF;
    position: fixed; top: 64px; right: 16px; z-index: 2147483000;
    width: 384px; max-height: calc(100vh - 80px); display: flex; flex-direction: column;
    background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 16px;
    box-shadow: 0 16px 48px rgba(0,0,0,.18);
    font-family: "XC Geist", "Geist", "IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    font-size: 14px; line-height: 20px; word-break: keep-all; overflow-wrap: break-word;
    opacity: 0; transform: translateY(8px);
    transition: opacity 300ms cubic-bezier(0.22,1,0.36,1), transform 500ms cubic-bezier(0.22,1,0.36,1);
  }
  .wrap.show { opacity: 1; transform: none; }
  .wrap[data-theme="dark"] {
    --bg: #181818; --surface: #1F1F1F; --line: #313131; --text: #E7E9EA; --muted: #9AA3AB;
    --accent: #3A9BEA; --accent-soft: #1F2A35; --danger: #F0595A; --danger-soft: #352222; --ok: #3DBB72; --warn: #E3A13B; --amber-soft: #33291A;
  }
  @media (prefers-reduced-motion: reduce) {
    .wrap { transform: none; }
    .wrap, .wrap * { transition-property: opacity !important; transition-duration: 300ms !important; }
    button:active { transform: none; }
  }
  header.top { display: flex; align-items: center; gap: 8px; padding: 16px 16px 12px; }
  h1 { margin: 0; font-size: 18px; line-height: 28px; font-weight: 700; flex: 1; text-wrap: balance; }
  .body { overflow-y: auto; padding: 0 16px 16px; }
  .screen { display: flex; flex-direction: column; gap: 12px; }
  section { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; display: flex; gap: 8px; align-items: center; text-wrap: balance; }
  h2 .sum { margin-left: auto; font-weight: 400; font-size: 12px; line-height: 16px; color: var(--muted); text-align: right; }
  h2.fold { cursor: pointer; user-select: none; border-radius: 4px; }
  h2.fold .chev { flex: none; color: var(--muted); display: grid; transition: transform 500ms cubic-bezier(0.22,1,0.36,1); }
  h2.fold:not(:has(.sum)) .chev { margin-left: auto; }
  section.collapsed h2.fold .chev { transform: rotate(-90deg); }
  section.collapsed > *:not(h2) { display: none !important; }
  .num { font-family: "XC Geist Mono", "Geist Mono", "IBM Plex Sans KR", ui-monospace, monospace; }
  .hint { color: var(--muted); font-size: 12px; line-height: 16px; margin: 0; text-wrap: pretty; }
  .hint span { display: block; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  label.f { display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 16px; color: var(--muted); }
  input[type="text"], input[type="number"], select, textarea {
    font: inherit; font-size: 14px; color: var(--text); background: var(--bg); border: 1px solid var(--line);
    border-radius: 8px; padding: 8px; width: 100%;
  }
  textarea { resize: vertical; min-height: 64px; }
  input[aria-invalid="true"] { border-color: var(--danger); }
  input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, h2.fold:focus-visible, .li:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .check { display: flex; gap: 8px; align-items: center; font-size: 14px; color: var(--text); cursor: pointer; }
  .check input { width: 16px; height: 16px; accent-color: var(--accent); margin: 0; flex: none; }
  .sub { font-size: 12px; line-height: 16px; color: var(--muted); font-weight: 600; margin: 0; }
  .chips { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .chips .check { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px; justify-content: space-between; }
  .chips .check span:last-child { color: var(--muted); font-size: 12px; }
  button {
    font: inherit; font-size: 14px; font-weight: 600; border-radius: 8px; padding: 8px 12px; cursor: pointer;
    border: 1px solid var(--line); background: var(--bg); color: var(--text);
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    transition: opacity 300ms cubic-bezier(0.22,1,0.36,1), transform 300ms cubic-bezier(0.22,1,0.36,1), background-color 300ms cubic-bezier(0.22,1,0.36,1);
  }
  button:hover { opacity: .85; }
  button:active { transform: scale(0.98); }
  button:disabled { opacity: .4; cursor: not-allowed; transform: none; }
  button.icon { padding: 4px; border: none; background: transparent; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #FFFFFF; }
  button.ghost { background: var(--bg); border-color: var(--accent); color: var(--accent); }
  button.danger { background: var(--danger); border-color: var(--danger); color: #FFFFFF; }
  button.danger.armed { background: var(--danger-soft); color: var(--danger); }
  button.link { border: none; background: transparent; color: var(--accent); padding: 4px; font-size: 12px; line-height: 16px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .actions.one { grid-template-columns: 1fr; }
  .actions button { font-size: 16px; line-height: 24px; padding: 8px 12px; }
  .target button { padding: 8px 4px; }
  .target button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
  /* 첫 화면 */
  .account { display: flex; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--line); border-radius: 12px; }
  .account img { width: 40px; height: 40px; border-radius: 9999px; object-fit: cover; flex: none; }
  .account .who { display: flex; flex-direction: column; min-width: 0; }
  .account .who b { font-size: 16px; line-height: 24px; }
  .account .who span { font-size: 12px; line-height: 16px; color: var(--muted); }
  .menu { width: 100%; justify-content: flex-start; text-align: left; gap: 12px; padding: 12px; border-radius: 12px; }
  .menu .ico { width: 40px; height: 40px; border-radius: 8px; display: grid; place-items: center; flex: none; }
  .menu .ico.blue { background: var(--accent-soft); color: var(--accent); }
  .menu .ico.amber { background: var(--amber-soft); color: var(--warn); }
  .menu .mt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .menu .mt b { font-size: 16px; line-height: 24px; }
  .menu .mt span { font-size: 12px; line-height: 16px; color: var(--muted); font-weight: 400; }
  .menu > svg { color: var(--muted); flex: none; }
  .banner { border: 1px solid var(--accent); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .summary { font-size: 16px; line-height: 24px; font-weight: 600; margin: 0; text-wrap: balance; }
  .msg { font-size: 12px; line-height: 16px; margin: 0; white-space: pre-line; text-wrap: pretty; }
  .msg:empty { display: none; }
  .msg.ok { color: var(--ok); } .msg.err { color: var(--danger); } .msg.warn { color: var(--warn); }
  /* 목록 */
  .listhead { display: flex; align-items: center; gap: 4px; }
  .listhead .summary { flex: 1; }
  .list { display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow-y: auto; overflow-x: hidden; }
  .li { display: grid; grid-template-columns: auto minmax(0, 1fr); min-width: 0; gap: 8px; align-items: start; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px; text-decoration: none; color: var(--text); transition: border-color 300ms cubic-bezier(0.22,1,0.36,1); }
  .li:hover { border-color: var(--accent); }
  .tag { font-size: 12px; line-height: 16px; padding: 2px 4px; border-radius: 4px; background: var(--surface); color: var(--muted); white-space: nowrap; }
  .li .t { word-break: break-all; font-size: 12px; line-height: 16px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .li .d { font-size: 12px; line-height: 16px; color: var(--muted); }
  .empty { color: var(--muted); font-size: 12px; text-align: center; padding: 16px 8px; margin: 0; }
  /* 진행 */
  .runtop { display: flex; align-items: center; gap: 8px; }
  .pill { flex: none; font-size: 12px; line-height: 16px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; background: var(--accent); color: #FFFFFF; }
  .bar { height: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 9999px; overflow: hidden; }
  .bar i { display: block; height: 100%; width: 100%; background: var(--accent); transform-origin: left; transform: scaleX(0); transition: transform 500ms cubic-bezier(0.22,1,0.36,1); }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; text-align: center; }
  .stats div { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 8px 4px; }
  .stats b { display: block; font-size: 18px; line-height: 28px; }
  .stats small { font-size: 12px; line-height: 16px; color: var(--muted); }
  .log { font-family: "XC Geist Mono", "Geist Mono", "IBM Plex Sans KR", ui-monospace, monospace; font-size: 12px; line-height: 16px; color: var(--muted); max-height: 160px; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 8px; white-space: pre-wrap; margin: 0; }
  .log:empty { display: none; }
  [hidden] { display: none !important; }
  `;

  const CHEV = `<span class="chev">${icon("down", 16)}</span>`;
  const fold = (title, extra = "") =>
    `<h2 class="fold" role="button" tabindex="0" aria-expanded="false">${title}${extra}${CHEV}</h2>`;

  const HTML = `
  <div class="wrap" role="dialog" aria-label="트위터 청소기">
    <header class="top">
      <button class="icon" id="back" aria-label="뒤로" hidden>${icon("left")}</button>
      <h1 id="title">트위터 청소기</h1>
      <button class="icon" id="close" aria-label="닫기">${icon("x")}</button>
    </header>
    <div class="body">

      <div class="screen" id="scrHome">
        <div class="account" id="account">
          <img id="avatar" alt="" hidden>
          <div class="who"><b id="acctHandle">로그인한 계정을 찾는 중</b><span id="acctSub">x.com에 로그인한 계정으로 정리합니다</span></div>
        </div>
        <div class="banner" id="resume" hidden>
          <p class="summary" id="resumeText"></p>
          <div class="row">
            <button class="primary" id="resumeBtn">이어하기</button>
            <button id="resumeFailCsv">실패 CSV</button>
            <button id="resumeDiscard">기록 지우기</button>
          </div>
        </div>
        <button class="menu" id="goPage">
          <span class="ico blue">${icon("broom", 24)}</span>
          <span class="mt"><b>기본 정리</b><span>지금 보는 탭에서 골라 지웁니다 · <span style="white-space:nowrap">최근 약 3,200개</span></span></span>
          ${icon("right", 16)}
        </button>
        <button class="menu" id="goArchive">
          <span class="ico amber">${icon("archive", 24)}</span>
          <span class="mt"><b>아카이브 정리</b><span>데이터 아카이브 파일로 오래된 글까지 지웁니다</span></span>
          ${icon("right", 16)}
        </button>
      </div>

      <div class="screen" id="scrWork" hidden>
        <section id="secTarget">
          <h2>무엇을 지울까요?</h2>
          <div class="grid3 target" role="group" aria-label="지울 곳">
            ${TARGETS.map(([k, label]) => `<button data-target="${k}" aria-pressed="false">${label}</button>`).join("")}
          </div>
        </section>

        <section id="secFile" hidden>
          <h2>아카이브 파일</h2>
          <p class="hint"><span>X 설정의 데이터 아카이브 다운로드로 받은 zip을 풉니다.</span><span>data 폴더의 tweets.js와 like.js를 고르세요.</span></p>
          <button class="primary" id="pick">${icon("file", 16)}파일 선택</button>
          <input type="file" id="file" accept=".js" multiple hidden>
          <div class="chips" id="typeBox" hidden>
            <label class="check"><span><input type="checkbox" data-type="tweet" checked> 게시물</span><span class="num" data-count="tweet">0</span></label>
            <label class="check"><span><input type="checkbox" data-type="reply" checked> 답글</span><span class="num" data-count="reply">0</span></label>
            <label class="check"><span><input type="checkbox" data-type="retweet" checked> 재게시</span><span class="num" data-count="retweet">0</span></label>
            <label class="check"><span><input type="checkbox" data-type="like" checked> 마음</span><span class="num" data-count="like">0</span></label>
          </div>
        </section>

        <section id="secCond" class="collapsed">
          ${fold("조건", `<span class="sum" id="condSum"></span>`)}
          <div class="grid2">
            <label class="f">이 날부터<input type="text" id="from" class="num" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="2024-01-01"></label>
            <label class="f">이 날까지<input type="text" id="to" class="num" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="20241231"></label>
          </div>
          <p class="msg err" id="dateMsg" hidden></p>
          <label class="f">이 단어가 있는 글만 (쉼표로 구분)<input type="text" id="include" placeholder="예: 시험, 과제"></label>
          <p class="sub">남길 글</p>
          <div class="grid2">
            <label class="check"><input type="checkbox" id="keepPinned"> 메인트윗</label>
            <label class="check"><input type="checkbox" id="keepSelfLiked"> 내가 마음 누른 글</label>
            <label class="check"><input type="checkbox" id="keepPhoto"> 사진 있는 글</label>
            <label class="check"><input type="checkbox" id="keepVideo"> 동영상 있는 글</label>
          </div>
          <p class="msg" id="pinnedMsg" hidden></p>
          <label class="f">이 단어가 있는 글<input type="text" id="exclude" placeholder="예: 공지, 고정"></label>
          <label class="f">마음 이만큼 이상 받은 글<input type="number" id="keepLikes" min="0" placeholder="비우면 적용 안 함"></label>
          <label class="f">특정 글 (주소 또는 ID, 여러 개 가능)<textarea id="keepIds" placeholder="https://x.com/아이디/status/1234567890"></textarea></label>
          <p class="hint">마음은 원글이 올라온 날 기준입니다.</p>
        </section>

        <section id="secList" hidden>
          <div class="listhead">
            <p class="summary" id="previewSummary"></p>
            <button class="link" id="exportCsv">CSV 저장</button>
            <button class="link" id="clearItems">비우기</button>
          </div>
          <p class="hint" id="previewNote"></p>
          <div class="list" id="previewList"></div>
        </section>

        <p class="msg" id="msg"></p>
        <div class="actions" id="actions">
          <button class="ghost" id="collect">미리보기</button>
          <button class="danger" id="start">바로 지우기</button>
        </div>

        <section id="secAdv" class="collapsed">
          ${fold("고급 설정")}
          <div class="grid2">
            <label class="f">최소 간격(초)<input type="number" id="minDelay" min="0.5" step="0.5" value="2"></label>
            <label class="f">최대 간격(초)<input type="number" id="maxDelay" min="1" step="0.5" value="5"></label>
          </div>
          <label class="f">삭제 방식
            <select id="mode">
              <option value="auto">자동</option>
              <option value="dom">화면 조작 (느림)</option>
            </select>
          </label>
          <label class="check" id="relikeRow" hidden><input type="checkbox" id="relike"> 안 지워지는 마음은 다시 눌렀다 취소</label>
        </section>
      </div>

      <div class="screen" id="scrRun" hidden>
        <div class="runtop">
          <span class="pill" id="runKind" hidden></span>
          <p class="summary" id="runTitle">정리 중</p>
        </div>
        <p class="msg" id="runInfo"></p>
        <div class="bar" id="barBox"><i id="bar"></i></div>
        <div class="stats">
          <div><b class="num" id="sDone">0</b><small>지움</small></div>
          <div><b class="num" id="sGone">0</b><small>이미 없음</small></div>
          <div><b class="num" id="sFail">0</b><small>실패</small></div>
          <div><b class="num" id="sLeft">0</b><small>대기</small></div>
        </div>
        <p class="msg warn" id="runStatus"></p>
        <div class="row" id="runBtns">
          <button id="pause">일시정지</button>
          <button id="stop">중지</button>
        </div>
        <div class="row" id="doneBtns" hidden>
          <button class="primary" id="backToWork">돌아가기</button>
          <button id="failCsv" hidden>실패 CSV</button>
          <button id="retry" hidden>실패 재시도</button>
        </div>
        <pre class="log" id="log"></pre>
      </div>

    </div>
  </div>`;

  // ---------- 공통 도우미 ----------
  function detectTheme() {
    const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (!c) return "light";
    const [r, g, b] = c.map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? "dark" : "light";
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  };

  function setMsg(text, kind) {
    hintShown = "";
    for (const id of screen === "run" ? ["#msg", "#runInfo"] : ["#msg"]) {
      const el = $(id);
      el.textContent = text || "";
      el.className = "msg " + (kind || "");
    }
  }

  // 안내용 문구는 다른 메시지가 없을 때만 바꾼다.
  let hintShown = "";
  function setHint(text) {
    const el = $("#msg");
    if (el.textContent && el.textContent !== hintShown) return;
    hintShown = text;
    el.textContent = text;
    el.className = "msg";
  }

  function log(text) {
    const t = new Date().toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    logLines.push(`${t} ${text}`);
    if (logLines.length > 80) logLines = logLines.slice(-80);
    const el = $("#log");
    el.textContent = logLines.join("\n");
    el.scrollTop = el.scrollHeight;
  }

  function setFold(sel, collapsed) {
    const sec = $(sel);
    sec.classList.toggle("collapsed", collapsed);
    const h = sec.querySelector("h2.fold");
    if (h) h.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  // ---------- 화면 전환 ----------
  function showScreen(name) {
    screen = name;
    $("#scrHome").hidden = name !== "home";
    $("#scrWork").hidden = name !== "work";
    $("#scrRun").hidden = name !== "run";
    $("#back").hidden = name !== "work";
    $("#title").textContent = name === "work" ? (mode === "archive" ? "아카이브 정리" : "기본 정리") : "트위터 청소기";
    if (name === "home") renderHome();
    if (name === "work") {
      $("#secTarget").hidden = mode !== "page";
      $("#secFile").hidden = mode !== "archive";
      setMsg("");
      refresh();
    }
    $(".body").scrollTop = 0;
  }

  function renderHome() {
    const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    const h = XC.myHandle();
    $("#acctHandle").textContent = h ? "@" + h : "로그인한 계정을 찾지 못했습니다";
    $("#acctSub").textContent = h ? "이 계정의 글을 정리합니다" : "x.com에 로그인한 뒤 페이지를 새로고침하세요";
    const img = link && link.querySelector("img");
    if (img && img.src) {
      $("#avatar").src = img.src;
      $("#avatar").hidden = false;
    }
    showResumeBanner();
  }

  // ---------- 날짜 ----------
  // 2024-01-01, 20240101, 2024.1.1, 2024/01/01 을 받는다. 빈칸이면 "", 잘못된 날짜면 null.
  function normDate(v) {
    v = String(v || "").trim();
    if (!v) return "";
    const m = v.match(/^(\d{4})(\d{2})(\d{2})$/) || v.match(/^(\d{4})[-./ ](\d{1,2})[-./ ](\d{1,2})\.?$/);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(y, mo - 1, d);
    if (y < 2006 || dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function dateError() {
    const f = normDate($("#from").value);
    const t = normDate($("#to").value);
    if (f === null || t === null) return "날짜는 2024-01-01 또는 20240101처럼 입력하세요.";
    if (f && t && f > t) return "시작 날짜가 끝 날짜보다 늦습니다.";
    return "";
  }

  // ---------- 조건 ----------
  function readFilters() {
    return {
      types: mode === "archive" ? XC.TYPES.filter((t) => $(`input[data-type="${t}"]`).checked) : XC.TYPES,
      from: normDate($("#from").value) || "",
      to: normDate($("#to").value) || "",
      include: $("#include").value,
      exclude: $("#exclude").value,
      keepMinLikes: $("#keepLikes").value,
      keepIds: $("#keepIds").value,
      keepPinned: $("#keepPinned").checked,
      pinnedIds: pinnedSet,
      keepSelfLiked: $("#keepSelfLiked").checked,
      keepPhoto: $("#keepPhoto").checked,
      keepVideo: $("#keepVideo").checked,
    };
  }

  // 접힌 조건 칸에 보일 요약
  function condSummary() {
    const f = readFilters();
    const parts = [];
    if (f.from || f.to) parts.push(`${f.from || "처음"} ~ ${f.to || "지금"}`);
    if (XC.splitKeywords(f.include).length) parts.push("단어 포함 글만");
    const keep = [];
    if (f.keepPinned) keep.push("메인트윗");
    if (f.keepSelfLiked) keep.push("내 마음");
    if (f.keepPhoto) keep.push("사진");
    if (f.keepVideo) keep.push("동영상");
    if (XC.splitKeywords(f.exclude).length) keep.push("단어");
    if (f.keepMinLikes !== "") keep.push(`마음 ${f.keepMinLikes}+`);
    const ids = XC.parseIds(f.keepIds).size;
    if (ids) keep.push(`글 ${ids}개`);
    if (keep.length) parts.push(keep.join("·") + " 남김");
    return parts.length ? parts.join(" / ") : "조건 없음 · 전부 지움";
  }

  function updateRelike() {
    const show = mode === "archive" ? itemsBy.archive.some((it) => it.type === "like") : XC.pageKind() === "likes";
    $("#relikeRow").hidden = !show;
    if (!show) $("#relike").checked = false;
  }

  async function loadPinned() {
    const el = $("#pinnedMsg");
    el.hidden = false;
    el.className = "msg";
    el.textContent = "메인트윗 확인 중…";
    try {
      pinnedSet = await XC.api.pinnedIds();
    } catch (e) {
      pinnedSet = null;
    }
    if (pinnedSet) {
      el.className = "msg ok";
      el.textContent = pinnedSet.size ? `메인트윗 ${fmt(pinnedSet.size)}개는 남깁니다.` : "메인트윗이 없습니다.";
    } else {
      el.className = "msg warn";
      el.textContent = "메인트윗을 확인하지 못했습니다.\n페이지를 새로고침한 뒤 다시 체크하세요.";
    }
    refresh();
    return pinnedSet;
  }

  // ---------- 화면 갱신 ----------
  function refresh() {
    if (!$) return;
    updateRelike();
    $("#condSum").textContent = condSummary();

    // 지울 곳 표시: 지금 열린 페이지와 연동
    const kind = XC.pageKind();
    $$("[data-target]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.target === kind ? "true" : "false"));
    // 다른 탭으로 옮기면 미리보기로 모은 목록은 비운다(다른 탭 글이 섞이지 않게).
    if (mode === "page" && itemsBy.page.length && pageKindAtCollect && kind !== pageKindAtCollect && !collecting) {
      itemsBy.page = [];
      pageKindAtCollect = null;
    }

    // 아카이브 종류 칸
    const all = XC.countByType(itemsBy.archive);
    for (const t of XC.TYPES) $(`[data-count="${t}"]`).textContent = fmt(all[t]);
    $("#typeBox").hidden = !itemsBy.archive.length;

    filtered = XC.filterItems(items(), readFilters());
    renderList();
    updateActions();
  }

  function renderList() {
    const list = items();
    $("#secList").hidden = !list.length;
    if (!list.length) return;
    const c = XC.countByType(filtered);
    $("#previewSummary").textContent = `지울 글 ${fmt(filtered.length)}개`;
    let note = XC.TYPES.filter((t) => c[t]).map((t) => `${XC.TYPE_LABEL[t]} ${fmt(c[t])}`).join(" · ");
    if (filtered.stats.noDate) note += `${note ? " / " : ""}날짜를 몰라 뺀 글 ${fmt(filtered.stats.noDate)}개`;
    if (list.length > filtered.length) note += `${note ? " / " : ""}조건으로 남기는 글 ${fmt(list.length - filtered.length)}개`;
    $("#previewNote").textContent = note;
    $("#exportCsv").disabled = !filtered.length;
    const box = $("#previewList");
    if (!filtered.length) {
      box.innerHTML = `<p class="empty">조건에 맞는 글이 없습니다.</p>`;
      return;
    }
    const shown = filtered.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 40);
    box.innerHTML =
      shown
        .map(
          (it) => `<a class="li" href="${XC.statusUrl(it.id)}" target="_blank" rel="noopener">
            <span class="tag">${XC.TYPE_LABEL[it.type]}</span>
            <span><span class="t">${esc(it.text) || "(내용 없음)"}</span><span class="d num">${it.date ? esc(it.date.slice(0, 10)) : "날짜 모름"}${it.likes != null ? ` · 마음 ${fmt(it.likes)}` : ""}</span></span>
          </a>`
        )
        .join("") + (filtered.length > 40 ? `<p class="empty">외 ${fmt(filtered.length - 40)}개<br>전체는 CSV로 확인하세요.</p>` : "");
  }

  // 실행 버튼: 기본 정리는 [미리보기][바로 지우기] → 모은 뒤 [다시 모으기][N개 지우기], 아카이브는 [N개 지우기]
  function updateActions() {
    const running = XC.engine.isRunning();
    const dErr = dateError();
    const active = host && host.shadowRoot && host.shadowRoot.activeElement;
    const typing = ["#from", "#to"].some((sel) => active === $(sel) && $(sel).value.trim().length < 8);
    $("#dateMsg").hidden = !dErr || typing;
    $("#dateMsg").textContent = dErr;
    $("#from").setAttribute("aria-invalid", normDate($("#from").value) === null ? "true" : "false");
    $("#to").setAttribute("aria-invalid", normDate($("#to").value) === null ? "true" : "false");
    if (dErr && !typing) setFold("#secCond", false);

    const collect = $("#collect");
    const start = $("#start");
    const hasList = items().length > 0;
    const onPage = !!XC.pageKind();

    if (mode === "archive") {
      collect.hidden = true;
      $("#actions").classList.add("one");
      start.disabled = running || !!dErr || !filtered.length;
      if (!armed) start.textContent = filtered.length ? `${fmt(filtered.length)}개 지우기` : "지우기";
      if (!hasList) setHint("파일을 고르면 지울 글 목록이 나옵니다.");
      return;
    }

    collect.hidden = false;
    $("#actions").classList.remove("one");
    collect.textContent = collecting ? "모으기 멈추기" : hasList ? "다시 모으기" : "미리보기";
    collect.disabled = running || (!onPage && !collecting);
    start.disabled = running || collecting || !!dErr || !onPage || (hasList && !filtered.length);
    if (!armed) start.textContent = hasList ? (filtered.length ? `${fmt(filtered.length)}개 지우기` : "지우기") : "바로 지우기";
    if (!onPage && !collecting) setHint("위에서 지울 곳을 고르세요.");
    else if (!collecting) setHint("");
  }

  // ---------- 두 번 누르기 확인 ----------
  function disarm() {
    armed = false;
    clearTimeout(armTimer);
    if (!$) return;
    $("#start").classList.remove("armed");
    updateActions();
  }
  function onStartClick() {
    if (!armed) {
      armed = true;
      const btn = $("#start");
      btn.classList.add("armed");
      btn.textContent = "한 번 더 누르면 시작";
      clearTimeout(armTimer);
      armTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    onStart();
  }

  function readSettings() {
    const min = Math.max(0.5, Number($("#minDelay").value) || 2);
    const max = Math.max(min, Number($("#maxDelay").value) || 5);
    return { mode: $("#mode").value, minDelay: min, maxDelay: max, relike: $("#relike").checked };
  }

  // ---------- 실행 ----------
  async function onStart() {
    if (XC.engine.isRunning() || collecting) return;
    if ($("#keepPinned").checked && !pinnedSet && !(await loadPinned())) {
      setMsg("메인트윗을 확인하지 못해 시작하지 않았습니다.", "warn");
      setFold("#secCond", false);
      return;
    }
    filtered = XC.filterItems(items(), readFilters());
    if (items().length) return startQueue(filtered);
    return startInstant();
  }

  async function startQueue(list) {
    if (!list.length) return;
    lastRunMode = mode;
    runKindFixed = "";
    enterRun();
    log(`${fmt(list.length)}개 정리를 시작합니다.`);
    await XC.engine.start(list, readSettings());
  }

  const modeLabel = (col) => (col.mode === "api" ? "요청" : switchReason ? `스크롤, 요청 실패: ${switchReason}` : "스크롤");

  function makeCollector() {
    return XC.makeCollector(XC.pageKind(), {
      onStatus: (t) => t && setMsg(t, "warn"),
      onSwitch: (e) => {
        console.warn("[트위터 청소기] 요청으로 불러오기 실패, 스크롤로 전환:", e);
        switchReason = e.message;
        log(`요청으로 불러오기 실패(${e.message}). 스크롤로 바꿉니다. 화면을 건드리지 마세요.`);
      },
    });
  }

  async function startInstant() {
    const kind = XC.pageKind();
    if (!kind) return setMsg("위에서 지울 곳을 고르세요.", "warn");
    const filters = { ...readFilters(), types: XC.TYPES };
    instantScanned = 0;
    switchReason = "";
    const col = makeCollector();
    const feed = async (shouldStop) => {
      let batch;
      while ((batch = await col.next(shouldStop))) {
        instantScanned += batch.length;
        setMsg(`살펴본 글 ${fmt(instantScanned)}개 (${modeLabel(col)})`);
        const matched = XC.filterItems(batch, filters);
        if (matched.length) return [...matched];
      }
      return null;
    };
    lastRunMode = "page";
    runKindFixed = KIND_LABEL[kind] || "";
    enterRun();
    log("바로 지우기를 시작합니다.");
    await XC.engine.start([], { ...readSettings(), mode: "auto" }, feed);
  }

  async function onCollect() {
    if (collecting) {
      collecting = false;
      return;
    }
    if (XC.engine.isRunning() || !XC.pageKind()) return;
    collecting = true;
    switchReason = "";
    itemsBy.page = [];
    pageKindAtCollect = XC.pageKind();
    disarm();
    setMsg("모으는 중…");
    updateActions();
    const col = makeCollector();
    let failed = null;
    try {
      let batch;
      while ((batch = await col.next(() => !collecting))) {
        if (!batch.length) continue;
        itemsBy.page = XC.mergeItems(itemsBy.page, batch);
        setMsg(`모으는 중: ${fmt(itemsBy.page.length)}개 (${modeLabel(col)})`);
        refresh();
      }
    } catch (e) {
      failed = e;
      console.error("[트위터 청소기] 수집 오류:", e);
    }
    collecting = false;
    window.scrollTo(0, 0);
    if (failed) setMsg(`모으다 오류로 멈췄습니다: ${failed.message}\n지금까지 ${fmt(itemsBy.page.length)}개를 모았습니다.`, "err");
    else setMsg(`${fmt(itemsBy.page.length)}개를 모았습니다.\n목록을 확인하고 지우기를 누르세요.`, itemsBy.page.length ? "ok" : "warn");
    refresh();
  }

  async function onFiles(files) {
    let added = 0;
    const errs = [];
    const skipped = [];
    setMsg("파일을 읽는 중…");
    for (const f of files) {
      try {
        const got = XC.archiveToItems(XC.parseArchiveText(await f.text()));
        if (!got) {
          skipped.push(f.name);
          continue;
        }
        const before = itemsBy.archive.length;
        itemsBy.archive = XC.mergeItems(itemsBy.archive, got);
        added += itemsBy.archive.length - before;
      } catch (e) {
        errs.push(`${f.name}: ${e.message}`);
      }
    }
    if (errs.length) setMsg(`읽지 못한 파일이 있습니다.\n${errs.join("\n")}`, "err");
    else if (!added && skipped.length) setMsg(`${skipped.join(", ")}에는 글이나 마음 기록이 없습니다.\ntweets.js와 like.js를 고르세요.`, "warn");
    else setMsg(`${fmt(added)}개를 불러왔습니다.`, "ok");
    refresh();
  }

  // ---------- 진행 화면 ----------
  function showRunKind(label) {
    $("#runKind").hidden = !label;
    $("#runKind").textContent = label || "";
  }

  function enterRun() {
    logLines = [];
    $("#log").textContent = "";
    showScreen("run");
    $("#runTitle").textContent = "정리 중";
    $("#runInfo").textContent = "";
    $("#runStatus").textContent = "";
    $("#runBtns").hidden = false;
    $("#doneBtns").hidden = true;
    showRunKind(runKindFixed);
  }

  function renderState(s) {
    if (screen !== "run" && s.running) showScreen("run");
    const cur = XC.engine.currentType && XC.engine.currentType();
    if (s.running) showRunKind(runKindFixed || (cur && XC.TYPE_LABEL[cur]) || "");
    $("#barBox").hidden = s.stream; // 바로 지우기는 전체 개수를 미리 알 수 없다
    $("#bar").style.transform = `scaleX(${Math.min(1, s.index / (s.total || 1))})`;
    $("#sDone").textContent = fmt(s.done);
    $("#sGone").textContent = fmt(s.gone);
    $("#sFail").textContent = fmt(s.failed);
    $("#sLeft").textContent = fmt(Math.max(0, s.total - s.index));
    $("#pause").textContent = s.paused ? "계속" : "일시정지";
  }

  function finishRun(state, finished) {
    $("#runTitle").textContent = finished ? "끝났습니다" : "멈췄습니다";
    $("#runBtns").hidden = true;
    $("#doneBtns").hidden = false;
    $("#failCsv").hidden = !state.failed;
    $("#retry").hidden = !state.failed;
    $("#runStatus").textContent = "";
    const left = state.total - state.index;
    let info = `지움 ${fmt(state.done)} · 이미 없음 ${fmt(state.gone)} · 실패 ${fmt(state.failed)}`;
    if (state.stream) info += `\n살펴본 글 ${fmt(instantScanned)}개 중 ${fmt(state.total)}개가 대상이었습니다.`;
    else if (left > 0) info += `\n${fmt(left)}개가 남아 다음에 이어할 수 있습니다.`;
    $("#runInfo").textContent = info;
    $("#runInfo").className = "msg";
    log(finished ? "끝났습니다." : "멈췄습니다.");
  }

  async function showResumeBanner() {
    const s = await XC.engine.loadSaved();
    const box = $("#resume");
    if (!s || XC.engine.isRunning()) {
      box.hidden = true;
      return;
    }
    const left = s.total - s.index;
    box.hidden = false;
    $("#resumeBtn").hidden = left <= 0;
    $("#resumeFailCsv").hidden = !s.failed;
    $("#resumeText").textContent =
      left > 0 ? `지난 작업 ${fmt(s.total)}개 중 ${fmt(left)}개가 남았습니다.` : `지난 작업: 지움 ${fmt(s.done)} · 실패 ${fmt(s.failed)}`;
  }

  // ---------- 글꼴 ----------
  let fontsLoaded = false;
  async function loadFonts() {
    if (fontsLoaded) return;
    fontsLoaded = true;
    const list = [
      ["XC Geist", "geist-latin-400-normal.woff2", "400"],
      ["XC Geist", "geist-latin-600-normal.woff2", "600"],
      ["XC Geist", "geist-latin-700-normal.woff2", "700"],
      ["XC Geist Mono", "geist-mono-latin-400-normal.woff2", "400"],
      ["XC Geist Mono", "geist-mono-latin-700-normal.woff2", "700"],
    ];
    for (const [family, file, weight] of list) {
      try {
        const buf = await (await fetch(chrome.runtime.getURL("fonts/" + file))).arrayBuffer();
        const face = new FontFace(family, buf, { weight, style: "normal" });
        await face.load();
        document.fonts.add(face);
      } catch (e) {
        /* 못 불러오면 시스템 글꼴로 보인다 */
      }
    }
  }

  // ---------- 만들기 ----------
  function build() {
    loadFonts();
    host = document.createElement("div");
    host.id = "xc-cleaner-host";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${CSS}</style>${HTML}`;
    $ = (sel) => shadow.querySelector(sel);
    $$ = (sel) => [...shadow.querySelectorAll(sel)];
    document.documentElement.appendChild(host);

    $(".wrap").dataset.theme = detectTheme();
    requestAnimationFrame(() => $(".wrap").classList.add("show"));

    $("#close").addEventListener("click", hide);
    $("#back").addEventListener("click", () => {
      if (collecting) collecting = false;
      disarm();
      showScreen("home");
    });
    $("#goPage").addEventListener("click", () => {
      mode = "page";
      showScreen("work");
    });
    $("#goArchive").addEventListener("click", () => {
      mode = "archive";
      showScreen("work");
    });

    // 접는 칸
    $$("h2.fold").forEach((h) => {
      const toggle = () => setFold("#" + h.parentElement.id, !h.parentElement.classList.contains("collapsed"));
      h.addEventListener("click", toggle);
      h.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });

    // 지울 곳 고르기: 누르면 그 탭으로 이동한다
    $$("[data-target]").forEach((b) =>
      b.addEventListener("click", () => {
        if (collecting) return;
        const t = TARGETS.find((x) => x[0] === b.dataset.target);
        if (t[0] === "likes") XC.gotoPath(t[2]);
        else {
          const me = XC.myHandle();
          if (!me) return setMsg("로그인한 계정을 찾지 못했습니다. 페이지를 새로고침해 보세요.", "err");
          XC.gotoPath(`/${me}${t[2]}`);
        }
        disarm();
        setMsg("");
        setTimeout(refresh, 300);
      })
    );

    // 아카이브
    $("#pick").addEventListener("click", () => $("#file").click());
    $("#file").addEventListener("change", (e) => {
      onFiles([...e.target.files]);
      e.target.value = "";
    });

    // 조건
    $$("input[data-type], #from, #to, #include, #exclude, #keepLikes, #keepIds, #keepSelfLiked, #keepPhoto, #keepVideo").forEach((el) =>
      el.addEventListener("input", () => {
        disarm();
        refresh();
      })
    );
    ["#from", "#to"].forEach((sel) =>
      $(sel).addEventListener("blur", () => {
        const v = normDate($(sel).value);
        if (v) $(sel).value = v;
        refresh();
      })
    );
    $("#keepPinned").addEventListener("change", () => {
      disarm();
      if ($("#keepPinned").checked) loadPinned();
      else {
        $("#pinnedMsg").hidden = true;
        refresh();
      }
    });

    // 목록
    $("#exportCsv").addEventListener("click", () => download(`트위터청소기_대상_${stamp()}.csv`, XC.toCsv(filtered)));
    $("#clearItems").addEventListener("click", () => {
      itemsBy[mode] = [];
      pageKindAtCollect = null;
      disarm();
      setMsg("");
      refresh();
    });

    // 실행
    $("#collect").addEventListener("click", onCollect);
    $("#start").addEventListener("click", onStartClick);

    // 진행 화면
    $("#pause").addEventListener("click", () => (XC.engine.snapshot().paused ? XC.engine.cont() : XC.engine.pause()));
    $("#stop").addEventListener("click", () => {
      XC.engine.stop();
      log("중지 요청. 지금 항목까지만 처리합니다.");
    });
    const failCsv = () => download(`트위터청소기_실패_${stamp()}.csv`, XC.toCsv(XC.engine.failedItems(), true));
    $("#failCsv").addEventListener("click", failCsv);
    $("#resumeFailCsv").addEventListener("click", failCsv);
    $("#retry").addEventListener("click", () => {
      runKindFixed = "";
      enterRun();
      log("실패 항목을 다시 시도합니다.");
      XC.engine.retryFailed();
    });
    $("#backToWork").addEventListener("click", () => {
      mode = lastRunMode;
      if (mode === "page") itemsBy.page = []; // 지운 뒤에는 다시 모아야 정확하다
      showScreen("work");
    });
    $("#resumeBtn").addEventListener("click", () => {
      runKindFixed = "";
      lastRunMode = "page";
      enterRun();
      log("지난 작업을 이어서 합니다.");
      XC.engine.resume(readSettings());
    });
    $("#resumeDiscard").addEventListener("click", async () => {
      await XC.engine.discard();
      $("#resume").hidden = true;
    });

    XC.engine.on((ev) => {
      if (ev.type === "state") renderState(ev.state);
      else if (ev.type === "log") log(ev.text);
      else if (ev.type === "status") $("#runStatus").textContent = ev.text;
      else if (ev.type === "finished") finishRun(ev.state, true);
      else if (ev.type === "stopped") finishRun(ev.state, false);
    });

    // X 안에서 페이지를 옮기면 지울 곳 표시를 다시 맞춘다.
    let lastLoc = location.pathname + location.search;
    setInterval(() => {
      const now = location.pathname + location.search;
      if (now !== lastLoc) {
        lastLoc = now;
        if (screen === "work") refresh();
      }
    }, 1000);

    showScreen(XC.engine.isRunning() ? "run" : "home");
  }

  function show() {
    if (!host) return build();
    host.style.display = "";
    $(".wrap").dataset.theme = detectTheme();
    requestAnimationFrame(() => $(".wrap").classList.add("show"));
    if (screen === "home") renderHome();
    else if (screen === "work") refresh();
  }

  function hide() {
    if (!host) return;
    $(".wrap").classList.remove("show");
    setTimeout(() => {
      if (!$(".wrap").classList.contains("show")) host.style.display = "none";
    }, 300);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "xc-toggle") {
      if (host && host.style.display !== "none" && $(".wrap").classList.contains("show")) hide();
      else show();
    }
  });

  // 진행 중이던 작업이 있으면 페이지를 열 때 패널을 바로 보여 준다.
  chrome.storage.local.get(["xc_job", "xc_prog"]).then(({ xc_job, xc_prog }) => {
    if (xc_job && xc_prog && xc_prog.index < xc_job.queue.length) show();
  });
})();
