// controllers/authController.js
const bcrypt = require("bcryptjs");
const { User } = require("../models");

exports.showRegister = (req, res) => res.render("auth/register", { error: null });
exports.showLogin = (req, res) => res.render("auth/login", { error: null });

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.render("auth/register", { error: "All fields required" });
    const exists = await User.findOne({ where: { email } });
    if (exists) return res.render("auth/register", { error: "Email already used" });
    const hash = await bcrypt.hash(password, 10);
    const role = (await User.count()) === 0 ? "admin" : "user";
    const user = await User.create({ username, email, passwordHash: hash, role });
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;
    res.redirect("/generate-video");
  } catch (err) {
    console.error(err); res.render("auth/register", { error: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.render("auth/login", { error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.render("auth/login", { error: "Invalid credentials" });
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;
    res.redirect("/generate-video");
  } catch (err) {
    console.error(err); res.render("auth/login", { error: "Server error" });
  }
};

exports.logout = (req, res) => { req.session.destroy(()=> res.redirect("/auth/login")); };
