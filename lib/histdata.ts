import { inflateRawSync } from "node:zlib";

export type HistCandle={time:number;open:number;high:number;low:number;close:number;volume:number};

function findEocd(buf:Buffer){
  for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50)return i;
  throw new Error("HISTDATA_ZIP_EOCD_NOT_FOUND");
}
function unzipCsv(buf:Buffer){
  const eocd=findEocd(buf),entries=buf.readUInt16LE(eocd+10),centralOffset=buf.readUInt32LE(eocd+16);
  let p=centralOffset;
  for(let e=0;e<entries;e++){
    if(buf.readUInt32LE(p)!==0x02014b50)throw new Error("HISTDATA_ZIP_CENTRAL_INVALID");
    const method=buf.readUInt16LE(p+10),compSize=buf.readUInt32LE(p+20);
    const nameLen=buf.readUInt16LE(p+28),extraLen=buf.readUInt16LE(p+30),commentLen=buf.readUInt16LE(p+32),localOffset=buf.readUInt32LE(p+42);
    const name=buf.subarray(p+46,p+46+nameLen).toString("utf8");
    if(name.toLowerCase().endsWith(".csv")){
      if(buf.readUInt32LE(localOffset)!==0x04034b50)throw new Error("HISTDATA_ZIP_LOCAL_INVALID");
      const ln=buf.readUInt16LE(localOffset+26),le=buf.readUInt16LE(localOffset+28),start=localOffset+30+ln+le;
      const compressed=buf.subarray(start,start+compSize);
      const data=method===0?compressed:method===8?inflateRawSync(compressed):null;
      if(!data)throw new Error("HISTDATA_ZIP_METHOD_UNSUPPORTED");
      return data.toString("utf8");
    }
    p+=46+nameLen+extraLen+commentLen;
  }
  throw new Error("HISTDATA_CSV_NOT_FOUND");
}
async function downloadYear(year:number){
  const referer=`https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/xauusd/${year}`;
  const page=await fetch(referer,{headers:{"User-Agent":"Mozilla/5.0"},cache:"no-store"});
  if(!page.ok)throw new Error(`HISTDATA_PAGE_${page.status}`);
  const html=await page.text(),tag=html.match(/<input[^>]*\bid=["']tk["'][^>]*>/i)?.[0];
  const token=tag?.match(/\bvalue=["']([^"']+)["']/i)?.[1];
  if(!token)throw new Error("HISTDATA_TOKEN_NOT_FOUND");
  const body=new URLSearchParams({tk:token,date:String(year),datemonth:String(year),platform:"ASCII",timeframe:"M1",fxpair:"XAUUSD"});
  const res=await fetch("https://www.histdata.com/get.php",{method:"POST",headers:{
    "User-Agent":"Mozilla/5.0","Referer":referer,"Origin":"https://www.histdata.com",
    "Content-Type":"application/x-www-form-urlencoded"
  },body:body.toString(),cache:"no-store"});
  if(!res.ok)throw new Error(`HISTDATA_DOWNLOAD_${res.status}`);
  const b=Buffer.from(await res.arrayBuffer());
  if(b.length<1000)throw new Error("HISTDATA_DOWNLOAD_TOO_SMALL");
  return unzipCsv(b);
}
function parseLine(line:string):HistCandle|null{
  const x=line.trim().split(";");if(x.length<5)return null;
  const s=x[0],m=s.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2})(\d{2})(\d{2})$/);if(!m)return null;
  const localEst=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]),time=localEst+5*3600000;
  const open=+x[1],high=+x[2],low=+x[3],close=+x[4],volume=+(x[5]||0);
  if(![open,high,low,close].every(Number.isFinite))return null;
  return{time,open,high,low,close,volume:Number.isFinite(volume)?volume:0};
}
function aggregate(rows:HistCandle[],minutes:number){
  const size=minutes*60000,out:HistCandle[]=[];let key=-1,g:HistCandle[]=[];
  const flush=()=>{if(!g.length)return;out.push({time:key,open:g[0].open,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),close:g[g.length-1].close,volume:g.reduce((s,x)=>s+x.volume,0)});g=[]};
  for(const c of rows){const k=Math.floor(c.time/size)*size;if(k!==key){flush();key=k}g.push(c)}flush();return out;
}
function daily(rows:HistCandle[]){
  const out:HistCandle[]=[];let key="",g:HistCandle[]=[];
  const flush=()=>{if(!g.length)return;const d=new Date(g[0].time);out.push({time:Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()),open:g[0].open,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),close:g[g.length-1].close,volume:g.reduce((s,x)=>s+x.volume,0)});g=[]};
  for(const c of rows){const d=new Date(c.time),k=`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;if(k!==key){flush();key=k}g.push(c)}flush();return out;
}
function capitalShape(c:HistCandle){const v=(n:number)=>({bid:n,ask:n});return{snapshotTimeUTC:new Date(c.time).toISOString(),openPrice:v(c.open),highPrice:v(c.high),lowPrice:v(c.low),closePrice:v(c.close),lastTradedVolume:c.volume}}
export async function getHistDataForLab(year:number){
  const [prev,cur]=await Promise.all([downloadYear(year-1),downloadYear(year)]);
  const rows=(prev+"\n"+cur).split(/\r?\n/).map(parseLine).filter((x):x is HistCandle=>!!x).sort((a,b)=>a.time-b.time);
  const m5=aggregate(rows,5),d=daily(rows);
  return{m5:m5.map(capitalShape),daily:d.map(capitalShape),rawMinutes:rows.length,from:new Date(rows[0].time).toISOString(),to:new Date(rows.at(-1)!.time).toISOString()};
}
