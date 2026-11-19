// The Arena — débats anonymes en temps réel (Node.js, zéro dépendance).
"use strict";
const path = require("path");
const { createServer } = require("./ws-lite");
const { analyze } = require("./analyzer");

const PORT = +process.env.PORT || 5008;
const ROUND_TIME = +process.env.ROUND_TIME || 90;     // secondes par prise de parole
const ROUNDS = 3;
const TOPICS = [
  "Le télétravail devrait devenir la norme", "Les réseaux sociaux font plus de mal que de bien", "L'IA va créer plus d'emplois qu'elle n'en détruira",
  "Les devoirs à la maison devraient être supprimés", "Le nucléaire est indispensable à la transition écologique", "Les jeux vidéo sont un art",
  "La semaine de 4 jours devrait être généralisée", "Il faut interdire les smartphones au collège", "Les études supérieures devraient être gratuites",
];
const BOT = {
  pour: ["Je défends cette idée parce que les données sont claires : selon plusieurs études récentes, les bénéfices dépassent largement les coûts. Par exemple, les pays qui l'ont adoptée constatent des résultats mesurables.",
    "Certes, mon adversaire soulève un point, mais il oublie l'essentiel : le changement est déjà en cours. De plus, refuser d'avancer coûte plus cher que d'accompagner la transition, donc il faut agir maintenant.",
    "Pour conclure, j'ai montré des exemples concrets et des chiffres. En revanche, on ne m'a opposé que des craintes. C'est pourquoi la proposition l'emporte."],
  contre: ["Je m'oppose à cette idée car elle ignore les effets secondaires. En effet, une enquête récente montre que 40 % des personnes concernées en subissent les inconvénients sans en voir les avantages.",
    "Il est vrai que l'intention est bonne, cependant les exemples cités sont des cas particuliers. Ainsi, généraliser une solution locale à tout un pays serait une erreur de raisonnement.",
    "En conclusion, la prudence s'impose : nous n'avons pas de recul suffisant, et les risques sont documentés. Donc, tant que ces questions restent ouvertes, la réponse doit être non."],
};
const ANIMALS = ["Aigle", "Cobra", "Loup", "Tigre", "Faucon", "Ours", "Lynx", "Requin", "Corbeau", "Lion"];
const nick = () => `${ANIMALS[Math.random() * ANIMALS.length | 0]}-${100 + (Math.random() * 900 | 0)}`;

const debates = new Map(); let nextId = 1;
const srv = createServer({ root: path.join(__dirname, "public"), port: PORT });

function publicDebate(d, full = false) {
  const base = { id: d.id, topic: d.topic, phase: d.phase, round: d.round, turn: d.turn, deadline: d.deadline, spectators: d.spectators.size,
    sides: { pour: d.sides.pour && d.sides.pour.name, contre: d.sides.contre && d.sides.contre.name }, bot: d.bot, votes: tally(d) };
  if (full) Object.assign(base, { args: d.args, chat: d.chat.slice(-60), result: d.result, roundTime: ROUND_TIME, rounds: ROUNDS });
  return base;
}
function tally(d) { const t = { pour: 0, contre: 0 }; for (const v of d.votes.values()) t[v]++; return t; }
function lobby() { srv.broadcast({ type: "lobby", debates: [...debates.values()].filter(d => d.phase !== "closed").map(d => publicDebate(d)) }); }
function push(d) { const msg = JSON.stringify({ type: "debate", debate: publicDebate(d, true) }); for (const c of d.members) c.send(msg); }

