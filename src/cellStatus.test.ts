import { describe, expect, it } from "vitest";
import { classifyCell } from "./cellStatus";
import type { GatewaySnapshot } from "./types";

function snapshot(cellsV:number[],chemistry:string):GatewaySnapshot{return {apiVersion:1,serverTime:Date.now(),available:true,connected:true,stale:false,ageMs:0,deviceName:"JK",deviceAddress:"",connectionStatus:"",cellsV,chemistry};}

describe("classifyCell",()=>{
  it("does not mark normal NMC voltage as an LFP over-voltage",()=>expect(classifyCell(snapshot([3.68,3.67],"Li-ion"),0).severity).toBe("normal"));
  it("warns at the LFP upper diagnostic threshold",()=>expect(classifyCell(snapshot([3.41,3.40],"LFP"),0)).toMatchObject({severity:"warning",reason:"high"}));
  it("uses relative deviation for unknown chemistry",()=>expect(classifyCell(snapshot([3.20,3.25,3.25],"unknown"),0)).toMatchObject({severity:"warning",reason:"deviation"}));
  it("marks disconnected data as stale",()=>{const value=snapshot([3.3,3.3],"LFP");value.connected=false;expect(classifyCell(value,0).severity).toBe("stale");});
  it("shows inferred balancing roles",()=>{const value=snapshot([3.30,3.34],"LFP");value.balancing=true;expect(classifyCell(value,0).balanceRole).toBe("receiving");expect(classifyCell(value,1).balanceRole).toBe("donating");});
});
