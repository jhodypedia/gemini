const express = require("express");
const router = express.Router();
const auth = require("../controllers/authController");
const { ensureAuth, ensureGuest } = require("../middlewares/auth");

// Register
router.get("/auth/register", ensureGuest, auth.showRegister);
router.post("/auth/register", ensureGuest, auth.register);

// Login
router.get("/auth/login", ensureGuest, auth.showLogin);
router.post("/auth/login", ensureGuest, auth.login);

// Logout
router.get("/auth/logout", ensureAuth, auth.logout);

module.exports = router;