function create(topic, side, ws, bot) {
  const d = { id: nextId++, topic: topic || TOPICS[Math.random() * TOPICS.length | 0], phase: "waiting", round: 0, turn: "pour", deadline: null,
    sides: { pour: null, contre: null }, members: new Set(), spectators: new Set(), votes: new Map(), args: [], chat: [], result: null, bot: !!bot, timer: null };
  debates.set(d.id, d); join(d, ws, side);
  if (bot) { d.sides[side === "pour" ? "contre" : "pour"] = { name: "🤖 Sparring-IA", ws: null }; start(d); }
  return d;
}
function join(d, ws, side) {
  leave(ws); ws.debate = d; d.members.add(ws);
  if (side && !d.sides[side] && d.phase === "waiting") { d.sides[side] = { name: ws.name, ws }; ws.side = side; }
  else { ws.side = null; d.spectators.add(ws); }
  if (d.sides.pour && d.sides.contre && d.phase === "waiting") start(d);
  push(d); lobby();
}
function leave(ws) {
  const d = ws.debate; if (!d) return;
  d.members.delete(ws); d.spectators.delete(ws);
  if (ws.side && d.phase !== "finished") {
    if (d.phase === "waiting") { debates.delete(d.id); clearTimeout(d.timer); }
    else { d.chat.push({ sys: true, text: `${ws.name} a quitté le débat.` }); finish(d, ws.side === "pour" ? "contre" : "pour"); }
  }
  ws.debate = null; ws.side = null; push(d); lobby();
}
function start(d) { d.phase = "live"; d.round = 1; d.turn = "pour"; d.chat.push({ sys: true, text: "Le débat commence ! « Pour » ouvre la manche 1." }); nextTurn(d, true); }
function nextTurn(d, first) {
  clearTimeout(d.timer);
  if (!first) {
    if (d.turn === "pour") d.turn = "contre";
    else { d.turn = "pour"; d.round++; }
    if (d.round > ROUNDS) return finish(d);
  }
  d.deadline = Date.now() + ROUND_TIME * 1000;
  d.timer = setTimeout(() => submit(d, d.turn, "(temps écoulé, aucune réponse)"), ROUND_TIME * 1000 + 300);
  const s = d.sides[d.turn];
  if (s && !s.ws) setTimeout(() => d.phase === "live" && submit(d, d.turn, BOT[d.turn][Math.min(d.round, 3) - 1]), 2500 + Math.random() * 2500);
  push(d); lobby();
}
function submit(d, side, text) {
  if (d.phase !== "live" || d.turn !== side) return;
  text = String(text).slice(0, 1200).trim() || "(vide)";
  const prev = [...d.args].reverse().find(a => a.side !== side);
  const a = analyze(text, prev ? prev.text : "", d.topic);
  d.args.push({ side, round: d.round, text, by: d.sides[side].name, analysis: a, t: Date.now() });
  nextTurn(d);
}
function finish(d, forfeitWinner) {
  clearTimeout(d.timer); d.phase = "finished"; d.deadline = null;
  const ai = { pour: 0, contre: 0 }, n = { pour: 0, contre: 0 };
  d.args.forEach(a => { ai[a.side] += a.analysis.score; n[a.side]++; });
  for (const s of ["pour", "contre"]) ai[s] = n[s] ? Math.round(ai[s] / n[s] * 10) / 10 : 0;
  const v = tally(d), totalV = v.pour + v.contre;
  const pub = { pour: totalV ? v.pour / totalV * 10 : 5, contre: totalV ? v.contre / totalV * 10 : 5 };
  const final = { pour: Math.round((ai.pour * 0.6 + pub.pour * 0.4) * 10) / 10, contre: Math.round((ai.contre * 0.6 + pub.contre * 0.4) * 10) / 10 };
  const winner = forfeitWinner || (final.pour === final.contre ? "égalité" : final.pour > final.contre ? "pour" : "contre");
  d.result = { ai, votes: v, final, winner, forfeit: !!forfeitWinner };
  d.chat.push({ sys: true, text: winner === "égalité" ? "Égalité parfaite !" : `Victoire du camp « ${winner} » !` });
  push(d); lobby();
  setTimeout(() => { d.phase = "closed"; debates.delete(d.id); lobby(); }, 10 * 60 * 1000).unref();
}

srv.on("connection", ws => {
  ws.name = nick();
  ws.send({ type: "hello", name: ws.name, topics: TOPICS });
  ws.send({ type: "lobby", debates: [...debates.values()].filter(d => d.phase !== "closed").map(d => publicDebate(d)) });
  ws.on("message", raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const d = m.id ? debates.get(m.id) : ws.debate;
    switch (m.type) {
      case "create": create(String(m.topic || "").slice(0, 140), m.side === "contre" ? "contre" : "pour", ws, m.bot); break;
      case "join": if (d) join(d, ws, m.side); break;
      case "leave": leave(ws); break;
      case "argue": if (ws.debate && ws.side) submit(ws.debate, ws.side, m.text); break;
      case "vote": if (ws.debate && !ws.side && ["pour", "contre"].includes(m.side)) { ws.debate.votes.set(ws.id, m.side); push(ws.debate); } break;
      case "chat": if (ws.debate) { ws.debate.chat.push({ by: ws.name, text: String(m.text).slice(0, 200), side: ws.side }); push(ws.debate); } break;
      case "react": if (ws.debate) for (const c of ws.debate.members) c.send({ type: "react", emoji: String(m.emoji).slice(0, 4) }); break;
    }
  });
  ws.on("close", () => leave(ws));
});

srv.listen(() => console.log(`The Arena → http://127.0.0.1:${PORT}`));
module.exports = { srv, debates };
