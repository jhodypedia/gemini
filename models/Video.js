// models/Video.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Video = sequelize.define("Video", {
  prompt: { type: DataTypes.TEXT, allowNull: false },
  videoUrl: { type: DataTypes.STRING, allowNull: false },
  size: { type: DataTypes.ENUM("reels","landscape","square"), defaultValue: "reels" },
  withImage: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { timestamps: true });

module.exports = Video;
