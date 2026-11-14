// Достаёт цену товара со страницы магазина.
// GET /api/price?url=https://shop/...  ->  { price: 695, source: 'json-ld' }  или  { price: null, reason: '...' }

const TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000;

// Не даём превратить функцию в способ ходить во внутреннюю сеть
function isSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return null; // голые IP
  if (!h.includes('.')) return null;
  return u;
}

// "1 299,00" / "1,299.00" / "695" / 695 -> число
function toNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  let s = String(v).replace(/[\s ]/g, '').replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // последний разделитель — десятичный, остальные — тысячные
    const dec = lastComma > lastDot ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma > -1) {
    // "1,299" — тысячные, "12,50" — десятичная
    s = /,\d{3}$/.test(s) && s.indexOf(',') === lastComma ? s.replace(',', '') : s.replace(',', '.');
  } else if (lastDot > -1 && /\.\d{3}$/.test(s) && s.indexOf('.') === lastDot) {
    s = s.replace('.', '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function priceFromOffer(o) {
  if (!o || typeof o !== 'object') return null;
  const direct = toNumber(o.price) ?? toNumber(o.lowPrice);
  if (direct !== null) return direct;
  const spec = o.priceSpecification;
  if (Array.isArray(spec)) {
    for (const s of spec) { const n = toNumber(s?.price); if (n !== null) return n; }
  } else if (spec) {
    const n = toNumber(spec.price);
    if (n !== null) return n;
  }
  return null;
}

// Обход JSON-LD: ищем Product (в т.ч. внутри @graph и массивов) и берём цену из offers
function priceFromJsonLd(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const p = priceFromJsonLd(n); if (p !== null) return p; }
    return null;
  }
  if (typeof node !== 'object') return null;

  const type = [].concat(node['@type'] || []).map(String);
  if (type.includes('Product') || node.offers) {
    const offers = [].concat(node.offers || []);
    for (const o of offers) {
      const p = priceFromOffer(o);
      if (p !== null) return p;
      // AggregateOffer с вложенными offers
      if (o && o.offers) { const q = priceFromJsonLd(o); if (q !== null) return q; }
    }
  }
  if (node['@graph']) return priceFromJsonLd(node['@graph']);
  return null;
}

function metaContent(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (name && name.toLowerCase() === key) {
      const c = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
      if (c) return c;
    }
  }
  return null;
}

export function extractPrice(html) {
  // 1. JSON-LD
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const p = priceFromJsonLd(JSON.parse(body));
      if (p !== null) return { price: p, source: 'json-ld' };
    } catch { /* битый блок — идём дальше */ }
  }

  // 2. Мета-теги
  for (const key of ['product:price:amount', 'og:price:amount', 'product:sale_price:amount', 'price', 'twitter:data1']) {
    const p = toNumber(metaContent(html, key));
    if (p !== null) return { price: p, source: 'meta' };
  }

  // 3. Цена в заголовке / описании: «Ціна: 695 ₴», «1 299 грн»
  const texts = [
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1],
    metaContent(html, 'og:description'),
    metaContent(html, 'description')
  ].filter(Boolean);
  for (const t of texts) {
    const m = /(\d[\d\s .,]*\d|\d)\s*(?:₴|грн|uah)/i.exec(t) || /(?:ціна|цена|price)[:\s]*(\d[\d\s .,]*\d|\d)/i.exec(t);
    const p = m ? toNumber(m[1]) : null;
    if (p !== null) return { price: p, source: 'text' };
  }

  return { price: null, reason: 'no_price_found' };
}

function looksLikeBotWall(html) {
  return /challenge_passed|cf-browser-verification|just a moment|captcha|access denied/i.test(html.slice(0, 20000))
    && !/application\/ld\+json/i.test(html);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const target = isSafeUrl(String(req.query?.url || ''));
  if (!target) return res.status(400).json({ price: null, reason: 'bad_url' });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(target.href, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'uk-UA,uk;q=0.9,ru;q=0.8,en;q=0.7'
      }
    });
    if (!r.ok) return res.status(200).json({ price: null, reason: 'http_' + r.status });

    const html = (await r.text()).slice(0, MAX_BYTES);
    if (looksLikeBotWall(html)) return res.status(200).json({ price: null, reason: 'blocked' });
    return res.status(200).json(extractPrice(html));
  } catch (err) {
    return res.status(200).json({ price: null, reason: err.name === 'AbortError' ? 'timeout' : 'fetch_failed' });
  } finally {
    clearTimeout(timer);
  }
}