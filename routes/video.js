// routes/video.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const videoController = require("../controllers/videoController");

// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads")),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// pages
router.get("/", (req, res) => res.render("index"));

// api: set gemini key
router.post("/api/set-key", videoController.setKey);
router.get("/api/me", videoController.me);

// api: fetch google fonts list (proxy if GOOGLE_FONTS_API_KEY present)
router.get("/api/fonts", videoController.fetchFonts);

// api: upload assets
router.post("/api/upload", upload.fields([{ name: "images", maxCount: 40 }, { name: "audio", maxCount: 1 }]), videoController.uploadAssets);

// api: generate videos
router.post("/api/generate", upload.fields([{ name: "images", maxCount: 40 }, { name: "audio", maxCount: 1 }]), videoController.generateVideos);

// api: list generated
router.get("/api/videos", videoController.listVideos);

module.exports = router;
