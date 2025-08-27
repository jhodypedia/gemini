// worker/renderer.js
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const { wrapText, sanitizeForDrawtext } = require("../utils/text");

async function renderJob(opts, progressCb){
  return new Promise((resolve, reject) => {
    const {
      images = [],
      audio = null,
      duration = 8,
      kenburns = true,
      fade = true,
      fontFile = "",
      size = "720x1280",
      textOverlay = "",
      outFile
    } = opts;

    const [W,H] = size.split("x").map(s=>parseInt(s,10));
    const cmd = ffmpeg();

    if (images.length === 0) {
      cmd.input(`color=c=0x0f78b4:s=${size}:d=${duration}`).inputOptions(["-f lavfi"]);
    } else {
      images.forEach(img => cmd.input(img).inputOptions(["-loop 1"]));
    }

    if (audio) {
      cmd.input(audio);
    } else {
      cmd.input("anullsrc=channel_layout=stereo:sample_rate=44100").inputOptions(["-f lavfi"]);
    }

    const filters = [];
    const labels = [];

    if (images.length === 0) {
      filters.push(`[0:v]scale=${W}:${H},setsar=1,trim=duration=${duration},setpts=PTS-STARTPTS[v0]`);
      labels.push("[v0]");
    } else {
      for (let i=0;i<images.length;i++){
        const inIdx = i;
        const vlab = `v${i}`;
        filters.push(`[${inIdx}:v]scale=w=${W}:h=${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,trim=duration=${Math.max(2, Math.floor(duration/images.length))},setpts=PTS-STARTPTS[${vlab}]`);
        if (kenburns) {
          const kb = `kb${i}`;
          const frames = Math.max(25, Math.floor( (duration/images.length) * 25 ));
          filters.push(`[${inIdx}:v]zoompan=z='min(zoom+0.0009,1.06)':d=${frames}:s=${W}x${H}[${kb}]`);
          labels.push(`[${kb}]`);
        } else {
          labels.push(`[${vlab}]`);
        }
      }
    }

    if (labels.length === 1) {
      filters.push(`${labels[0]}format=yuv420p[vconcat]`);
    } else {
      filters.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[vconcat]`);
    }

    if (fade) {
      filters.push(`[vconcat]fade=t=in:st=0:d=0.6,fade=t=out:st=${duration - 0.8}:d=0.8,format=yuv420p[vf]`);
    } else {
      filters.push(`[vconcat]format=yuv420p[vf]`);
    }

    if (textOverlay && textOverlay.trim()) {
      const wrapped = wrapText(textOverlay, Math.max(20, Math.floor(W/22)));
      const drawText = sanitizeForDrawtext(wrapped);
      const fontSize = Math.max(28, Math.floor(W/28));
      const yPos = "(h-text_h)/2";
      filters.push(`[vf]drawtext=fontfile='${fontFile}':text='${drawText}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=${yPos}[vout]`);
      cmd.complexFilter(filters, ["vout"]);
      cmd.outputOptions([`-map [vout]`, `-map ${images.length ? images.length : 1}:a`]);
    } else {
      filters.push(`[vf]null[vout]`);
      cmd.complexFilter(filters, ["vout"]);
      cmd.outputOptions([`-map [vout]`, `-map ${images.length ? images.length : 1}:a`]);
    }

    cmd.outputOptions([
      "-c:v libx264",
      "-pix_fmt yuv420p",
      "-preset veryfast",
      `-t ${duration}`,
      "-c:a aac",
      "-b:a 160k",
      "-movflags +faststart"
    ]);
    cmd.size(size).fps(25);

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
      } catch(e){ percent = 10; }
      if (progressCb) progressCb(percent);
    });

    cmd.on("end", () => resolve(outFile));
    cmd.on("error", err => reject(err));
    cmd.save(outFile);
  });
}

module.exports = { renderJob };
