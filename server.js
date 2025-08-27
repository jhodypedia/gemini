// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const expressLayouts = require("express-ejs-layouts");
const http = require("http");
const WebSocket = require("ws");
const fetch = require("node-fetch");

// routes
const videoRoutes = require("./routes/video");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ensure folders
["public/fonts","uploads","generated"].forEach(d=>{
  const p = path.join(__dirname, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ===== Auto-download fonts (if not exist) =====
const fontsToDownload = [
  {
    name: "Poppins-Regular",
    url: "https://fonts.gstatic.com/s/poppins/v20/pxiEyp8kv8JHgFVrJJfecnFHGPc.woff2",
    file: "Poppins-Regular.woff2"
  },
  {
    name: "Roboto-Regular",
    url: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.woff2",
    file: "Roboto-Regular.woff2"
  }
];

(async function downloadFonts(){
  for (const f of fontsToDownload) {
    const dest = path.join(__dirname, "public", "fonts", f.file);
    if (fs.existsSync(dest)) {
      console.log(`Font ${f.file} exists — skip.`);
      continue;
    }
    try {
      console.log(`Downloading font ${f.name} ...`);
      const res = await fetch(f.url);
      if (!res.ok) { console.warn(`Failed to download ${f.name}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      console.log(`Saved ${dest}`);
    } catch (err) {
      console.warn("Font download error:", err.message || err);
    }
  }
})();

// ===== Middlewares & static =====
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/generated", express.static(path.join(__dirname, "generated")));
app.use("/fonts", express.static(path.join(__dirname, "public", "fonts")));

app.use(session({
  secret: process.env.SESSION_SECRET || "verysecret",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 6 }
}));

app.use(expressLayouts);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layouts/main");

// WebSocket simple mapping
const wsMap = new Map();
wss.on("connection", (ws) => {
  ws.on("message", msg => {
    try {
      const d = JSON.parse(msg.toString());
      if (d.type === "hello" && d.sessionId) {
        ws.sessionId = d.sessionId;
        wsMap.set(d.sessionId, ws);
      }
    } catch(e){}
  });
  ws.on("close", () => {
    if (ws.sessionId) wsMap.delete(ws.sessionId);
  });
});
app.locals.wsMap = wsMap;

// routes
app.use("/", videoRoutes);

// simple homepage redirect to dashboard
app.get("/", (req, res) => res.redirect("/dashboard"));

// start
const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log(`Server running: http://localhost:${PORT}`));
