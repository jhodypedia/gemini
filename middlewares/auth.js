// middlewares/auth.js
exports.ensureAuth = (req, res, next) => {
  if (req.session && req.session.userId) return next();
  return res.redirect("/auth/login");
};

exports.ensureAdmin = (req, res, next) => {
  if (req.session && req.session.role === "admin") return next();
  return res.status(403).send("Forbidden");
};
