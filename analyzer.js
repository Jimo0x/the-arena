// Analyse de la qualité d'un argument (français, sans dépendance).
// Chaque critère est noté puis expliqué pour que le joueur sache comment progresser.
"use strict";

const CONNECT = ["parce que", "car", "donc", "ainsi", "en effet", "par conséquent", "c'est pourquoi", "puisque", "d'abord", "ensuite", "enfin",
  "premièrement", "deuxièmement", "de plus", "en outre", "cependant", "pourtant", "néanmoins", "toutefois", "or", "alors que", "si bien que", "en revanche"];
const EVIDENCE = ["selon", "étude", "études", "rapport", "statistique", "données", "chiffre", "chiffres", "pour cent", "%", "par exemple", "exemple",
  "prouve", "montre", "démontre", "recherche", "chercheurs", "insee", "oms", "onu", "université", "enquête", "historiquement", "en 19", "en 20"];
const CONCEDE = ["certes", "il est vrai", "je reconnais", "j'admets", "même si", "bien que", "effectivement", "tu as raison", "vous avez raison"];
const FALLACIES = [
  { re: /\b(t'es|tu es|vous êtes|t'as|espèce d')\s+(nul|idiot|bête|débile|stupide|ignorant|naïf|ridicule)\w*/i, name: "Attaque personnelle (ad hominem)", pen: 3 },
  { re: /\b(tout le monde (sait|pense|dit)|c'est évident|personne ne (pense|croit))\b/i, name: "Appel à la majorité / à l'évidence", pen: 1.5 },
  { re: /\b(toujours|jamais|tous les|aucun|absolument tout)\b/i, name: "Généralisation", pen: 0.7 },
  { re: /\b(si on (accepte|autorise|commence).{0,40}(alors|bientôt|demain))\b/i, name: "Pente glissante", pen: 1.2 },
  { re: /\b(soit .{3,40} soit)\b/i, name: "Faux dilemme possible", pen: 0.8 },
  { re: /\b(on a toujours fait comme ça|depuis toujours|c'est naturel)\b/i, name: "Appel à la tradition / à la nature", pen: 1 },
];
const STOP = new Set("le la les un une des de du et à au aux en que qui quoi dans pour par sur avec sans ce cette ces son sa ses leur leurs nous vous ils elles on il elle je tu est sont été être a ont avoir pas ne plus moins très mais ou donc or ni car se si y lui eux même aussi comme tout tous toute toutes".split(" "));

const words = s => (s.toLowerCase().match(/[a-zà-ÿ0-9%']+/g) || []);
const keyw = s => new Set(words(s).filter(w => w.length > 4 && !STOP.has(w)));
const count = (low, list) => list.filter(k => low.includes(k)).length;
const clamp = (v, a = 0, b = 10) => Math.max(a, Math.min(b, v));

function analyze(text, opponentText = "", topic = "") {
  const low = " " + text.toLowerCase() + " ";
  const w = words(text), sentences = text.split(/[.!?…]+/).map(s => s.trim()).filter(s => s.split(/\s+/).length > 2);
  const avgLen = sentences.length ? w.length / sentences.length : w.length;
  const nConnect = count(low, CONNECT), nEvid = count(low, EVIDENCE) + (text.match(/\d+/g) || []).length * 0.5, nConcede = count(low, CONCEDE);
  const opp = keyw(opponentText), mine = keyw(text), topicK = keyw(topic);
  const rebut = opponentText ? [...mine].filter(k => opp.has(k) && !topicK.has(k)).length : 0;
  const shouting = (text.match(/[A-ZÀ-Ý]{4,}/g) || []).length + (text.match(/!{2,}/g) || []).length;

  const crit = {
    structure: clamp(2 + nConnect * 2 + Math.min(3, sentences.length)),
    preuves: clamp(1 + nEvid * 2.2),
    réfutation: opponentText ? clamp(1.5 + rebut * 2 + nConcede * 2) : null,
    clarté: clamp(10 - Math.max(0, avgLen - 22) * 0.35 - Math.max(0, 8 - w.length) * 0.6 - shouting),
    développement: clamp(w.length / 9),
  };
  const fallacies = FALLACIES.filter(f => f.re.test(text)).map(f => ({ name: f.name, pen: f.pen }));
  const vals = Object.values(crit).filter(v => v !== null);
  const base = vals.reduce((a, b) => a + b, 0) / vals.length;
  const score = Math.round(clamp(base - fallacies.reduce((a, f) => a + f.pen, 0) + (nConcede ? 0.5 : 0)) * 10) / 10;

  const tips = [];
  if (crit.preuves < 4) tips.push("Appuyez-vous sur un exemple concret, un chiffre ou une source.");
  if (crit.structure < 5) tips.push("Liez vos idées : « parce que », « donc », « de plus »…");
  if (crit.réfutation !== null && crit.réfutation < 4) tips.push("Répondez directement à l'argument adverse.");
  if (crit.clarté < 5) tips.push("Des phrases plus courtes rendraient l'idée plus percutante.");
  if (fallacies.length) tips.push("Évitez : " + fallacies.map(f => f.name.toLowerCase()).join(", ") + ".");
  if (!tips.length) tips.push("Argument solide, bien construit et étayé.");
  const strengths = [];
  if (crit.preuves >= 6) strengths.push("bien étayé");
  if (crit.structure >= 7) strengths.push("logique claire");
  if (crit.réfutation >= 6) strengths.push("bonne réfutation");
  if (nConcede) strengths.push("nuancé");
  return { score, crit, fallacies: fallacies.map(f => f.name), tips, strengths, words: w.length };
}

module.exports = { analyze };
