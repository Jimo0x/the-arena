// Tests : node --test
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { analyze } = require("../analyzer");

test("un argument étayé et structuré bat une attaque personnelle", () => {
  const good = analyze("Je défends cette idée parce que, selon une étude de l'INSEE, 62 % des salariés se disent plus productifs. De plus, par exemple, les trajets évités réduisent les émissions. Donc le bilan est positif.");
  const bad = analyze("T'es nul, tout le monde sait que c'est faux !!!");
  assert.ok(good.score >= 6, `bon argument ${good.score}`);
  assert.ok(bad.score < 3.5, `mauvais argument ${bad.score}`);
  assert.ok(bad.fallacies.some(f => f.includes("ad hominem")));
});

test("la réfutation est détectée quand on reprend les termes de l'adversaire", () => {
  const opp = "Les trajets quotidiens fatiguent les employés et coûtent cher aux entreprises.";
  const a = analyze("Certes les trajets fatiguent, mais les employés isolés perdent en motivation, donc il faut un équilibre.", opp, "Le télétravail");
  assert.ok(a.crit["réfutation"] >= 6, String(a.crit["réfutation"]));
});

test("débat complet contre l'IA via WebSocket", { timeout: 30000 }, async () => {
  process.env.PORT = "5908"; process.env.ROUND_TIME = "20";
  const { srv } = require("../server");
  await new Promise(r => setTimeout(r, 300));
  const ws = new WebSocket("ws://127.0.0.1:5908"); const msgs = [];
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => msgs.push(JSON.parse(e.data));
  ws.send(JSON.stringify({ type: "create", topic: "Les jeux vidéo sont un art", side: "pour", bot: true }));
  const last = () => [...msgs].reverse().find(m => m.type === "debate").debate;
  for (let round = 1; round <= 3; round++) {
    await new Promise(r => setTimeout(r, 150));
    assert.strictEqual(last().turn, "pour");
    ws.send(JSON.stringify({ type: "argue", text: `Manche ${round} : les jeux vidéo sont un art parce que, par exemple, Journey a été exposé au Smithsonian. Donc ils racontent des histoires.` }));
    await new Promise(r => setTimeout(r, 5400)); // le bot répond en 2,5 à 5 s
  }
  const d = last();
  assert.strictEqual(d.phase, "finished"); assert.strictEqual(d.args.length, 6); assert.ok(d.result.winner);
  ws.close(); srv.close();
});
