import { contextBridge } from "electron";
import os from "node:os";

const virtualName = /virtual|vmware|vbox|hyper-v|vethernet|tailscale|zerotier|vpn|loopback/i;
const candidates = Object.entries(os.networkInterfaces())
  .flatMap(([name, items]) => (items || []).map((item) => ({ name, ...item })))
  .filter((item) => item.family === "IPv4" && !item.internal && !item.address.startsWith("169.254."))
  .sort((a, b) => Number(virtualName.test(a.name)) - Number(virtualName.test(b.name)));
const urls = [...new Set(candidates.map((item) => `http://${item.address}:4174`))];

contextBridge.exposeInMainWorld("bmsDesktop", {
  computerUrl: urls[0] || "",
  computerUrls: urls,
});
