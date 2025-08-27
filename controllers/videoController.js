// controllers/videoController.js
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");
const { wrapText, sanitizeForDrawtext } = require("../utils/text");

const GENERATED_DIR = path.join(__dirname, "../generated");
const UPLOADS_DIR = path.join(__dirname, "../uploads");
const FONTS_DIR = path.join(__dirname, "../fonts");

// ensure generated folder
if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR);

// util: pick size from preset
function sizeFromPreset(preset, customW, customH) {
  if (customW && customH) return `${customW}x${customH}`;
  switch (preset) {
    case "reel": return "1080x1920";
    case "short": return "1080x1920";
    case "square": return "1080x1080";
    default: return "1920x1080";
  }
}

// util: choose font file path: fontName expected as filename in /fonts (without extension optionally)
function findFontFile(fontName) {
  if (!fontName) return null;
  const candidates = fs.readdirSync(FONTS_DIR);
  const found = candidates.find(f => f.toLowerCase().includes(fontName.toLowerCase()));
  if (found) return path.join(FONTS_DIR, found);
  return null;
}

// download fonts list from Google Fonts if key provided
exports.fetchFonts = async (req, res) => {
  try {
    const key = process.env.GOOGLE_FONTS_API_KEY;
    if (!key) {
      // return curated list
      return res.json({ success:true, fonts: [
        "Roboto","Inter","Poppins","Montserrat","Lato","Open Sans","Playfair Display","Merriweather","Oswald"
      ]});
    }
    const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${key}&sort=popularity`;
    const r = await fetch(url);
    const j = await r.json();
    const families = (j.items || []).map(i => i.family).slice(0, 200);
    return res.json({ success:true, fonts: families });
  } catch (err) {
    return res.json({ success:false, message: String(err) });
  }
};

// set API key to session
exports.setKey = (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ success:false, message:"apiKey kosong" });
  req.session.geminiKey = apiKey.trim();
  return res.json({ success:true, message:"API key tersimpan di session." });
};

exports.me = (req, res) => {
  res.json({ success:true, hasKey: Boolean(req.session.geminiKey), sessionId: req.sessionID });
};

exports.uploadAssets = (req, res) => {
  const images = (req.files?.images || []).map(f => `/uploads/${path.basename(f.path)}`);
  const audio = req.files?.audio?.[0] ? `/uploads/${path.basename(req.files.audio[0].path)}` : null;
  res.json({ success:true, images, audio });
};

exports.listVideos = (req, res) => {
  const files = fs.readdirSync(GENERATED_DIR)
    .filter(f => f.endsWith(".mp4"))
    .sort((a,b) => fs.statSync(path.join(GENERATED_DIR,b)).mtimeMs - fs.statSync(path.join(GENERATED_DIR,a)).mtimeMs)
    .map(f => `/generated/${f}`);
  res.json({ success:true, files });
};

// core: generateVideos
exports.generateVideos = async (req, res) => {
  try {
    const geminiKey = req.session.geminiKey;
    if (!geminiKey) return res.status(401).json({ success:false, message:"Set API key Gemini dulu." });

    // read input params
    const body = req.body || {};
    const prompt = body.prompt || "Topik umum singkat yang menarik";
    const preset = body.preset || "reel";
    const total = Math.max(1, Math.min(30, parseInt(body.total || "1",10)));
    const duration = Math.max(4, Math.min(120, parseInt(body.duration || "8",10)));
    const fontName = body.fontName || ""; // expected user selects a font, server looks into /fonts
    const position = body.position || "middle"; // top/middle/bottom
    const fontSize = parseInt(body.fontSize || "40", 10);
    const kenburns = body.kenburns === "true" || body.kenburns === true;
    const fade = body.fade === "true" || body.fade === true;
    const wordsTarget = parseInt(body.wordsTarget || "80", 10) || 80;
    const customW = body.customWidth ? parseInt(body.customWidth,10) : null;
    const customH = body.customHeight ? parseInt(body.customHeight,10) : null;
    const sessionId = req.sessionID;

    // gather images: from uploaded files + imagesJson (references)
    const uploadedImages = (req.files?.images || []).map(f => path.join(__dirname,"..", "uploads", path.basename(f.path)));
    let imagesFromBody = [];
    if (body.imagesJson) {
      try { imagesFromBody = JSON.parse(body.imagesJson).map(u => path.join(__dirname,"..", u.replace(/^\//,""))); } catch(e) { imagesFromBody=[]; }
    }
    const images = [...uploadedImages, ...imagesFromBody];

    // audio
    const audioLocal = req.files?.audio?.[0] ? path.join(__dirname,"..", "uploads", path.basename(req.files.audio[0].path)) : (body.audioUrl ? path.join(__dirname,"..", body.audioUrl.replace(/^\//,"")) : null);

    // resolution
    const size = sizeFromPreset(preset, customW, customH);
    const [w, h] = size.split("x").map(v => parseInt(v,10));

    // which font file to use (server requires actual ttf/otf file in /fonts)
    const fontFile = findFontFile(fontName) || null;

    // prepare ws map to send progress
    const wsMap = req.app.locals.wsMap;
    const wsClient = wsMap.get(sessionId);

    // helper to send ws update (videoId, percent, status, message)
    const sendWs = (videoId, payload) => {
      try {
        if (!wsClient || wsClient.readyState !== 1) return;
        wsClient.send(JSON.stringify({ videoId, ...payload }));
      } catch (e) {}
    };

    // function to call Gemini to get script
    async function getScriptFromGemini(promptText, words) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const finalPrompt = `Buatkan naskah singkat untuk overlay video. Gaya ringkas, sekitar ${words} kata. Topik: ${promptText}`;
      const result = await model.generateContent(finalPrompt);
      const text = (result?.response?.text && typeof result.response.text === "function") ? result.response.text() : (result?.response?.text || "");
      return (text || `Script untuk: ${promptText}`).trim();
    }

    // start job: create N videos and immediately respond with job ids and start processing
    const jobIds = [];
    // start background generation sequentially to avoid overload (but still within this request loop)
    // Because the system requirement said do everything now, we will process here and return once finished.
    // NOTE: This may block for long for many videos; for production use job queue & async notifications.
    const results = [];
    for (let i = 0; i < total; i++) {
      const id = uuidv4();
      jobIds.push(id);
      const outFile = path.join(GENERATED_DIR, `${id}.mp4`);

      try {
        sendWs(id, { status: "starting", progress: 0 });

        // 1) request script
        sendWs(id, { status: "generating_script", progress: 2, message: "Membuat naskah dari Gemini..." });
        const scriptRaw = await getScriptFromGemini(prompt, wordsTarget);
        const wrapped = wrapText(scriptRaw, Math.floor(w/20)); // wrap depending on width
        const textSafe = sanitizeForDrawtext(wrapped);

        // 2) build ffmpeg inputs & filters
        // If no images, create a color background
        let cmd = ffmpeg();

        if (images.length === 0) {
          // create color background via lavfi
          cmd = cmd.input(`color=size=${size}:color=000000`).inputOptions(["-f","lavfi","-t",String(duration)]);
        } else {
          // for each image: loop 1 and set duration per slide
          const perSlide = Math.max(2, Math.floor(duration / images.length));
          images.forEach(imgPath => {
            cmd = cmd.input(imgPath).inputOptions(["-loop", "1"]);
          });
        }

        // optional background audio
        if (audioLocal) {
          cmd = cmd.input(audioLocal);
        } else {
          // anullsrc for silent/dummy audio
          cmd = cmd.input("anullsrc=channel_layout=stereo:sample_rate=44100").inputOptions(["-f","lavfi"]);
        }

        // build filter complex:
        // - scale each image to fit while preserving aspect ratio, pad to size
        // - apply kenburns per image if enabled (zoompan)
        // - crossfade between clips if fade enabled
        // We'll implement a standard pipeline:
        // 1) for each image N -> [n:v]scale...,pad...,setpts=PTS-STARTPTS,trim...
        // 2) concat with transitions (if fade) or concat simple
        const filters = [];
        const videoStreams = [];
        if (images.length === 0) {
          // single color source is input 0, video stream label [0:v]
          videoStreams.push("[0:v]");
        } else {
          // inputs index: 0..N-1 are images, next index is audio (or blank)
          for (let idx = 0; idx < images.length; idx++) {
            const inIndex = idx;
            const vLabel = `v${idx}`;
            // scale/pad
            filters.push(
              `[${inIndex}:v]scale=w=${w}:h=${h}:force_original_aspect_ratio=decrease,` +
              `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,trim=duration=${Math.max(2, Math.floor(duration/images.length))},setpts=PTS-STARTPTS[${vLabel}]`
            );
            // apply ken burns effect optionally (zoompan)
            if (kenburns) {
              // create zoom effect via zoompan on each [v{idx}]
              const kbLabel = `kb${idx}`;
              // The zoompan filter works on single input, but since we used scale+pad to produce a stream,
              // we instead use the zoompan-like via scale and crop + zoomover by using zoompan or send through transform.
              // A simpler approach: use zoompan on the input image index directly:
              // Use zoompan with d=frames, we approximate frames = perSlide * fps (fps=25)
              const frames = Math.max(25, Math.floor(25 * Math.max(2, Math.floor(duration/images.length))));
              filters.push(
                `[${inIndex}:v]zoompan=z='if(lte(zoom,1.0),1.0, zoom+0.0005)':d=${frames}:s=${w}x${h}[${kbLabel}]`
              );
              // override vLabel to use kbLabel
              videoStreams.push(`[${kbLabel}]`);
            } else {
              videoStreams.push(`[${vLabel}]`);
            }
          }
        }

        // If there are multiple video streams, concat them
        let finalVideoLabel = null;
        if (videoStreams.length === 1) {
          finalVideoLabel = videoStreams[0].replace(/[\[\]]/g, "") ? videoStreams[0] : "[0:v]";
        } else {
          // build concat: [v0][v1]...concat=n=X:v=1:a=0[vout]
          const concatInputs = videoStreams.join('');
          filters.push(`${concatInputs}concat=n=${videoStreams.length}:v=1:a=0[vout]`);
          finalVideoLabel = "[vout]";
        }

        // Apply fade transition between segments: more complex, but simpler approach - use crossfade via xfades between pairs.
        // For simplicity and reliability, if fade enabled we will add a short fade-in at start and fade-out at end using fade filter.
        const drawtextY = position === "top" ? "(h*0.12)" : position === "bottom" ? "(h-text_h-64)" : "(h-text_h)/2";

        // drawtext
        // choose fontfile
        const ffile = fontFile || (process.platform === "win32" ? "C:/Windows/Fonts/arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
        // final drawtext filter chain appended to the final video stream:
        // apply fade at start and end
        const drawFilter = `${finalVideoLabel}drawtext=fontfile='${ffile}':text='${textSafe}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=${drawtextY}:line_spacing=6:enable='between(t,0,${duration})'[vfinal]`;
        filters.push(drawFilter);

        // audio mixing: map last input as bg audio if provided
        // Determine audio input index:
        const audioInputIndex = images.length === 0 ? 1 : images.length; // if no images, color=0, anullsrc=1, else images(0..n-1) and anullsrc is n
        // if audioLocal provided, its input index is audioInputIndex else anullsrc is at that index already.

        // create complexFilter and map
        // collect outputs
        const complexFilter = filters.filter(Boolean);
        // attach complex filters
        cmd = cmd.complexFilter(complexFilter, ['vfinal']);

        // Map streams and output options
        // Map vfinal to video, map audio input index to audio (or mix)
        cmd = cmd.outputOptions([
          "-map [vfinal]",
          `-map ${audioLocal ? `${audioInputIndex}:a` : `${audioInputIndex}:a`}`,
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-preset veryfast",
          "-tune film",
          `-t ${duration}`,
          "-c:a aac",
          "-b:a 160k",
          "-movflags +faststart"
        ]);

        // set size & fps basic
        cmd = cmd.size(size).fps(25);

        // progress event
        cmd.on("progress", progress => {
          // progress.percent not always available — compute approximate percent from timemark
          const tm = progress.timemark || "00:00:00";
          // try convert timemark to seconds
          const parts = tm.split(":").map(parseFloat).reverse();
          let seconds = 0;
          if (parts.length >= 1) seconds += parts[0];
          if (parts.length >= 2) seconds += parts[1]*60;
          if (parts.length >= 3) seconds += parts[2]*3600;
          const percent = Math.min(98, Math.round((seconds/duration)*100));
          sendWs(id, { status: "rendering", progress: percent, message: `Rendering... ${percent}%` });
        });

        // error & end
        await new Promise((resolve, reject) => {
          cmd.save(outFile)
            .on("end", () => {
              sendWs(id, { status: "done", progress: 100, message: "Selesai", output: `/generated/${path.basename(outFile)}` });
              resolve();
            })
            .on("error", (err) => {
              sendWs(id, { status: "error", progress: 0, message: String(err) });
              reject(err);
            });
        });

        results.push(`/generated/${path.basename(outFile)}`);
      } catch (err) {
        results.push({ error: String(err) });
        // continue to next video
      }
    } // end for

    // after finished all
    return res.json({ success:true, files: results, jobIds });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success:false, message: String(err) });
  }
};
