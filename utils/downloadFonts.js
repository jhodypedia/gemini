// utils/downloadFonts.js
const https = require("https");
const fs = require("fs");
const path = require("path");

const fontsDir = path.join(process.cwd(), "public", "fonts");
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

const fonts = [
  { file: "Poppins-Regular.ttf", url: "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Regular.ttf" },
  { file: "Roboto-Regular.ttf", url: "https://github.com/google/fonts/raw/main/apache/roboto/Roboto-Regular.ttf" }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 400) return reject(new Error("Download failed " + res.statusCode));
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      try { fs.unlinkSync(dest); } catch(e){}
      reject(err);
    });
  });
}

async function ensureFonts() {
  for (const f of fonts) {
    const dest = path.join(fontsDir, f.file);
    if (fs.existsSync(dest)) continue;
    try {
      console.log("Downloading font:", f.file);
      await download(f.url, dest);
      console.log("Saved", dest);
    } catch (err) {
      console.warn("Could not download font", f.file, err.message);
    }
  }
}

module.exports = { ensureFonts, fontsDir };
