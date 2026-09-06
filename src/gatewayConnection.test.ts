import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {GatewayClient} from "./gateway";

class FakeEvents {
  static latest:FakeEvents;
  onerror:(()=>void)|null=null;
  onopen:(()=>void)|null=null;
  constructor(){FakeEvents.latest=this;}
  addEventListener(){}
  close(){}
}

describe("gateway connection health",()=>{
  let client:GatewayClient;
  const received=vi.fn(),online=vi.fn();
  beforeEach(()=>{
    vi.useFakeTimers();vi.setSystemTime(100000);
    vi.stubGlobal("window",globalThis);vi.stubGlobal("EventSource",FakeEvents);
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({compatibilityId:2})}));
    received.mockClear();online.mockClear();
    client=new GatewayClient("http://phone",received,online);
  });
  afterEach(()=>{client.stop();vi.useRealTimers();vi.unstubAllGlobals();});
  it("does not report a Wi-Fi loss when SSE reconnects but HTTP works",async()=>{
    client.start();await vi.advanceTimersByTimeAsync(1);
    online.mockClear();FakeEvents.latest.onerror?.();await vi.advanceTimersByTimeAsync(1);
    expect(online).toHaveBeenCalledWith(true);
    expect(online).not.toHaveBeenCalledWith(false);
  });
  it("reports a sustained network failure and its recovery",async()=>{
    client.start();await vi.advanceTimersByTimeAsync(1);
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    online.mockClear();await vi.advanceTimersByTimeAsync(6000);
    expect(online).not.toHaveBeenCalledWith(false);
    await vi.advanceTimersByTimeAsync(3000);expect(online).toHaveBeenLastCalledWith(false);
    vi.mocked(fetch).mockResolvedValue({ok:true,status:200,json:async()=>({compatibilityId:2})} as Response);
    await vi.advanceTimersByTimeAsync(3000);expect(online).toHaveBeenLastCalledWith(true);
  });
  it("ignores an in-flight response after stopping the client",async()=>{
    let resolve!:(response:Response)=>void;
    vi.mocked(fetch).mockReturnValue(new Promise(r=>{resolve=r;}));
    client.start();client.stop();
    resolve({ok:true,json:async()=>({compatibilityId:2})} as Response);
    await vi.advanceTimersByTimeAsync(1);expect(received).not.toHaveBeenCalled();
  });
});
