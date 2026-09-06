import {describe,it,expect} from "vitest";
import {historyPaths,historyContinuity} from "./historyGaps";
const points=[0,1000,2000,100000,101000].map(timestamp=>({timestamp,v:1}));
describe("history gaps",()=>{
  it("breaks lines and fills across missing data",()=>{
    const p=historyPaths(points,p=>p.v,t=>t,v=>v,0,[]);
    expect(p.line.match(/M/g)?.length).toBe(2);
    expect(p.area.match(/Z/g)?.length).toBe(2);
  });
  it("does not join missing values",()=>{
    const p=historyPaths(points.slice(0,3),p=>p.timestamp===1000?null:1,t=>t,v=>v,0,[]);
    expect(p.line.match(/M/g)?.length).toBe(2);
  });
  it("breaks on explicit BMS loss but not Wi-Fi loss after backfill",()=>{
    const event={timestamp:500,type:"LOST" as const,durationMs:null,bmsName:"test"};
    expect(historyContinuity(points,[event])(points[0],points[1])).toBe(false);
    expect(historyContinuity(points,[{...event,source:"gateway"}])(points[0],points[1])).toBe(true);
  });
  it("accepts coarse regularly sampled history",()=>{
    const p=[0,60000,120000].map(timestamp=>({timestamp}));
    expect(historyContinuity(p,[])(p[0],p[1])).toBe(true);
  });
  it("resumes only from the restored sample, not across the outage",()=>{
    const p=[0,1000,2000,3000,4000].map(timestamp=>({timestamp,v:1}));
    const paths=historyPaths(p,p=>p.v,t=>t,v=>v,0,[
      {timestamp:1000,type:"LOST",durationMs:2000,bmsName:"BMS"},
      {timestamp:3000,type:"RESTORED",durationMs:2000,bmsName:"BMS"},
    ]);
    expect(paths.line).not.toContain("L3000.0");
    expect(paths.line).toContain("M3000.0,1.0 L4000.0,1.0");
  });
});
