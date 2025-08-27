// models/index.js
const sequelize = require("../config/database");
const User = require("./User");
const Video = require("./Video");
const ApiUsage = require("./ApiUsage");
const Visitor = require("./Visitor");

User.hasMany(Video);
Video.belongsTo(User);

User.hasOne(ApiUsage);
ApiUsage.belongsTo(User);

async function initModels() {
  await sequelize.sync();
}

module.exports = { sequelize, User, Video, ApiUsage, Visitor, initModels };
