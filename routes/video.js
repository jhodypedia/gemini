// routes/video.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const controller = require("../controllers/videoController");

const router = express.Router();

// multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname,"..","uploads")),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// pages
router.get("/dashboard", (req, res) => res.render("dashboard"));
router.get("/result", (req, res) => res.render("dashboard")); // same

// apis
router.post("/api/set-key", controller.setKey);
router.get("/api/me", controller.me);
router.post("/api/upload", upload.fields([{ name: "images", maxCount: 50 }, { name: "audio", maxCount: 1 }]), controller.uploadAssets);
router.post("/api/generate", upload.fields([{ name: "images", maxCount: 50 }, { name: "audio", maxCount: 1 }]), controller.generateVeoN);
router.get("/api/videos", controller.listVideos);

module.exports = router;
