// controllers/adminController.js
const { User, Video, Visitor, sequelize } = require("../models");
const { QueryTypes } = require("sequelize");

exports.dashboard = async (req, res) => {
  // cards
  const totalUsers = await User.count();
  const totalVideos = await Video.count();
  const totalVisitors = await Visitor.count();

  // videos per day last 7 days
  const rows = await sequelize.query(`
    SELECT DATE(createdAt) as day, COUNT(id) as cnt
    FROM Videos
    WHERE createdAt >= date('now','-6 days')
    GROUP BY day
    ORDER BY day ASC
  `, { type: QueryTypes.SELECT });

  // users per day (registered)
  const usersRows = await sequelize.query(`
    SELECT DATE(createdAt) as day, COUNT(id) as cnt
    FROM Users
    WHERE createdAt >= date('now','-6 days')
    GROUP BY day
    ORDER BY day ASC
  `, { type: QueryTypes.SELECT });

  res.render("admin/dashboard", {
    totalUsers, totalVideos, totalVisitors,
    videosPerDay: rows, usersPerDay: usersRows, user: req.session.username
  });
};
