// controllers/videoController.js
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { v4: uuidv4 } = require("uuid");
const { wrapText, sanitizeForDrawtext } = require("../utils/text");

const GENERATED_DIR = path.join(__dirname, "..", "generated");
if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });

// send websocket update to this session
function sendWs(req, videoId, payload){
  try{
    const map = req.app.locals.wsMap;
    const ws = map.get(req.sessionID);
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ videoId, ...payload }));
  }catch(e){ console.error("ws send err", e); }
}

exports.setKey = (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ success:false, message:"apiKey required" });
  req.session.geminiKey = apiKey.trim();
  res.json({ success:true });
};

exports.me = (req, res) => {
  res.json({ success:true, hasKey: !!req.session.geminiKey, sessionId: req.sessionID });
};

exports.uploadAssets = (req, res) => {
  const images = (req.files?.images || []).map(f => `/uploads/${path.basename(f.path)}`);
  const audio = req.files?.audio?.[0] ? `/uploads/${path.basename(req.files.audio[0].path)}` : null;
  res.json({ success:true, images, audio });
};

exports.listVideos = (req, res) => {
  const files = fs.readdirSync(GENERATED_DIR).filter(f => f.endsWith(".mp4"))
    .sort((a,b) => fs.statSync(path.join(GENERATED_DIR,b)).mtimeMs - fs.statSync(path.join(GENERATED_DIR,a)).mtimeMs)
    .map(f => `/generated/${f}`);
  res.json({ success:true, files });
};

/**
 * generateVeoN
 * - Accepts form fields: prompt, preset, ratio, fontName, kenburns, fade, total, duration
 * - Can accept uploaded images/audio or imagesJson/audioUrl
 */
