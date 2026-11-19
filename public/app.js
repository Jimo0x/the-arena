let ws, me = null, D = null, mySide = null, side = "pour", tick = null, draft = "";
const CRIT = ["structure", "preuves", "réfutation", "clarté", "développement"];

function connect() {
  ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host);
  ws.onmessage = e => { const m = JSON.parse(e.data); handlers[m.type] && handlers[m.type](m); };
  ws.onclose = () => { $("#me").textContent = "déconnecté — reconnexion…"; setTimeout(connect, 1500); };
}
const send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
const handlers = {
  hello(m) { me = m.name; $("#me").textContent = "vous : " + me; $("#topicSel").innerHTML = m.topics.map(t => `<option>${esc(t)}</option>`).join(""); },
  lobby(m) {
    $("#nDeb").textContent = m.debates.length;
    $("#list").innerHTML = m.debates.map(d => `<div class="card deb"><div><b>${esc(d.topic)}</b><div class="dim" style="font-size:12.5px;margin-top:4px">
      <span class="red">POUR</span> ${esc(d.sides.pour || "— libre —")} · <span>CONTRE</span> ${esc(d.sides.contre || "— libre —")} · 👁 ${d.spectators}</div></div>
      <div class="row">${d.phase === "waiting" ? ["pour", "contre"].filter(s => !d.sides[s]).map(s => `<button class="btn sm" data-j="${d.id}" data-s="${s}">Défendre ${s.toUpperCase()}</button>`).join("") : `<span class="badge red live">en cours · manche ${d.round}</span>`}
      <button class="btn ghost sm" data-j="${d.id}">Regarder</button></div></div>`).join("") || `<div class="empty">Aucune arène ouverte. Lancez le premier débat !</div>`;
    $$("#list [data-j]").forEach(b => b.onclick = () => send({ type: "join", id: +b.dataset.j, side: b.dataset.s }));
  },
  debate(m) { const first = !D || D.id !== m.debate.id; D = m.debate; mySide = D.sides.pour === me ? "pour" : D.sides.contre === me ? "contre" : null; show("vDebate"); render(first); },
  react(m) { const f = document.createElement("div"); f.className = "floaty"; f.textContent = m.emoji; f.style.left = (60 + Math.random() * 30) + "%"; document.body.appendChild(f); setTimeout(() => f.remove(), 2500); },
};
function show(v) { $$(".view").forEach(x => x.classList.toggle("on", x.id === v)); }

/* ── lobby ── */
$$("[data-side]").forEach(b => b.onclick = () => { side = b.dataset.side; $$("[data-side]").forEach(x => x.classList.toggle("ghost", x !== b)); });
$("#create").onclick = () => send({ type: "create", topic: $("#topicCustom").value.trim() || $("#topicSel").value, side, bot: $("#bot").checked });
$("#home").onclick = () => { if (D) send({ type: "leave" }); D = null; show("vLobby"); };
$("#leave").onclick = $("#home").onclick;

