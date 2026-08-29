export default function handler(req, res) {
  const to = req.query.to;
  if (!to) return res.status(400).send("missing ?to=");
  let url;
  try { url = decodeURIComponent(to); } catch { return res.status(400).send("bad to"); }
  // allow only http/https and block open-redirect abuse to our own domain loop
  if (!/^https?:\/\//i.test(url)) return res.status(400).send("invalid url");
  // 302 redirect - Google Merchant follows HTTP redirect and keeps pcbarato.vercel.app as canonical
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.redirect(302, url);
}
