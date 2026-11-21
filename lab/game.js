// Startech Lab — throwaway prototype logic (D-17). Not for reuse.
(() => {
  const C = window.LAB_CONFIG, T = C.tuning, S = window.LAB_CONTENT;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const rid = () => Math.random().toString(36).slice(2, 10);
  const r1 = (x) => Math.round(x * 10) / 10;
  const DEFS = Object.fromEntries(S.systems.map((s) => [s.id, s]));

  // ---- session + A/B variant -------------------------------------------------
  const params = new URLSearchParams(location.search);
  const DEV = params.has("dev");
  let sessionId = store.get("stl_session", null);
  if (!sessionId) { sessionId = "s-" + rid(); store.set("stl_session", sessionId); }
  let variant = (params.get("v") || "").toUpperCase();
  if (!["A", "B"].includes(variant)) variant = store.get("stl_variant", null) || (Math.random() < 0.5 ? "A" : "B");
  store.set("stl_variant", variant);
  const COST = variant === "A" ? "deferred" : "immediate";

  function send(obj) {
    if (!C.submit || DEV) { console.log("[lab] submission (not sent):", obj); return; }
    const body = new URLSearchParams();
    for (const k in obj) if (C.fields[k]) body.append(C.fields[k], String(obj[k]));
    fetch(C.formAction, { method: "POST", mode: "no-cors", body }).catch(() => {});
  }

  // ---- game state ------------------------------------------------------------
  let G = null, timer = null, last = 0, dirty = true;

  function rollShip() {
    const L = () => (Math.random() < 0.55 ? "Q" : "KRXTZ"[Math.floor(Math.random() * 5)]);
    const n = () => Math.floor(10 + Math.random() * 90);
    return { powerModel: `GN-${n()}${L()}`, housingStamp: 1 + Math.floor(Math.random() * 9), lsModel: `SC-${n()}${L()}`, commsModel: `AR-${n()}${L()}` };
  }

  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const DOWNSTREAM = ["life", "comms"];

  function newGame() {
    const unlocks = store.get("stl_unlocks", {});
    G = {
      v: rollShip(), t: 0, o2: T.o2Start, busy: null, over: false,
      selected: "power", tab: "power", log: [], debt: [], debtPaid: 0,
      fuse: null, nextOverload: null, strain: 0, strainMax: 0, trips: 0,
      overloads: { random: 0, wrong: 0, spike: 0 }, gaps: [], firstGap: null, lastFree: 0, desyncs: 0, resyncs: 0, readyAnnounced: false,
      runId: "r-" + rid(), runIndex: store.get("stl_runs", 0) + 1, unlocks, unlocks0: Object.keys(unlocks),
      sys: {}, order: {},
    };
    for (const s of S.systems) {
      G.sys[s.id] = { state: "offline", hist: [], method: null, at: null, act: 0, waste: 0, jams: 0, mv: 0, ms: 0 };
      G.order[s.id] = shuffle(Object.keys(s.actions)); // button order randomized per run, fixed within it
    }
    G.sys.power.mv = 1;
    store.set("stl_runs", G.runIndex);
    msg("You float in through the airlock. It's dark, cold, and smells like old coffee.");
    $("#app").hidden = false; $("#overlay").innerHTML = "";
    $("#buildtag").textContent = C.build + (DEV ? " · DEV" : "");
    last = performance.now(); clearInterval(timer); timer = setInterval(tick, 100);
    render();
  }

  function msg(text) { G.log.unshift(`[${fmt(G.t)}] ${text}`); G.log.length = Math.min(G.log.length, 8); dirty = true; }
  function fmt(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; }
  const calmGenerator = () => G.v.housingStamp === 7; // locked Scotsman note: no random overloads
  const readyToTransmit = () => S.systems.every((s) => G.sys[s.id].state === "online") && G.debt.length === 0;

  // Which buttons a system panel shows right now
  function panelActions(def) {
    const st = G.sys[def.id];
    if (st.state === "jammed") return [{ id: "clearjam", label: "Clear the jam", secs: 5 }];
    if (st.state === "tripped") return def.id === "power"
      ? [{ id: "reset", label: "Reset & re-ramp generator", secs: 6 }]
      : [{ id: "reset", label: "Reset breaker", secs: 3 }];
    if (st.state === "desynced") return [{ id: "resync", label: "Resync power coupling", secs: T.resyncSecs }];
    if (st.state === "online") {
      if (def.id === "power") return G.fuse != null ? [{ id: "trim", label: "Trim load balance", secs: TRIM_SECS }] : [];
      return [{ id: "resync", label: "Resync power coupling", secs: T.resyncSecs }];
    }
    return G.order[def.id].map((id) => ({ id, ...def.actions[id] }));
  }
  const TRIM_SECS = 4;
  const seqTime = (def, seq) => seq.reduce((t, id) => t + def.actions[id].secs, 0);
  // Benchmarks for this ship: perfect by-the-book play, and the Scotsman's optimal mix of book and shortcuts.
  // Both include the one trim forced by Life Support's load spike, plus the final transmit. Random overloads are excluded.
  function benchmarks() {
    let book = 0, scot = 0;
    for (const def of S.systems) {
      const b = seqTime(def, def.book);
      let best = b;
      if (def.shortcutOk(G.v)) {
        const debt = COST === "deferred" ? def.debt.reduce((t, d) => t + d.secs, 0) : 0;
        best = Math.min(b, seqTime(def, def.shortcut) + debt);
      }
      book += b; scot += best;
    }
    const fixed = TRIM_SECS + T.transmitSecs;
    return { book: book + fixed, scot: scot + fixed };
  }
  const transmitAction = { id: "transmit", label: "Transmit Voyage Data Core to Fleet Command", secs: T.transmitSecs };

  function start(sysId, actId) {
    if (G.busy || G.over) return;
    const def = DEFS[sysId], st = G.sys[sysId];
    if (actId === "transmit") {
      if (sysId !== "comms" || !readyToTransmit()) return;
      beginBusy({ sys: sysId, act: actId, label: transmitAction.label, secs: transmitAction.secs, left: transmitAction.secs });
      dirty = true; return;
    }
    const a = panelActions(def).find((x) => x.id === actId);
    if (!a) return;
    const unpowered = def.requires.some((r) => G.sys[r].state !== "online");
    if (unpowered && st.state !== "online") { st.waste++; msg(`${def.name}: no power to this panel. Nothing happens.`); wrongMove(); return; }
    beginBusy({ sys: sysId, act: actId, label: `${def.name}: ${a.label}`, secs: a.secs, left: a.secs });
    dirty = true;
  }

  // Human-overhead measurement: idle time between the engineer becoming free and starting the next action.
  function beginBusy(b) {
    const gap = G.t - G.lastFree;
    if (G.gaps.length === 0 && G.firstGap == null) G.firstGap = r1(gap); // time to first action (reading/orienting), kept separate
    else G.gaps.push(gap);
    G.busy = b;
  }
  function gapStats() {
    const g = [...G.gaps].sort((a, b) => a - b);
    if (!g.length) return { n: 0, first: G.firstGap };
    const avg = g.reduce((t, x) => t + x, 0) / g.length;
    const med = g.length % 2 ? g[(g.length - 1) / 2] : (g[g.length / 2 - 1] + g[g.length / 2]) / 2;
    return { n: g.length, min: Math.round(g[0] * 100) / 100, max: r1(g[g.length - 1]), avg: Math.round(avg * 100) / 100,
             med: Math.round(med * 100) / 100, p10: Math.round(g[Math.floor(g.length * 0.1)] * 100) / 100, first: G.firstGap };
  }

  function startDebt(i) {
    if (G.busy || G.over) return;
    const d = G.debt[i];
    beginBusy({ debt: d.id, label: d.label, secs: d.secs, left: d.secs });
    dirty = true;
  }

  // ---- overloads ---------------------------------------------------------------
  function scheduleNext() { G.nextOverload = G.t + T.overloadMinGap + Math.random() * (T.overloadMaxGap - T.overloadMinGap); }
  // Life Support drawing load after a full failure (first restoration, or breaker reset after a trip). Resync never spikes.
  function loadSpike() { if (G.sys.power.state === "online" && G.fuse == null) startOverload("spike"); }
  function wrongMove() { if (G.sys.power.state === "online" && G.fuse == null && !G.busy) startOverload("wrong"); }
  function startOverload(cause) {
    G.fuse = T.overloadFuseSeconds; G.nextOverload = null; G.overloads[cause]++;
    G.strain++; G.strainMax = Math.max(G.strainMax, G.strain);
    msg({ wrong: "⚠ That spooked the generator. OVERLOAD. Trim it!", spike: "⚠ Life Support is drawing load. Generator OVERLOAD. Trim it!" }[cause] || "⚠ Generator OVERLOAD alarm. Trim it!");
    if (G.strain >= T.strainLimit) {
      const victims = DOWNSTREAM.filter((id) => G.sys[id].state === "online");
      if (victims.length) {
        const v = victims[Math.floor(Math.random() * victims.length)];
        G.sys[v].state = "desynced"; G.desyncs++; G.strain = 0;
        msg(`Too much strain: ${DEFS[v].name} lost sync and dropped offline. Resync its power coupling.`);
      }
    }
  }
  function trip() {
    G.fuse = null; G.nextOverload = null; G.trips++; G.sys.power.state = "tripped";
    DOWNSTREAM.forEach((id) => { if (G.sys[id].state === "online") G.sys[id].state = "tripped"; });
    msg("BANG. The generator tripped and took everything downstream with it.");
  }

  function finish(b) {
    if (b.debt) {
      G.debt = G.debt.filter((d) => d.id !== b.debt); G.debtPaid++;
      msg(`Done: ${b.label}.`); announceReady(); return;
    }
    const def = DEFS[b.sys], st = G.sys[b.sys];
    if (b.act === "transmit") { G.overloadWin = G.fuse != null; msg("Voyage Data Core transmitted. Fleet Command acknowledges."); return end("won"); }
    if (b.act === "clearjam") { st.state = "offline"; msg(`${def.name}: jam cleared. Back to square one.`); return; }
    if (b.act === "reset") {
      if (def.requires.some((r) => G.sys[r].state !== "online")) { msg(`${def.name}: breaker reset, but there's no power.`); return; }
      st.state = "online"; if (def.id === "power") scheduleNext();
      msg(`${def.name}: back online.`); if (def.id === "life") loadSpike(); announceReady(); return;
    }
    if (b.act === "trim") { G.fuse = null; scheduleNext(); msg("Generator load trimmed. The hum settles."); return; }
    if (b.act === "resync") {
      st.state = "online"; G.strain = 0; G.resyncs++;
      msg(`${def.name}: power coupling resynced. Strain cleared.`); announceReady(); return;
    }

    st.act++;
    const h = [...st.hist, b.act];
    const prefix = (seq) => h.length <= seq.length && h.every((x, i) => x === seq[i]);
    const pb = prefix(def.book), ps = prefix(def.shortcut);
    if (!pb && !ps) { st.waste++; msg(`${b.label}. Nothing useful happens.`); wrongMove(); return; }
    st.hist = h;
    if (pb && h.length === def.book.length) return restore(def, st, "book");
    if (ps && h.length === def.shortcut.length) {
      if (def.shortcutOk(G.v)) return restore(def, st, "shortcut");
      st.state = "jammed"; st.jams++; st.hist = []; G.o2 -= T.jamO2Penalty; msg(`${def.name}: ${def.jamMsg}`); wrongMove(); return;
    }
    msg(`${b.label}: done.`);
  }

  function restore(def, st, method) {
    st.state = "online"; st.method = method; st.at = r1(G.t); st.hist = [];
    msg(`${def.name} is ONLINE${method === "shortcut" ? " (the Scotsman's way)" : " (by the book)"}.`);
    if (def.id === "power") scheduleNext();
    if (def.id === "life") loadSpike();
    if (method === "book" && !G.unlocks[def.id]) {
      G.unlocks[def.id] = true; store.set("stl_unlocks", G.unlocks);
      msg(`A smudged note in the ${def.name} margin comes into focus...`);
    }
    if (method === "shortcut") {
      if (COST === "deferred") def.debt.forEach((d) => G.debt.push({ id: rid(), sys: def.id, label: d.label, secs: d.secs }));
      else { G.o2 -= T.immediateCostO2; msg(`That cost you ${T.immediateCostO2} O₂.`); }
    }
    announceReady();
  }

  function announceReady() {
    if (!G.readyAnnounced && readyToTransmit()) { G.readyAnnounced = true; msg("All systems green. Comms can transmit the Voyage Data Core."); }
  }

  function tick() {
    const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000); last = now;
    if (G.over) return;
    G.t += dt;
    const lsUp = G.sys.life.state === "online";
    G.o2 = Math.max(0, Math.min(T.o2Start, G.o2 + (lsUp ? T.o2RegenOnline : -T.o2DrainOffline) * dt));
    G.sys[G.tab].ms += dt;

    // finish the current action first, so a trim that completes this tick beats the fuse
    if (G.busy) { G.busy.left -= dt; if (G.busy.left <= 0) { const b = G.busy; G.busy = null; G.lastFree = G.t; finish(b); dirty = true; if (G.over) return; } }

    if (G.sys.power.state !== "online") { G.fuse = null; G.nextOverload = null; }
    else {
      // random overloads never START during an action; they wait until the engineer is free
      if (G.fuse == null && G.nextOverload != null && G.t >= G.nextOverload && !G.busy && !calmGenerator()) startOverload("random");
      if (G.fuse != null) {
        G.fuse = Math.max(0, G.fuse - dt);
        if (G.fuse <= 0 && !G.busy) trip(); // an expiring fuse waits for the current action to finish
      }
    }
    if (G.o2 <= 0) return end("lost");
    if (dirty) render(); else renderLive();
  }

  // ---- rendering -------------------------------------------------------------
  function render() {
    dirty = false;
    const statusHtml = S.systems.map((s) => {
      const st = G.sys[s.id];
      return `<button class="sys ${G.selected === s.id ? "sel" : ""}" data-sel="${s.id}">${esc(s.name)}<span class="st ${st.state}">${st.state.toUpperCase()}</span></button>`;
    }).join("");
    const debtHtml = G.debt.length
      ? G.debt.map((d, i) => `<div class="debt">${esc(d.label)} <small>(${d.secs}s)</small><br><button data-debt="${i}" ${G.busy ? "disabled" : ""}>Repair</button></div>`).join("")
      : `<div style="color:#7c745f">None. Clean conscience.</div>`;
    const allUp = S.systems.every((s) => G.sys[s.id].state === "online");
    $("#status").innerHTML = `<h2>Ship status</h2>${statusHtml}
      <h3>Repairs owed</h3>${debtHtml}
      ${allUp && G.debt.length ? `<p style="color:#e0a43a">Transmission blocked: ${G.debt.length} repair(s) outstanding.</p>` : ""}
      <h3>Generator strain</h3><div class="bar strain"><div style="width:${(G.strain / T.strainLimit) * 100}%"></div></div>
      <div style="color:#7c745f;font-size:12px">${G.strain}/${T.strainLimit}. Resync Life Support or Comms to clear.</div>
      <h3>Log</h3><div id="log">${G.log.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;

    const def = DEFS[G.selected], st = G.sys[def.id];
    const acts = panelActions(def);
    $("#panel").innerHTML = `<h2>${esc(def.name)} — <span class="st ${st.state}">${st.state.toUpperCase()}</span></h2>
      <div>${def.plate(G.v).map(([k, v]) => `<span class="plate">${esc(k)}: <b>${esc(v)}</b></span>`).join("")}</div>
      ${def.requires.length ? `<div style="color:#7c745f;font-size:12px">Needs: ${def.requires.map((r) => DEFS[r].name).join(", ")}</div>` : ""}
      ${def.id === "comms" ? `<div class="actions"><button class="act final" data-act="transmit" ${G.busy || !readyToTransmit() ? "disabled" : ""}>${esc(transmitAction.label)}<small>${readyToTransmit() ? transmitAction.secs + "s" : "Needs all systems online and no repairs owed"}</small></button></div>` : ""}
      <div class="actions">${acts.map((a) => `<button class="act" data-act="${a.id}" ${G.busy ? "disabled" : ""}>${esc(a.label)}<small>${a.secs}s</small></button>`).join("")
        || `<div style="color:#7c745f">Nothing to do here. She's humming.</div>`}</div>
      <div class="busy" id="busybox"></div><div id="fusebox"></div>`;

    const m = DEFS[G.tab];
    $("#manual").innerHTML = `<h2>Fleet Engineering Manual</h2>
      <div class="tabs">${S.systems.map((s) => `<button data-tab="${s.id}" class="${G.tab === s.id ? "on" : ""}">${esc(s.name)}</button>`).join("")}</div>
      <div class="page"><h4>${esc(m.manual.title)}</h4>
        <ol>${m.manual.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        <div class="note">${esc(m.manual.note)}</div>
        ${m.margin.map((n) => {
          const locked = n.locked && !G.unlocks[m.id];
          const text = n.text.replace("{cost}", n.cost ? n.cost[COST] : "");
          return `<div class="margin ${locked ? "locked" : ""}">${esc(text)}${locked ? `<span class="hint">[smudged: restore this system by the book to make it out]</span>` : ""}</div>`;
        }).join("")}
      </div>`;
    renderLive();
  }

  function renderLive() {
    const f = $("#o2fill"); f.style.width = (G.o2 / T.o2Start) * 100 + "%"; f.classList.toggle("low", G.o2 < 30);
    $("#o2num").textContent = Math.ceil(G.o2) + "%";
    $("#clock").textContent = fmt(G.t);
    const bb = $("#busybox");
    if (bb) bb.innerHTML = G.busy ? `<div>Working: ${esc(G.busy.label)} (${Math.ceil(G.busy.left)}s)</div><div class="bar"><div id="busyfill" style="width:${(1 - G.busy.left / G.busy.secs) * 100}%"></div></div>` : "";
    const fb = $("#fusebox");
    if (fb) fb.innerHTML = G.fuse != null ? `<div class="warn">⚠ GENERATOR OVERLOAD: trips in ${Math.ceil(G.fuse)}s</div>` : "";
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t || !G || G.over) return;
    if (t.dataset.sel) { G.selected = t.dataset.sel; render(); }
    else if (t.dataset.tab) { if (G.tab !== t.dataset.tab) { G.tab = t.dataset.tab; G.sys[G.tab].mv++; } render(); }
    else if (t.dataset.act) { start(G.selected, t.dataset.act); render(); }
    else if (t.dataset.debt) { startDebt(+t.dataset.debt); render(); }
    else if (t.id === "quit") { if (confirm("End this run?")) end("quit"); }
  });

  // ---- end of run, telemetry, survey ----------------------------------------
  function end(result) {
    if (G.over) return;
    G.over = true; clearInterval(timer);
    const sys = {};
    for (const s of S.systems) {
      const x = G.sys[s.id];
      sys[s.id] = { m: x.method, at: x.at, act: x.act, w: x.waste, j: x.jams, mv: x.mv, ms: r1(x.ms), ok: s.shortcutOk(G.v), end: x.state, order: G.order[s.id] };
    }
    const bench = benchmarks();
    const score = result === "won" ? Math.round((100 * bench.book) / G.t) : null;
    const tel = { run: G.runId, gaps: gapStats(), overloadWin: !!G.overloadWin, par: { book: bench.book, scot: bench.scot }, score, n: G.runIndex, result, secs: r1(G.t), o2: r1(G.o2), cost: COST, ship: G.v, unlocks0: G.unlocks0, trips: G.trips, overloads: G.overloads, strainMax: G.strainMax, desyncs: G.desyncs, resyncs: G.resyncs, debtLeft: G.debt.length, debtPaid: G.debtPaid, sys };
    send({ session_id: sessionId, build: C.build, variant, telemetry: JSON.stringify(tel) });

    const headline = { won: "TRANSMISSION RECEIVED", lost: "OUT OF AIR", quit: "RUN ENDED" }[result];
    const blurb = {
      won: `Fleet Command has the Reasonable Doubt\'s Voyage Data Core. Now they know what happened here. Total time ${fmt(G.t)}, ${Math.ceil(G.o2)}% O₂ to spare.` +
        (G.overloadWin ? " <br><br><i>The generator was mid-tantrum when the data went out. Technically, you won, and sometimes that's the best kind of win.</i>" : ""),
      lost: "You passed out on the deck. A rescue crew finds you three days later, clutching the manual.",
      quit: "You stepped away from the console.",
    }[result];
    $("#overlay").innerHTML = `<div class="card"><h1>${headline}</h1><p>${blurb}</p>${result === "won" && C.showScore ? scoreBoard(bench, G.t, score) : ""}
      <p>Quick survey (about 60 seconds). It decides how the real game gets built.</p>
      ${rate("funny", "How fun was it?")}${rate("frustrating", "How frustrating was it?")}${rate("clever", "How clever did it feel?")}
      <p>Best or most annoying moment?</p><textarea id="openfb"></textarea>
      <p><button class="big" id="submitSurvey">Submit</button> <button class="ghost" id="skipSurvey">Skip</button></p></div>`;
    $("#submitSurvey").onclick = () => {
      const val = (k) => (document.querySelector(`input[name=${k}]:checked`) || {}).value || "";
      send({
        session_id: sessionId, build: C.build, variant, telemetry: JSON.stringify({ survey_for: G.runId }),
        rating_funny: val("funny"), rating_frustrating: val("frustrating"), rating_clever: val("clever"),
        open_feedback: $("#openfb").value.slice(0, 1000),
      });
      thanks();
    };
    $("#skipSurvey").onclick = thanks;
  }
  function scoreBoard(bench, t, score) {
    const max = Math.max(bench.book, bench.scot, t) * 1.05;
    const row = (label, secs, cls, note = "") =>
      `<div class="srow"><span class="slabel">${label}</span><div class="bar"><div class="${cls}" style="width:${(secs / max) * 100}%"></div></div><span class="stime">${fmt(secs)}</span>${note}</div>`;
    const diff = Math.round(bench.book - t);
    const note = diff > 0 ? `<span class="snote">${diff}s under the book!</span>` : "";
    // PLACEHOLDER verdicts: Raul rewrites these.
    let verdict;
    if (t <= bench.scot - 2) verdict = "You beat the Scotsman. He'd deny it, of course.";
    else if (t <= bench.scot + 2) verdict = "Matched the Scotsman. Someone's been reading the margins.";
    else if (t < bench.book) verdict = `Not bad. He'd have shaved off another ${Math.round(t - bench.scot)}s.`;
    else verdict = "The Fleet thanks you for your thoroughness.";
    return `<div class="score">${row("THE SCOTSMAN", bench.scot, "s-scot")}${row("BY THE BOOK", bench.book, "s-book")}${row("YOUR TIME", t, "s-you", note)}
      <div class="sline"><b>SCORE ${score}</b> <span class="margin-inline">"${esc(verdict)}"</span></div></div>`;
  }
  function rate(k, q) {
    return `<div class="rate">${q}<br>${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${k}" value="${n}"> ${n}</label>`).join("")}<small style="color:#7c745f">(1 = not at all, 5 = very)</small></div>`;
  }
  function thanks() {
    $("#overlay").innerHTML = `<div class="card"><h1>THANK YOU, ENGINEER</h1>
      <p>Every ship is a little different. Want another go?</p><p><button class="big" id="again">Play again</button></p></div>`;
    $("#again").onclick = newGame;
  }

  // ---- intro -----------------------------------------------------------------
  $("#overlay").innerHTML = `<div class="card"><h1>STARTECH LAB</h1>
    <p><b>Rough test build.</b> No art, no sound, about 10 minutes.</p>
    <p>${esc(S.ship.intro)}</p>
    <p>Click a system on the left, then use its panel controls. Each control keeps you busy for a few seconds, and you can only do one thing at a time. Read the manual on the right, margins included.</p>
    <p style="color:#7c745f;font-size:12px">Anonymous gameplay data (your choices and timings) and your optional survey answers are collected to improve the game. Nothing that identifies you is collected.</p>
    <button class="big" id="begin">Board the ship</button></div>`;
  $("#begin").onclick = newGame;
})();
