// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const session = require("express-session");
const expressLayouts = require("express-ejs-layouts");
const http = require("http");
const WebSocket = require("ws");

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ensure folders
["uploads","generated","fonts","public"].forEach(d=>{
  const p = path.join(__dirname, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p);
});

// middlewares
app.use(express.json({limit:"50mb"}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/generated", express.static(path.join(__dirname, "generated")));
app.use("/fonts", express.static(path.join(__dirname, "fonts")));
app.use("/public", express.static(path.join(__dirname, "public")));

app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 6 }
}));

app.use(expressLayouts);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layouts/main");

// store map sessionId -> ws
const wsMap = new Map();
wss.on("connection", (ws, req) => {
  // client should send JSON {type: 'hello', sessionId: '...'}
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "hello" && data.sessionId) {
        wsMap.set(data.sessionId, ws);
        ws.sessionId = data.sessionId;
      }
    } catch (e) {}
  });

  ws.on("close", () => {
    if (ws.sessionId) wsMap.delete(ws.sessionId);
  });
});

// attach wsMap to app locals so controllers can use
app.locals.wsMap = wsMap;

// routes
const videoRoutes = require("./routes/video");
app.use("/", videoRoutes);

// start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
