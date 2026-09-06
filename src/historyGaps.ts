import type { ConnectionHistoryEvent } from "./types";

type Timed = { timestamp: number };
export function historyContinuity<T extends Timed>(points: T[], events: ConnectionHistoryEvent[]) {
  const steps = points.slice(1).map((p,i)=>p.timestamp-points[i].timestamp).filter(n=>n>0).sort((a,b)=>a-b);
  // Respect coarse history buckets; never assume a fixed sampling interval after downsampling.
  const limit = Math.max(15_000, (steps[Math.floor((steps.length-1)/2)] ?? 0)*3);
  const bms = events.filter(e=>e.source!=="gateway").sort((a,b)=>a.timestamp-b.timestamp);
  const losses = bms.filter(e=>e.type==="LOST").map(e=>({
    from:e.timestamp,
    to:bms.find(r=>r.type==="RESTORED"&&r.timestamp>=e.timestamp)?.timestamp ?? Infinity,
  }));
  return (a:T,b:T) => b.timestamp>a.timestamp && b.timestamp-a.timestamp<=limit &&
    !losses.some(g=>a.timestamp<g.to&&b.timestamp>g.from);
}

export function historyPaths<T extends Timed>(points:T[], value:(p:T)=>number|null|undefined,
  x:(timestamp:number)=>number,y:(v:number)=>number,baseline:number,events:ConnectionHistoryEvent[]) {
  const connected=historyContinuity(points,events);
  const segments:Array<Array<{x:number;y:number}>>=[];
  let segment:Array<{x:number;y:number}>=[];
  points.forEach((p,i)=>{
    const v=value(p);
    if(v==null||!Number.isFinite(v)) {segment=[];return;}
    if(!segment.length || i>0&&!connected(points[i-1],p)) {segment=[];segments.push(segment);}
    segment.push({x:x(p.timestamp),y:y(v)});
  });
  const line=(s:Array<{x:number;y:number}>)=>s.map((p,i)=>`${i?"L":"M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return {
    line:segments.map(line).join(" "),
    area:segments.filter(s=>s.length>1).map(s=>`${line(s)} L${s.at(-1)!.x.toFixed(1)},${baseline.toFixed(1)} L${s[0].x.toFixed(1)},${baseline.toFixed(1)} Z`).join(" "),
  };
}
