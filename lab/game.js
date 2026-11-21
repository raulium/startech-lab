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

  function newGame() {
    const unlocks = store.get("stl_unlocks", {});
    G = {
      v: rollShip(), t: 0, o2: T.o2Start, busy: null, over: false,
      selected: "power", tab: "power", log: [], debt: [], debtPaid: 0, trimmed: false, fuse: null, trips: 0,
      runId: "r-" + rid(), runIndex: store.get("stl_runs", 0) + 1, unlocks, unlocks0: Object.keys(unlocks),
      sys: {},
    };
    for (const s of S.systems) G.sys[s.id] = { state: "offline", hist: [], method: null, at: null, act: 0, waste: 0, jams: 0, mv: 0, ms: 0 };
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

  // Which buttons a system panel shows right now
  function panelActions(def) {
    const st = G.sys[def.id];
    if (st.state === "jammed") return [{ id: "clearjam", label: "Clear the jam", secs: 5 }];
    if (st.state === "tripped") return def.id === "power"
      ? [{ id: "reset", label: "Reset & re-ramp generator", secs: 6 }]
      : [{ id: "reset", label: "Reset breaker", secs: 3 }];
    if (st.state === "online") return def.id === "power" && !G.trimmed && !selfTrim() ? [{ id: "trim", label: "Trim load balance", secs: 4 }] : [];
    return Object.entries(def.actions).map(([id, a]) => ({ id, ...a }));
  }
  const selfTrim = () => G.v.housingStamp === 7;

  function start(sysId, actId) {
    if (G.busy || G.over) return;
    const def = DEFS[sysId], st = G.sys[sysId];
    const a = panelActions(def).find((x) => x.id === actId);
    if (!a) return;
    const unpowered = def.requires.some((r) => G.sys[r].state !== "online");
    if (unpowered && st.state !== "online") { st.waste++; msg(`${def.name}: no power to this panel. Nothing happens.`); return; }
    G.busy = { sys: sysId, act: actId, label: `${def.name}: ${a.label}`, secs: a.secs, left: a.secs };
    dirty = true;
  }

  function startDebt(i) {
    if (G.busy || G.over) return;
    const d = G.debt[i];
    G.busy = { debt: d.id, label: d.label, secs: d.secs, left: d.secs };
    dirty = true;
  }

  function finish(b) {
    if (b.debt) {
      G.debt = G.debt.filter((d) => d.id !== b.debt); G.debtPaid++;
      msg(`Done: ${b.label}.`); checkWin(); return;
    }
    const def = DEFS[b.sys], st = G.sys[b.sys];
    if (b.act === "clearjam") { st.state = "offline"; msg(`${def.name}: jam cleared. Back to square one.`); return; }
    if (b.act === "reset") {
      st.state = "online"; if (def.id === "power") G.trimmed = false;
      msg(`${def.name}: back online.`); checkWin(); return;
    }
    if (b.act === "trim") { G.trimmed = true; msg("Generator load trimmed. The hum settles."); return; }

    st.act++;
    const h = [...st.hist, b.act];
    const prefix = (seq) => h.length <= seq.length && h.every((x, i) => x === seq[i]);
    const pb = prefix(def.book), ps = prefix(def.shortcut);
    if (!pb && !ps) { st.waste++; msg(`${b.label}. Nothing useful happens.`); return; }
    st.hist = h;
    if (pb && h.length === def.book.length) return restore(def, st, "book");
    if (ps && h.length === def.shortcut.length) {
      if (def.shortcutOk(G.v)) return restore(def, st, "shortcut");
      st.state = "jammed"; st.jams++; st.hist = []; G.o2 -= T.jamO2Penalty; msg(`${def.name}: ${def.jamMsg}`); return;
    }
    msg(`${b.label}: done.`);
  }

  function restore(def, st, method) {
    st.state = "online"; st.method = method; st.at = r1(G.t); st.hist = [];
    msg(`${def.name} is ONLINE${method === "shortcut" ? " (the Scotsman's way)" : " (by the book)"}.`);
    if (method === "book" && !G.unlocks[def.id]) {
      G.unlocks[def.id] = true; store.set("stl_unlocks", G.unlocks);
      msg(`A smudged note in the ${def.name} margin comes into focus...`);
    }
    if (method === "shortcut") {
      if (COST === "deferred") def.debt.forEach((d) => G.debt.push({ id: rid(), sys: def.id, label: d.label, secs: d.secs }));
      else { G.o2 -= T.immediateCostO2; msg(`That cost you ${T.immediateCostO2} O₂.`); }
    }
    checkWin();
  }

  function checkWin() {
    if (G.over) return;
    if (S.systems.every((s) => G.sys[s.id].state === "online") && G.debt.length === 0) end("won");
  }

  function tick() {
    const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000); last = now;
    if (G.over) return;
    G.t += dt;
    const lsUp = G.sys.life.state === "online";
    G.o2 = Math.max(0, Math.min(T.o2Start, G.o2 + (lsUp ? T.o2RegenOnline : -T.o2DrainOffline) * dt));
    G.sys[G.tab].ms += dt;

    // cascade: generator overload once anything draws load
    const p = G.sys.power;
    const load = ["life", "comms"].some((id) => G.sys[id].state === "online");
    if (p.state === "online" && load && !G.trimmed && !selfTrim()) {
      if (G.fuse == null) { G.fuse = T.overloadFuseSeconds; msg("⚠ Generator load climbing. Per §4.2: trim it."); }
      G.fuse -= dt;
      if (G.fuse <= 0) {
        G.fuse = null; G.trips++; p.state = "tripped"; G.trimmed = false;
        ["life", "comms"].forEach((id) => { if (G.sys[id].state === "online") G.sys[id].state = "tripped"; });
        msg("BANG. The generator tripped and took everything downstream with it.");
      }
    } else if (G.fuse != null) { G.fuse = null; dirty = true; }

    if (G.busy) { G.busy.left -= dt; if (G.busy.left <= 0) { const b = G.busy; G.busy = null; finish(b); dirty = true; } }
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
      ${allUp && G.debt.length ? `<p style="color:#e0a43a">Certification blocked: ${G.debt.length} repair(s) outstanding.</p>` : ""}
      <h3>Log</h3><div id="log">${G.log.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;

    const def = DEFS[G.selected], st = G.sys[def.id];
    const acts = panelActions(def);
    $("#panel").innerHTML = `<h2>${esc(def.name)} — <span class="st ${st.state}">${st.state.toUpperCase()}</span></h2>
      <div>${def.plate(G.v).map(([k, v]) => `<span class="plate">${esc(k)}: <b>${esc(v)}</b></span>`).join("")}</div>
      ${def.requires.length ? `<div style="color:#7c745f;font-size:12px">Needs: ${def.requires.map((r) => DEFS[r].name).join(", ")}</div>` : ""}
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
      sys[s.id] = { m: x.method, at: x.at, act: x.act, w: x.waste, j: x.jams, mv: x.mv, ms: r1(x.ms), ok: s.shortcutOk(G.v), end: x.state };
    }
    const tel = { run: G.runId, n: G.runIndex, result, secs: r1(G.t), o2: r1(G.o2), cost: COST, ship: G.v, unlocks0: G.unlocks0, trips: G.trips, debtLeft: G.debt.length, debtPaid: G.debtPaid, sys };
    send({ session_id: sessionId, build: C.build, variant, telemetry: JSON.stringify(tel) });

    const headline = { won: "SHIP CERTIFIED", lost: "OUT OF AIR", quit: "RUN ENDED" }[result];
    const blurb = {
      won: `The Reasonable Doubt is alive. Total time ${fmt(G.t)}, ${Math.ceil(G.o2)}% O₂ to spare.`,
      lost: "You passed out on the deck. A rescue crew finds you three days later, clutching the manual.",
      quit: "You stepped away from the console.",
    }[result];
    $("#overlay").innerHTML = `<div class="card"><h1>${headline}</h1><p>${blurb}</p>
      <p>Quick survey (about 60 seconds). It decides how the real game gets built.</p>
      ${rate("funny", "How funny was it?")}${rate("frustrating", "How frustrating was it?")}${rate("clever", "How clever did you feel?")}
      <p>Funniest or most annoying moment?</p><textarea id="openfb"></textarea>
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
