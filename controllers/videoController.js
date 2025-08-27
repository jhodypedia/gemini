// controllers/videoController.js
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { User, Video } = require("../models");
const { addJob } = require("../utils/queue");
const { renderJob } = require("../worker/renderer");
const { fontsDir } = require("../utils/downloadFonts");

// show set-api-key page
exports.getSetApiKey = async (req, res) => {
  const user = await User.findByPk(req.session.userId);
  res.render("set-apikey", { user });
};

exports.postSetApiKey = async (req, res) => {
  const { apiKey } = req.body;
  await User.update({ geminiApiKey: apiKey || null }, { where: { id: req.session.userId } });
  res.redirect("/generate-video");
};

// show generate form
exports.showGenerate = (req, res) => {
  res.render("video/generate", { user: req.session.username });
};

// create job (queue)
exports.createJob = async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId);
    const prompt = (req.body.prompt || "").trim();
    if (!prompt) return res.render("video/generate", { error: "Prompt is required", user: req.session.username });

    const sizeMap = { reels: "720x1280", landscape: "1920x1080", square: "1080x1080" };
    const size = sizeMap[req.body.size] || "720x1280";
    const duration = Math.max(4, Math.min(60, parseInt(req.body.duration || "8", 10)));
    const kenburns = req.body.kenburns === "on" || req.body.kenburns === "true";
    const fade = req.body.fade === "on" || req.body.fade === "true";

    // Save uploaded images (if any)
    const images = [];
    if (req.files && req.files.images) {
      const arr = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
      for (const f of arr) {
        const dest = path.join(process.cwd(),"public","uploads", `${Date.now()}_${f.name}`);
        await f.mv(dest);
        images.push(dest);
      }
    }

    // audio optional
    let audio = null;
    if (req.files && req.files.audio) {
      const a = req.files.audio;
      const dest = path.join(process.cwd(),"public","uploads", `${Date.now()}_${a.name}`);
      await a.mv(dest);
      audio = dest;
    }

    // output
    const outName = `video_${Date.now()}_${uuidv4()}.mp4`;
    const outFile = path.join(process.cwd(),"public","generated", outName);

    // select font TTF
    let fontFile = path.join(fontsDir, "Poppins-Regular.ttf");
    if (!fs.existsSync(fontFile)) {
      fontFile = process.platform === "win32" ? "C:/Windows/Fonts/Arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
    }

    // build job
    const jobId = uuidv4();
    const job = {
      id: jobId,
      run: async () => {
        // If user has geminiApiKey and we want script from Gemini:
        let textOverlay = "";
        try {
          if (user.geminiApiKey) {
            const { GoogleGenerativeAI } = require("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(user.geminiApiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            // IMPORTANT: we pass prompt **murni** from user
            const result = await model.generateContent(prompt);
            textOverlay = (typeof result?.response?.text === "function") ? await result.response.text() : (result?.response?.text || "");
          }
        } catch (e) {
          console.warn("Gemini fetch failed:", e.message || e);
          textOverlay = ""; // do not fallback or add watermark
        }

        await renderJob({
          images,
          audio,
          duration,
          kenburns,
          fade,
          fontFile,
          size,
          textOverlay,
          outFile
        }, (percent) => {
          // push progress via WS mapped to session
          const map = req.app.locals.wsMap;
          const ws = map.get(req.sessionID);
          if (ws && ws.readyState === 1) ws.send(JSON.stringify({ jobId, status: "rendering", progress: percent, outFile: `/generated/${outName}` }));
        });
      },
      onComplete: async () => {
        // save Video record
        await Video.create({ prompt, videoUrl: `/generated/${outName}`, size: req.body.size || "reels", withImage: images.length>0, UserId: user.id });
        const map = req.app.locals.wsMap;
        const ws = map.get(req.sessionID);
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ jobId, status: "done", progress: 100, outFile: `/generated/${outName}` }));
      },
      onError: (err) => {
        const map = req.app.locals.wsMap;
        const ws = map.get(req.sessionID);
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ jobId, status: "error", message: String(err) }));
      }
    };

    addJob(job);
    // respond: job created
    res.render("video/submitted", { jobId, user: req.session.username });
  } catch (err) {
    console.error(err);
    res.render("video/generate", { error: err.message || "Server error", user: req.session.username });
  }
};

// list generated videos (for current user)
exports.listGenerated = async (req, res) => {
  const vids = await Video.findAll({ where: { UserId: req.session.userId }, order: [["createdAt","DESC"]] });
  res.render("video/generated", { videos: vids, user: req.session.username });
};
