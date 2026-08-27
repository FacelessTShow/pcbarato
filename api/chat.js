// Vercel Function: PcB IA — responde perguntas usando ofertas reais do site.
// POST /api/chat  { "message": "..." }  ->  { "reply": "..." }
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST apenas" });

  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "campo 'message' obrigatório" });
  }

  // ofertas reais geradas pelos scrapers (atualizadas pelo cron)
  let ofertas = [];
  try {
    const mod = await import("../ofertas.js-data.json", { with: { type: "json" } }).catch(() => null);
    if (mod) ofertas = mod.default.offers || [];
  } catch {}
  if (!ofertas.length) {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const p = path.join(process.cwd(), "api", "ofertas-data.json");
      ofertas = JSON.parse(fs.readFileSync(p, "utf8")).offers || [];
    } catch {}
  }

  const top = ofertas.slice(0, 60)
    .map(o => `- ${o.s} | R$ ${o.p.toFixed(2).replace(".", ",")} | ${o.t}`)
    .join("\n");

  const system = `Você é a PcB IA, assistente de upgrade de PC do site PCBarato (comparador de preços BR).
Responda em PT-BR, curto e direto, tom de amigo geek. Ajude com recomendações de hardware, gargalos e custo-benefício.
Quando fizer sentido, recomende ofertas REAIS da lista abaixo (com nome da loja e preço). Se não houver na lista, diga o preço médio de mercado e sugira pesquisar no site.
NUNCA invente preço como se fosse oferta real da lista. Links não precisam ser gerados (o site já linka as ofertas).

OFERTAS ATUAIS (ordenadas por preço):
${top || "(nenhuma oferta carregada)"}`;

  const models = ["minimax/minimax-m3:free", "nvidia/nemotron-3.5-lightning:free", "google/gemma-4-31b-it:free", "z-ai/glm-5.2:free"];
  let reply = null, lastErr = null;
  for (const model of models) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 700,
          messages: [
            { role: "system", content: system },
            { role: "user", content: message.slice(0, 2000) },
          ],
        }),
      });
      if (!r.ok) throw new Error(`${model}: HTTP ${r.status}`);
      const j = await r.json();
      reply = j.choices?.[0]?.message?.content;
      if (reply) break;
    } catch (e) { lastErr = e; }
  }

  if (!reply) {
    return res.status(502).json({ error: "IA indisponível", detail: String(lastErr || "") });
  }
  return res.status(200).json({ reply });
}
