import { inflateRawSync } from "node:zlib";

type HistM15 = {
  snapshotTimeUTC: string;
  openPrice: { bid: number };
  highPrice: { bid: number };
  lowPrice: { bid: number };
  closePrice: { bid: number };
  lastTradedVolume: number;
};

function findEocd(buf: Buffer) {
  const sig = 0x06054b50;
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === sig) return i;
  }
  throw new Error("HISTDATA_ZIP_EOCD_NOT_FOUND");
}

function unzipFirstCsv(buf: Buffer) {
  const eocd = findEocd(buf);
  const entries = buf.readUInt16LE(eocd + 10);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  let p = centralOffset;

  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("HISTDATA_ZIP_CENTRAL_INVALID");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");

    if (name.toLowerCase().endsWith(".csv")) {
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("HISTDATA_ZIP_LOCAL_INVALID");
      const localNameLen = buf.readUInt16LE(localOffset + 26);
      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return compressed.toString("utf8");
      if (method === 8) return inflateRawSync(compressed).toString("utf8");
      throw new Error("HISTDATA_ZIP_METHOD_" + method);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("HISTDATA_CSV_NOT_FOUND");
}

function tokenFromHtml(html: string) {
  const input = html.match(/<input\b[^>]*id=["']tk["'][^>]*>/i)?.[0];
  const token = input?.match(/value=["']([^"']+)["']/i)?.[1];
  if (!token) throw new Error("HISTDATA_TOKEN_NOT_FOUND");
  return token;
}

async function downloadYearZip(year: number) {
  const pair = "xauusd";
  const referer =
    "https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/" +
    pair +
    "/" +
    year;

  const page = await fetch(referer, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 AurumPulseResearch/1.0" }
  });
  if (!page.ok) throw new Error("HISTDATA_PAGE_" + page.status);
  const html = await page.text();
  const token = tokenFromHtml(html);
  const setCookie = page.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : "";

  const form = new URLSearchParams({
    tk: token,
    date: String(year),
    datemonth: String(year),
    platform: "ASCII",
    timeframe: "M1",
    fxpair: "XAUUSD"
  });

  const res = await fetch("https://www.histdata.com/get.php", {
    method: "POST",
    cache: "no-store",
    redirect: "follow",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "https://www.histdata.com",
      "Referer": referer,
      "User-Agent": "Mozilla/5.0 AurumPulseResearch/1.0",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: form.toString()
  });
  if (!res.ok) throw new Error("HISTDATA_DOWNLOAD_" + res.status);
  const raw = Buffer.from(await res.arrayBuffer());
  if (raw.length < 4 || raw.readUInt32LE(0) !== 0x04034b50) {
    const sample = raw.subarray(0, 160).toString("utf8").replace(/\s+/g, " ");
    throw new Error("HISTDATA_NOT_ZIP:" + sample);
  }
  return raw;
}

function histTimeToUtc(stamp: string) {
  // HistData M1 timestamps are fixed EST (UTC-5) without DST.
  const y = Number(stamp.slice(0, 4));
  const mo = Number(stamp.slice(4, 6));
  const d = Number(stamp.slice(6, 8));
  const h = Number(stamp.slice(9, 11));
  const mi = Number(stamp.slice(11, 13));
  const s = Number(stamp.slice(13, 15));
  return Date.UTC(y, mo - 1, d, h + 5, mi, s);
}

function aggregateM15(csv: string) {
  const groups = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();
  let rows = 0;

  for (const line0 of csv.split(/\r?\n/)) {
    const line = line0.trim();
    if (!line) continue;
    const p = line.split(";");
    if (p.length < 5) continue;
    const time = histTimeToUtc(p[0]);
    const open = Number(p[1]);
    const high = Number(p[2]);
    const low = Number(p[3]);
    const close = Number(p[4]);
    const volume = Number(p[5] ?? 0);
    if (![time, open, high, low, close].every(Number.isFinite)) continue;

    const bucket = Math.floor(time / 900000) * 900000;
    const g = groups.get(bucket);
    if (!g) groups.set(bucket, { open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
    else {
      g.high = Math.max(g.high, high);
      g.low = Math.min(g.low, low);
      g.close = close;
      g.volume += Number.isFinite(volume) ? volume : 0;
    }
    rows++;
  }

  const candles: HistM15[] = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, g]) => ({
      snapshotTimeUTC: new Date(time).toISOString(),
      openPrice: { bid: g.open },
      highPrice: { bid: g.high },
      lowPrice: { bid: g.low },
      closePrice: { bid: g.close },
      lastTradedVolume: g.volume
    }));

  return { candles, rows };
}

export async function getHistDataXauM15(year: number) {
  if (!Number.isInteger(year) || year < 2010 || year > 2023) throw new Error("HISTDATA_YEAR_NOT_ALLOWED");
  const zip = await downloadYearZip(year);
  const csv = unzipFirstCsv(zip);
  const parsed = aggregateM15(csv);
  return {
    year,
    zipBytes: zip.length,
    sourceRowsM1: parsed.rows,
    candlesM15: parsed.candles
  };
}
