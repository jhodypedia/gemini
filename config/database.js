// config/database.js
const { Sequelize } = require("sequelize");
const path = require("path");
const dbPath = path.join(__dirname, "..", "data", "database.sqlite");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: dbPath,
  logging: false
});

module.exports = sequelize;
