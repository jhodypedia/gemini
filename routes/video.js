// routes/video.js
const express = require("express");
const router = express.Router();
const video = require("../controllers/videoController");
const { ensureAuth } = require("../middlewares/auth");

// set apikey
router.get("/set-apikey", ensureAuth, video.getSetApiKey);
router.post("/set-apikey", ensureAuth, video.postSetApiKey);

// generate form + submit
router.get("/generate-video", ensureAuth, video.showGenerate);
router.post("/generate-video", ensureAuth, video.createJob);

// generated list
router.get("/generated-video", ensureAuth, video.listGenerated);

module.exports = router;
