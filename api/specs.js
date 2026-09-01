export default async function handler(req, res) {
  const raw = req.query.url;
  if (!raw) return res.status(400).json({ error: "missing ?url=" });
  let url;
  try { url = decodeURIComponent(raw); } catch { return res.status(400).json({ error: "bad url" }); }
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "invalid url" });
  // only allow our known stores
  if (!/(kabum\.com\.br|pichau\.com\.br|terabyte\.com\.br|amazon\.com\.br)/i.test(url))
    return res.status(400).json({ error: "store not supported" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  // edge cache 24h + stale-while-revalidate 1h -> sim, a cada 24h busca de novo automaticamente
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      redirect: "follow",
    });
    if (!r.ok) return res.status(502).json({ error: "fetch failed " + r.status });
    const html = await r.text();

    const specs = {};

    const pairs = [];

    // th/td - Pichau usa <th class="name-field"> com <td class="value-field"> e quebra de linha
    for (const m of html.matchAll(/<th[^>]*>([^<]{1,80})<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
      const k = m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;|&amp;/g, " ").trim().replace(/:$/, "");
      const v = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      if (k.length >= 2 && k.length <= 40 && v.length >= 1) pairs.push([k, v]);
      if (pairs.length >= 30) break;
    }
    // fallback: dt/dd
    if (pairs.length < 3) {
      for (const m of html.matchAll(/<dt[^>]*>([^<]{1,60})<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
        const k = m[1].replace(/<[^>]+>/g, "").trim().replace(/:$/, "");
        const v = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
        if (k && v) pairs.push([k, v]);
        if (pairs.length >= 30) break;
      }
    }
    // fallback: divs with class spec
    if (pairs.length < 3) {
      for (const m of html.matchAll(/<div[^>]*class="[^"]*spec[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)) {
        const txt = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const p = txt.match(/^([^:]{2,30}):\s*(.{1,120})$/);
        if (p) pairs.push([p[1].trim(), p[2].trim()]);
        if (pairs.length >= 30) break;
      }
    }

    // dedupe and build object (keep first)
    for (const [k, v] of pairs) {
      const kk = k.charAt(0).toUpperCase() + k.slice(1);
      if (!specs[kk] && v) specs[kk] = v;
    }

    // if still empty, return title-based hint
    if (!Object.keys(specs).length) {
      return res.status(200).json({ specs: {}, note: "no table found, use title parse" });
    }

    return res.status(200).json({ specs });
  } catch (e) {
    return res.status(502).json({ error: String(e).slice(0, 300) });
  }
}
