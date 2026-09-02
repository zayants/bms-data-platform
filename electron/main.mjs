import { app, BrowserWindow, dialog, Menu } from "electron";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webRoot = path.join(root, "dist");
let webServer;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) app.quit();
app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

function startWebServer() {
  return new Promise((resolve, reject) => {
    webServer = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const candidate = path.resolve(webRoot, relative);
    const safe = candidate.startsWith(webRoot + path.sep) ? candidate : path.join(webRoot, "index.html");
    const file = fs.existsSync(safe) && fs.statSync(safe).isFile() ? safe : path.join(webRoot, "index.html");
    const ext = path.extname(file);
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
    });
    webServer.once("error", reject);
    webServer.listen(4174, "0.0.0.0", () => {
      webServer.off("error", reject);
      resolve();
    });
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 380,
    minHeight: 620,
    backgroundColor: "#f3f1ef",
    show: false,
    title: "BMS Data Platform",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // The preload reads the local network interface to show the phone URL and QR code.
      sandbox: false,
      preload: path.join(root, "electron", "preload.mjs"),
    },
  });
  Menu.setApplicationMenu(null);
  window.loadURL("http://127.0.0.1:4174/");
  window.once("ready-to-show", () => window.show());
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  try {
    await startWebServer();
    createWindow();
  } catch (error) {
    dialog.showErrorBox("BMS Data Platform", `Unable to start the local monitor on port 4174. Close the other program using this port and try again.\n\n${error instanceof Error ? error.message : String(error)}`);
    app.quit();
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
