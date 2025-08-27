// routes/admin.js
const express = require("express");
const router = express.Router();
const admin = require("../controllers/adminController");
const { ensureAuth, ensureAdmin } = require("../middlewares/auth");

router.get("/admin/dashboard", ensureAuth, ensureAdmin, admin.dashboard);
module.exports = router;
