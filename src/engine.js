// 삭제 작업을 하나씩 처리하고 진행 상황을 저장한다.
(function (root) {
  const XC = (root.XC = root.XC || {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = chrome.storage.local;

  const REST_EVERY = 150; // 이만큼 처리하면 잠깐 쉰다
  const API_FAIL_LIMIT = 3; // 연속으로 이만큼 실패하면 화면 조작으로 바꾼다

  const listeners = new Set();
  const emit = (ev) => listeners.forEach((fn) => fn(ev));

  let job = null; // { queue, settings, createdAt }
  let prog = null; // { index, done, gone, failed }
  let running = false;
  let paused = false;
  let stopFlag = false;
  let apiBroken = false;
  let apiFails = 0;
  let refreshedIds = false;
  let feeder = null; // 바로 실행: 대기열이 비면 페이지를 내려가며 다음 대상을 가져오는 함수

  const snapshot = () => ({
    total: job ? job.queue.length : 0,
    index: prog ? prog.index : 0,
    done: prog ? prog.done : 0,
    gone: prog ? prog.gone : 0,
    failed: prog ? prog.failed.length : 0,
    running,
    paused,
    apiBroken,
    stream: !!(job && job.stream),
  });

  const slim = (it) => ({
    id: it.id,
    type: it.type,
    date: it.date,
    likes: it.likes,
    rtSource: !!it.rtSource,
    text: (it.text || "").slice(0, 200),
  });

  async function saveProg() {
    await store.set({ xc_prog: prog });
  }

  async function act(item) {
    const s = job.settings;
    const useApi = s.mode !== "dom" && !apiBroken;
    if (useApi) {
      try {
        const r = await viaApi(item, s);
        apiFails = 0;
        return r;
      } catch (e) {
        if (e instanceof XC.RateLimitError || e instanceof XC.AuthError) throw e;
        if (e instanceof XC.EndpointError) {
          apiFails++;
          if (!refreshedIds) {
            refreshedIds = true;
            await XC.discoverQueryIds(true);
            try {
              const r = await viaApi(item, s);
              apiFails = 0;
              return r;
            } catch (e2) {
              if (e2 instanceof XC.RateLimitError || e2 instanceof XC.AuthError) throw e2;
            }
          }
          if (job.stream) {
            // 바로 실행 중에 화면 조작으로 넘어가면 글 페이지로 이동해 버려 내려가던 자리를 잃는다.
            if (apiFails >= API_FAIL_LIMIT) {
              throw new XC.AuthError("내부 요청이 계속 실패해 바로 실행을 멈춥니다. 미리보기로 모은 뒤 '화면 조작만' 방식으로 해 보세요.");
            }
            throw e;
          }
          if (apiFails >= API_FAIL_LIMIT && !apiBroken) {
            apiBroken = true;
            emit({ type: "log", text: "내부 요청이 계속 실패해 화면 조작으로 바꿉니다." });
          }
          emit({ type: "log", text: `${item.id}: 내부 요청 실패(${e.message}), 화면 조작으로 시도` });
        } else {
          throw e;
        }
      }
    }
    return viaDom(item, s);
  }

  function viaApi(item, s) {
    if (item.type === "like") return XC.api.unlike(item.id, s.relike);
    if (item.type === "retweet" && item.rtSource) return XC.api.deleteRetweet(item.id);
    return XC.api.deleteTweet(item.id);
  }

  function viaDom(item, s) {
    if (item.type === "like") return XC.dom.unlike(item.id, s.relike);
    if (item.type === "retweet") return XC.dom.unretweet(item.id);
    return XC.dom.deleteTweet(item.id);
  }

  async function loop() {
    running = true;
    stopFlag = false;
    paused = false;
    emit({ type: "state", state: snapshot() });
    if (job.settings.mode !== "dom") await XC.discoverQueryIds();

    let sinceRest = 0;
    let exhausted = false;
    while (true) {
      if (stopFlag) break;
      if (paused) {
        await sleep(300);
        continue;
      }
      if (prog.index >= job.queue.length) {
        if (!feeder) {
          exhausted = true;
          break;
        }
        let more = null;
        try {
          more = await feeder(() => stopFlag);
        } catch (e) {
          emit({ type: "log", text: `다음 대상을 불러오지 못해 멈춥니다: ${e.message}` });
          break;
        }
        if (stopFlag) break;
        if (!more || !more.length) {
          exhausted = true;
          break;
        }
        job.queue.push(...more.map(slim));
        await store.set({ xc_job: job });
        emit({ type: "state", state: snapshot() });
        continue;
      }
      const item = job.queue[prog.index];
      try {
        const r = await act(item);
        if (r === "gone") prog.gone++;
        else prog.done++;
        prog.index++;
      } catch (e) {
        if (e instanceof XC.RateLimitError) {
          const until = e.resetAt + 5000;
          const hhmm = new Date(until).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
          emit({ type: "status", text: `요청 제한: ${hhmm}에 다시 시작합니다.` });
          emit({ type: "log", text: `요청 제한, ${hhmm}까지 대기` });
          while (Date.now() < until && !stopFlag) await sleep(1000);
          emit({ type: "status", text: "" });
          continue; // 같은 항목을 다시 시도
        }
        if (e instanceof XC.AuthError) {
          emit({ type: "log", text: e.message });
          emit({ type: "status", text: e.message });
          await saveProg();
          break;
        }
        prog.failed.push({ id: item.id, type: item.type, reason: e.message });
        prog.index++;
        emit({ type: "log", text: `${XC.TYPE_LABEL[item.type]} ${item.id} 실패: ${e.message}` });
      }
      await saveProg();
      emit({ type: "state", state: snapshot() });

      sinceRest++;
      if (stopFlag) break;
      if (prog.index >= job.queue.length && !feeder) continue;
      if (sinceRest >= REST_EVERY) {
        sinceRest = 0;
        const rest = 45000 + Math.random() * 45000;
        emit({ type: "status", text: `잠시 쉬는 중 (${Math.round(rest / 1000)}초)` });
        const end = Date.now() + rest;
        while (Date.now() < end && !stopFlag) await sleep(500);
        emit({ type: "status", text: "" });
      } else {
        const { minDelay, maxDelay } = job.settings;
        const ms = (minDelay + Math.random() * Math.max(0, maxDelay - minDelay)) * 1000;
        const end = Date.now() + ms;
        while (Date.now() < end && !stopFlag) await sleep(200);
      }
    }
    running = false;
    feeder = null;
    const finished = exhausted && prog.index >= job.queue.length;
    emit({ type: "state", state: snapshot() });
    emit({ type: finished ? "finished" : "stopped", state: snapshot() });
  }

  XC.engine = {
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot,
    isRunning: () => running,
    currentType: () => (job && prog && job.queue[prog.index] ? job.queue[prog.index].type : null),
    failedItems() {
      if (!job || !prog) return [];
      const byKey = new Map(job.queue.map((it) => [it.type + it.id, it]));
      return prog.failed.map((f) => ({ ...(byKey.get(f.type + f.id) || f), reason: f.reason }));
    },
    async loadSaved() {
      const { xc_job, xc_prog } = await store.get(["xc_job", "xc_prog"]);
      if (!xc_job || !xc_prog) return null;
      job = xc_job;
      prog = xc_prog;
      return snapshot();
    },
    // feed를 넘기면 바로 실행: 대기열이 빌 때마다 feed로 다음 대상을 가져온다.
    async start(queue, settings, feed) {
      if (running) return;
      feeder = feed || null;
      job = {
        queue: queue.map(slim),
        settings,
        stream: !!feed,
        createdAt: Date.now(),
      };
      prog = { index: 0, done: 0, gone: 0, failed: [] };
      apiBroken = settings.mode === "dom";
      apiFails = 0;
      refreshedIds = false;
      await store.set({ xc_job: job, xc_prog: prog });
      loop();
    },
    async resume(settings) {
      if (running || !job) return;
      if (settings) job.settings = { ...job.settings, ...settings };
      if (job.stream) job.settings.mode = "auto";
      feeder = null; // 이어하기는 이미 찾아 둔 대상까지만 처리한다
      apiBroken = job.settings.mode === "dom";
      apiFails = 0;
      refreshedIds = false;
      await store.set({ xc_job: job });
      loop();
    },
    async retryFailed() {
      if (running || !job || !prog.failed.length) return;
      const items = this.failedItems();
      await this.start(items, job.settings);
    },
    pause() {
      paused = true;
      emit({ type: "state", state: snapshot() });
    },
    cont() {
      paused = false;
      emit({ type: "state", state: snapshot() });
    },
    stop() {
      stopFlag = true;
      paused = false;
    },
    async discard() {
      if (running) return;
      job = null;
      prog = null;
      await store.remove(["xc_job", "xc_prog"]);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
