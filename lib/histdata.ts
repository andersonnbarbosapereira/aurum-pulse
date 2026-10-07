
import { inflateRawSync } from "node:zlib";

type M15 = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

function extractCsvFromZip(buf: Buffer) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("HISTDATA_ZIP_EOCD_NOT_FOUND");

  const entries = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error("HISTDATA_ZIP_CENTRAL_DIR_INVALID");
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");

    if (name.toLowerCase().endsWith(".csv")) {
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("HISTDATA_ZIP_LOCAL_HEADER_INVALID");
      const localNameLen = buf.readUInt16LE(localOffset + 26);
      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = buf.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed.toString("utf8");
      if (method === 8) return inflateRawSync(compressed).toString("utf8");
      throw new Error("HISTDATA_ZIP_COMPRESSION_UNSUPPORTED_" + method);
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("HISTDATA_ZIP_CSV_NOT_FOUND");
}

function tokenFromHtml(html: string) {
  const direct = html.match(/name=["']tk["'][^>]*value=["']([^"']+)["']/i);
  if (direct?.[1]) return direct[1];
  const reverse = html.match(/value=["']([^"']+)["'][^>]*name=["']tk["']/i);
  if (reverse?.[1]) return reverse[1];
  throw new Error("HISTDATA_TOKEN_NOT_FOUND");
}

export async function fetchHistDataYear(pair: string, year: number) {
  const p = pair.toLowerCase();
  const pageUrl = `https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/${p}/${year}`;
  const baseHeaders = {
    "User-Agent": "Mozilla/5.0 (compatible; AurumPulseResearch/1.0)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };

  const page = await fetch(pageUrl, { headers: baseHeaders, cache: "no-store" });
  if (!page.ok) throw new Error(`HISTDATA_PAGE_${page.status}`);
  const html = await page.text();
  const tk = tokenFromHtml(html);
  const cookie = page.headers.get("set-cookie") || "";

  const body = new URLSearchParams({
    tk,
    date: String(year),
    datemonth: String(year),
    platform: "ASCII",
    timeframe: "M1",
    fxpair: pair.toUpperCase()
  });

  const download = await fetch("https://www.histdata.com/get.php", {
    method: "POST",
    headers: {
      ...baseHeaders,
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "https://www.histdata.com",
      "Referer": pageUrl,
      ...(cookie ? { Cookie: cookie } : {})
    },
    body,
    cache: "no-store"
  });

  if (!download.ok) throw new Error(`HISTDATA_DOWNLOAD_${download.status}`);
  const zip = Buffer.from(await download.arrayBuffer());
  if (zip.length < 1000 || zip.readUInt16LE(0) !== 0x4b50) throw new Error("HISTDATA_DOWNLOAD_NOT_ZIP");
  return extractCsvFromZip(zip);
}

export function histDataM1ToM15(csv: string): M15[] {
  const buckets = new Map<number, M15>();
  const lines = csv.split(/\r?\n/);

  for (const line of lines) {
    if (!line) continue;
    const p = line.split(";");
    if (p.length < 5) continue;
    const dt = p[0];
    if (dt.length < 15 || dt[8] !== " ") continue;

    const y = Number(dt.slice(0, 4));
    const mo = Number(dt.slice(4, 6));
    const d = Number(dt.slice(6, 8));
    const h = Number(dt.slice(9, 11));
    const mi = Number(dt.slice(11, 13));
    const sec = Number(dt.slice(13, 15));
    const open = Number(p[1]);
    const high = Number(p[2]);
    const low = Number(p[3]);
    const close = Number(p[4]);
    if (![y, mo, d, h, mi, sec, open, high, low, close].every(Number.isFinite)) continue;

    // HistData Generic ASCII timestamps are fixed EST (UTC-5), without DST adjustments.
    const utc = Date.UTC(y, mo - 1, d, h + 5, mi, sec);
    const key = Math.floor(utc / 900_000) * 900_000;
    const cur = buckets.get(key);
    if (!cur) {
      buckets.set(key, { time: key, open, high, low, close });
    } else {
      cur.high = Math.max(cur.high, high);
      cur.low = Math.min(cur.low, low);
      cur.close = close;
    }
  }

  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

export function toCapitalLikeRaw(rows: M15[]) {
  return rows.map((x) => ({
    snapshotTimeUTC: new Date(x.time).toISOString(),
    openPrice: { bid: x.open },
    highPrice: { bid: x.high },
    lowPrice: { bid: x.low },
    closePrice: { bid: x.close }
  }));
}
