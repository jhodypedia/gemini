// server.js
const express = require("express");
const path = require("path");
const session = require("express-session");
const SequelizeStore = require("connect-session-sequelize")(session.Store);
const http = require("http");
const WebSocket = require("ws");
const fileUpload = require("express-fileupload");

const { sequelize, initModels } = require("./models");
const { ensureFonts } = require("./utils/downloadFonts");

// routes
const authRoutes = require("./routes/auth");
const videoRoutes = require("./routes/video");
const adminRoutes = require("./routes/admin");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// view engine
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

// static
app.use("/public", express.static(path.join(process.cwd(), "public")));
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));
app.use("/generated", express.static(path.join(process.cwd(), "public", "generated")));
app.use("/fonts", express.static(path.join(process.cwd(), "public", "fonts")));

// body
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(fileUpload());

// init db & fonts
(async () => {
  await ensureFonts();
  await initModels();
})();

// session store
const sessionStore = new SequelizeStore({ db: sequelize });
app.use(session({
  secret: process.env.SESSION_SECRET || "supersessionsecret",
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));
sessionStore.sync();

// WebSocket map: sessionId -> ws
const wsMap = new Map();
wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "hello" && data.sessionId) {
        ws.sessionId = data.sessionId;
        wsMap.set(data.sessionId, ws);
      }
    } catch (e) {}
  });
  ws.on("close", () => {
    if (ws.sessionId) wsMap.delete(ws.sessionId);
  });
});
app.locals.wsMap = wsMap;

// mount routes
app.use("/", authRoutes);
app.use("/", videoRoutes);
app.use("/", adminRoutes);

// index
app.get("/", (req, res) => {
  if (req.session && req.session.userId) return res.redirect("/generate-video");
  return res.redirect("/auth/login");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log(`Server running on http://localhost:${PORT}`));