/* ── débat ── */
function render(first) {
  $("#dTopic").textContent = D.topic;
  $("#dRound").textContent = D.phase === "waiting" ? "En attente d'un adversaire…" : D.phase === "finished" ? "Débat terminé" : `Manche ${D.round} / ${D.rounds} · parole à « ${D.turn} »`;
  for (const s of ["pour", "contre"]) {
    const el = $(s === "pour" ? "#sPour" : "#sContre"), args = D.args.filter(a => a.side === s), avg = args.length ? (args.reduce((x, a) => x + a.analysis.score, 0) / args.length).toFixed(1) : "–";
    el.classList.toggle("active", D.phase === "live" && D.turn === s);
    el.innerHTML = `<div class="kicker" style="color:${s === "pour" ? "var(--red2)" : "#ececf1"}">${s.toUpperCase()}${mySide === s ? " · vous" : ""}</div><div style="font:700 18px var(--font);margin-top:4px">${esc(D.sides[s] || "en attente…")}</div><div class="dim" style="font-size:12px">note IA moyenne : <b class="mono" style="color:var(--text)">${avg}</b>/10</div>`;
  }
  $("#timeline").innerHTML = D.args.map(a => `<div class="arg ${a.side}"><div class="row between"><b style="font-size:12.5px">${esc(a.by)} <span class="dim">· manche ${a.round}</span></b>
      <span class="score" style="color:${a.analysis.score >= 7 ? "var(--ok)" : a.analysis.score >= 4.5 ? "var(--warn)" : "var(--red2)"}">${a.analysis.score}</span></div>
      <p style="margin:8px 0 10px;line-height:1.6">${esc(a.text)}</p>
      ${CRIT.filter(c => a.analysis.crit[c] != null).map(c => `<div class="crit"><span>${c}</span><div class="bar"><i style="width:${a.analysis.crit[c] * 10}%"></i></div><span class="mono">${a.analysis.crit[c].toFixed(0)}</span></div>`).join("")}
      ${a.analysis.strengths.length ? `<div style="margin-top:8px">${a.analysis.strengths.map(s => `<span class="badge ok" style="margin-right:4px">${esc(s)}</span>`).join("")}</div>` : ""}
      ${a.analysis.fallacies.length ? `<div style="margin-top:6px">${a.analysis.fallacies.map(s => `<span class="badge red" style="margin-right:4px">⚠ ${esc(s)}</span>`).join("")}</div>` : ""}
      <div class="dim" style="font-size:12px;margin-top:8px">🤖 ${esc(a.analysis.tips[0])}</div></div>`).join("")
    || `<div class="empty">${D.phase === "waiting" ? "Partagez cette page : le premier qui rejoint le camp adverse lance le débat." : "Les arguments apparaîtront ici."}</div>`;
  $("#timeline").scrollTop = 1e9;
  // composer
  const myTurn = D.phase === "live" && mySide && D.turn === mySide;
  if (myTurn && !$("#argIn")) {
    $("#composer").innerHTML = `<div class="row" style="align-items:flex-start;margin-top:12px"><svg class="ring" viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" stroke="#26262e"/><circle id="ringFg" cx="30" cy="30" r="26" stroke="#e5172f" stroke-dasharray="163" transform="rotate(-90 30 30)" stroke-linecap="round"/><text id="ringT" x="30" y="35" text-anchor="middle" fill="#ececf1" font-size="15" font-family="monospace"></text></svg>
      <div class="grow col"><textarea id="argIn" placeholder="Votre argument… (structurez, donnez des preuves, répondez à l'adversaire)" maxlength="1200"></textarea>
      <div class="row between"><span class="dim" id="live" style="font-size:12px"></span><button class="btn" id="argSend">Envoyer l'argument (Ctrl+Entrée)</button></div></div></div>`;
    $("#argIn").value = draft; $("#argIn").focus();
    $("#argIn").oninput = e => { draft = e.target.value; const w = draft.split(/\s+/).filter(Boolean).length; $("#live").textContent = `${w} mots`; };
    const go = () => { send({ type: "argue", text: $("#argIn").value }); draft = ""; };
    $("#argSend").onclick = go; $("#argIn").onkeydown = e => (e.ctrlKey || e.metaKey) && e.key === "Enter" && go();
  } else if (!myTurn) $("#composer").innerHTML = D.phase === "live" ? `<div class="row dim" style="margin-top:12px;justify-content:center"><span class="badge live red">${esc(D.sides[D.turn] || "")} rédige son argument…</span> <span class="mono" id="ringT"></span></div>` : "";
  clearInterval(tick); tick = setInterval(timer, 250); timer();
  // votes
  const tot = D.votes.pour + D.votes.contre || 1;
  $("#vP").style.width = (D.votes.pour + D.votes.contre ? D.votes.pour / tot * 100 : 50) + "%"; $("#vC").style.width = (D.votes.pour + D.votes.contre ? D.votes.contre / tot * 100 : 50) + "%";
  $("#vPn").textContent = `${D.votes.pour} pour`; $("#vCn").textContent = `${D.votes.contre} contre`; $("#nSpec").textContent = `👁 ${D.spectators}`;
  $("#voteBtns").style.display = mySide || D.phase === "finished" ? "none" : "flex";
  $("#chat").innerHTML = D.chat.map(c => c.sys ? `<div class="red" style="font-size:12px">⚑ ${esc(c.text)}</div>` : `<div><b style="color:${c.side === "pour" ? "var(--red2)" : c.side === "contre" ? "#fff" : "var(--muted)"}">${esc(c.by)}</b> ${esc(c.text)}</div>`).join(""); $("#chat").scrollTop = 1e9;
  // résultat
  const r = D.result;
  $("#result").innerHTML = r ? `<div class="result"><div class="kicker">Verdict</div><div class="w" style="color:${r.winner === "pour" ? "var(--red2)" : "#fff"}">${r.winner === "égalité" ? "ÉGALITÉ" : "VICTOIRE " + r.winner.toUpperCase()}</div>
    ${r.forfeit ? `<div class="dim">par forfait</div>` : ""}<div class="grid g3" style="margin-top:16px;text-align:left">
    <div class="stat"><div class="l">Note IA (60 %)</div><div class="v">${r.ai.pour} <small class="muted">vs</small> ${r.ai.contre}</div></div>
    <div class="stat"><div class="l">Public (40 %)</div><div class="v">${r.votes.pour} <small class="muted">vs</small> ${r.votes.contre}</div></div>
    <div class="stat"><div class="l">Score final</div><div class="v red">${r.final.pour} <small class="muted">vs</small> ${r.final.contre}</div></div></div></div>` : "";
}
function timer() {
  if (!D || !D.deadline) return;
  const left = Math.max(0, (D.deadline - Date.now()) / 1000), t = $("#ringT"), fg = $("#ringFg");
  if (t) t.textContent = Math.ceil(left); if (fg) { fg.style.strokeDashoffset = 163 * (1 - left / D.roundTime); fg.style.stroke = left < 15 ? "#ff3b52" : "#e5172f"; }
}
$$("[data-v]").forEach(b => b.onclick = () => { send({ type: "vote", side: b.dataset.v }); toast("Vote enregistré (modifiable jusqu'à la fin)"); });
$("#chatIn").onkeydown = e => { if (e.key === "Enter" && e.target.value.trim()) { send({ type: "chat", text: e.target.value }); e.target.value = ""; } };
$$("[data-e]").forEach(b => b.onclick = () => send({ type: "react", emoji: b.dataset.e }));
connect();