exports.generateVeoN = async (req, res) => {
  try {
    const geminiKey = req.session.geminiKey;
    const body = req.body || {};
    const prompt = body.prompt || "Topik singkat menarik";
    const preset = body.preset || "reel";
    const ratio = body.ratio || "9:16";
    const kenburns = (body.kenburns === "true" || body.kenburns === "on");
    const fade = (body.fade === "true" || body.fade === "on");
    const fontName = body.fontName || "";
    const duration = Math.max(4, Math.min(60, parseInt(body.duration || "8", 10)));
    const total = Math.max(1, Math.min(50, parseInt(body.total || "10", 10))); // up to 50 videos
    const wordsTarget = Math.max(20, Math.min(200, parseInt(body.wordsTarget || "60", 10)));

    // images: uploaded in this request or imagesJson listing
    const uploaded = (req.files?.images || []).map(f => path.join(__dirname, "..", "uploads", path.basename(f.path)));
    const bodyImages = (() => {
      try {
        if (!body.imagesJson) return [];
        const arr = JSON.parse(body.imagesJson);
        if (!Array.isArray(arr)) return [];
        return arr.map(u => path.join(__dirname, "..", u.replace(/^\//,"")));
      } catch(e) { return []; }
    })();
    const images = uploaded.length ? uploaded : bodyImages;

    // audio
    const audioLocal = (req.files?.audio?.[0]) ? path.join(__dirname, "..", "uploads", path.basename(req.files.audio[0].path)) : (body.audioUrl ? path.join(__dirname, "..", body.audioUrl.replace(/^\//,"")) : null);

    // find font file in /fonts by contains fontName
    const fontsDir = path.join(__dirname, "..", "public", "fonts");
    const fontFile = (() => {
      if (!fontName) return null;
      try {
        const files = fs.readdirSync(fontsDir);
        const found = files.find(f => f.toLowerCase().includes(fontName.toLowerCase()));
        return found ? path.join(fontsDir, found) : null;
      } catch(e) { return null; }
    })();

    // decide target size
    function sizeFromRatio(r){
      if (r === "9:16") return "720x1280";
      if (r === "1:1") return "1080x1080";
      return "1920x1080";
    }
    const size = sizeFromRatio(ratio);
    const [W,H] = size.split("x").map(v => parseInt(v,10));

    // Prepare immediate response with jobIds — actual render will be done sequentially here.
    const jobIds = [];
    const outputs = [];

    // We'll process sequentially to avoid overloading CPU.
    for (let i = 0; i < total; i++){
      const videoId = uuidv4();
      jobIds.push(videoId);
      sendWs(req, videoId, { status: "starting", progress: 2, message: "Job created" });

      // 1) get script from Gemini (or fallback)
      let scriptText = `Demo script for: ${prompt} (video ${i+1})`;
      try {
        if (geminiKey) {
          sendWs(req, videoId, { status: "generating_script", progress: 5, message: "Generating script via Gemini..." });
          const genAI = new GoogleGenerativeAI(geminiKey);
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
          const finalPrompt = `Buatkan naskah singkat untuk overlay teks video. Gaya ringkas, sekitar ${wordsTarget} kata. Topik: ${prompt} (variant ${i+1})`;
          const result = await model.generateContent(finalPrompt);
          scriptText = (typeof result?.response?.text === "function") ? result.response.text() : (result?.response?.text || scriptText);
        }
      } catch(err) {
        console.warn("Gemini error:", err.message || err);
        scriptText = `Fallback script: ${prompt} (video ${i+1})`;
      }

      const wrapped = wrapText(scriptText, Math.max(20, Math.floor(W/22)));
      const drawText = sanitizeForDrawtext(wrapped);

      // 2) Build ffmpeg command
      const outFile = path.join(GENERATED_DIR, `${videoId}.mp4`);
      const perSlide = images.length ? Math.max(2, Math.floor(duration / images.length)) : duration;

      // build fluent-ffmpeg chain
      const cmd = ffmpeg();

      if (images.length === 0) {
        // create color slides fallback (3 colors)
        cmd.input(`color=c=0x0077b6:s=${size}:d=${duration}`).inputOptions(["-f", "lavfi"]);
      } else {
        for (const img of images) {
          cmd.input(img).inputOptions(["-loop", "1"]);
        }
      }

      // audio or dummy
      if (audioLocal) {
        cmd.input(audioLocal);
      } else {
        cmd.input("anullsrc=channel_layout=stereo:sample_rate=44100").inputOptions(["-f", "lavfi"]);
      }

      // filters
      const filters = [];
      const videoLabels = [];

      if (images.length === 0) {
        filters.push(`[0:v]scale=${W}:${H},setsar=1,trim=duration=${duration},setpts=PTS-STARTPTS[v0]`);
        videoLabels.push("[v0]");
      } else {
        for (let idx=0; idx<images.length; idx++){
          const inIndex = idx;
          const vlab = `v${idx}`;
          filters.push(`[${inIndex}:v]scale=w=${W}:h=${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${perSlide},setpts=PTS-STARTPTS[${vlab}]`);
          if (kenburns) {
            // simple zoompan on same input — use zoompan only if image input; fluent-ffmpeg complexity: we attempt simple zoompan variant (may be approximated)
            const kb = `kb${idx}`;
            const frames = Math.max(25, Math.floor(perSlide * 25));
            filters.push(`[${inIndex}:v]zoompan=z='min(zoom+0.0009,1.1)':d=${frames}:s=${W}x${H}[${kb}]`);
            videoLabels.push(`[${kb}]`);
          } else {
            videoLabels.push(`[${vlab}]`);
          }
        }
      }

      if (videoLabels.length === 1) {
        filters.push(`${videoLabels[0]}format=yuv420p[vconcat]`);
      } else {
        filters.push(`${videoLabels.join('')}concat=n=${videoLabels.length}:v=1:a=0[vconcat]`);
      }

      if (fade) {
        filters.push(`[vconcat]fade=t=in:st=0:d=0.6,fade=t=out:st=${duration-0.7}:d=0.7,format=yuv420p[vf]`);
      } else {
        filters.push(`[vconcat]format=yuv420p[vf]`);
      }

      // drawtext overlay
      const fontfile = fontFile || (process.platform === "win32" ? "C:/Windows/Fonts/arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
      const fontSize = Math.max(28, Math.floor(W / 28));
      const yPos = "(h-text_h)/2";
      const draw = `[vf]drawtext=fontfile='${fontfile}':text='${drawText}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=${yPos}[vout]`;
      filters.push(draw);

      cmd.complexFilter(filters, ["vout"]);

      // map audio input index: if there were N images -> audio index = N, else 1
      const audioInputIndex = images.length ? images.length : 1;

      cmd.outputOptions([
        "-map [vout]",
        `-map ${audioInputIndex}:a`,
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-preset veryfast",
        `-t ${duration}`,
        "-c:a aac",
        "-b:a 160k",
        "-movflags +faststart"
      ]);

      cmd.size(size).fps(25);

      // progress handler
      cmd.on("progress", p => {
        let percent = 0;
        try {
          const tm = p.timemark || "00:00:00";
          const parts = tm.split(":").map(parseFloat).reverse();
          let seconds = 0;
          if (parts[0]) seconds += parts[0];
          if (parts[1]) seconds += parts[1]*60;
          if (parts[2]) seconds += parts[2]*3600;
          percent = Math.min(98, Math.round((seconds / duration) * 100));
        } catch(e) { percent = 10; }
        sendWs(req, videoId, { status: "rendering", progress: percent, message: `Rendering ${percent}%` });
      });

      await new Promise((resolve) => {
        cmd.save(outFile)
          .on("start", ()=> sendWs(req, videoId, { status: "started", progress: 5, message: "FFmpeg started" }))
          .on("end", ()=> {
            sendWs(req, videoId, { status: "done", progress: 100, message: "Completed", output: `/generated/${path.basename(outFile)}` });
            outputs.push(`/generated/${path.basename(outFile)}`);
            resolve();
          })
          .on("error", (err)=> {
            console.error("FFmpeg error:", err);
            sendWs(req, videoId, { status: "error", progress: 0, message: String(err) });
            // still resolve to continue next jobs
            resolve();
          });
      });

    } // end for

    // return outputs (may be populated) and jobIds
    return res.json({ success:true, jobIds, files: outputs });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success:false, message: String(err) });
  }
};
