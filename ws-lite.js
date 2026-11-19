// ws-lite — serveur HTTP statique + WebSocket (RFC 6455) sans aucune dépendance.
// Gère : handshake, trames texte masquées/fragmentées, ping/pong, close.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { EventEmitter } = require("events");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp3": "audio/mpeg" };
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

class Socket extends EventEmitter {
  constructor(sock) {
    super(); this.sock = sock; this.buf = Buffer.alloc(0); this.frag = []; this.open = true; this.id = crypto.randomUUID();
    sock.on("data", d => { this.buf = Buffer.concat([this.buf, d]); this._parse(); });
    sock.on("close", () => this._closed()); sock.on("error", () => this._closed());
  }
  _closed() { if (this.open) { this.open = false; this.emit("close"); } }
  _parse() {
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1], fin = b0 & 0x80, op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) return this.close(); // 1 Mo max
      const need = off + (masked ? 4 : 0) + len; if (this.buf.length < need) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = this.buf.subarray(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      this.buf = this.buf.subarray(need);
      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) { this._frame(0xA, payload); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        this.frag.push(payload);
        if (fin) { const msg = Buffer.concat(this.frag).toString("utf8"); this.frag = []; this.emit("message", msg); }
      }
    }
  }
  _frame(op, data) {
    if (!this.open) return;
    const len = data.length; let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    try { this.sock.write(Buffer.concat([head, data])); } catch { this._closed(); }
  }
  send(obj) { this._frame(0x1, Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj))); }
  close() { if (this.open) { this._frame(0x8, Buffer.alloc(0)); this.sock.end(); this._closed(); } }
}

function createServer({ root, port = 3000, api } = {}) {
  const ev = new EventEmitter(); const clients = new Set();
  const server = http.createServer(async (req, res) => {
    if (api && await api(req, res)) return;
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(path.resolve(root))) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end("404"); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" }); res.end(data);
    });
  });
  server.on("upgrade", (req, sock) => {
    const key = req.headers["sec-websocket-key"];
    if (!key) return sock.destroy();
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sock.setNoDelay(true);
    const ws = new Socket(sock); clients.add(ws); ws.on("close", () => clients.delete(ws));
    ev.emit("connection", ws, req);
  });
  ev.clients = clients;
  ev.broadcast = (obj, except) => { const s = typeof obj === "string" ? obj : JSON.stringify(obj); for (const c of clients) if (c !== except) c.send(s); };
  ev.listen = (cb) => server.listen(port, cb);
  ev.close = () => { for (const c of clients) c.close(); server.close(); };
  ev.server = server;
  return ev;
}

function readJson(req) {
  return new Promise((ok, ko) => { let b = ""; req.on("data", d => { b += d; if (b.length > 1e6) req.destroy(); }); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ko(e); } }); });
}
function sendJson(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }

module.exports = { createServer, readJson, sendJson };
