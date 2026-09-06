import {afterEach,expect,it,vi} from "vitest";
import {fetchSynchronizedGatewayHistory} from "./historySync";
import {loadCacheMeta,readCachedHistory,storeHistorySideData} from "./historyCache";

vi.mock("./historyCache",()=>({
  loadCacheMeta:vi.fn(),readCachedHistory:vi.fn(),storeHistorySideData:vi.fn(),
  mergeCoverage:vi.fn(),missingCoverage:vi.fn(),saveCacheMeta:vi.fn(),storeHistoryPoints:vi.fn(),
}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it("refreshes connection events beyond an unchanged telemetry cursor",async()=>{
  vi.stubGlobal("localStorage",{getItem:()=>null,setItem:()=>{}});
  vi.mocked(loadCacheMeta).mockResolvedValue({deviceKey:"AA",deviceName:"BMS",gatewayUrl:"http://phone",coverage:[{from:100,to:200}],phoneOldestTimestamp:100,phoneNewestTimestamp:200,lastSyncAt:Date.now()});
  const event={timestamp:250,type:"LOST",durationMs:null,bmsName:"BMS"};
  const cached={points:[{timestamp:200}],pointCount:1,connectionEvents:[event]};
  vi.mocked(readCachedHistory).mockResolvedValue(cached as never);
  const request=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({deviceAddress:"AA",deviceName:"BMS",oldestTimestamp:100,newestTimestamp:200,recordCount:1})})
    .mockResolvedValueOnce({ok:true,json:async()=>({points:[],connectionEvents:[event]})});
  vi.stubGlobal("fetch",request);
  const history=await fetchSynchronizedGatewayHistory("http://phone",100,300,500);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][0]).toContain("to=300");
  expect(storeHistorySideData).toHaveBeenCalledWith("AA",expect.objectContaining({connectionEvents:[event]}));
  expect(history.connectionEvents).toEqual([event]);
});
