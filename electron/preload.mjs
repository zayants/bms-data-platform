import { contextBridge } from "electron";
import os from "node:os";

const interfaces = Object.values(os.networkInterfaces()).flat();
const address = interfaces.find((item) => item && item.family === "IPv4" && !item.internal)?.address;

contextBridge.exposeInMainWorld("bmsDesktop", {
  computerUrl: address ? `http://${address}:4174` : "",
});
