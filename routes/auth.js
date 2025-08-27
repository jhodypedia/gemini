// routes/auth.js
const express = require("express");
const router = express.Router();
const auth = require("../controllers/authController");

router.get("/auth/register", auth.showRegister);
router.post("/auth/register", auth.register);
router.get("/auth/login", auth.showLogin);
router.post("/auth/login", auth.login);
router.get("/auth/logout", auth.logout);

module.exports = router;
