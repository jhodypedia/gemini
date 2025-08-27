// models/ApiUsage.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ApiUsage = sequelize.define("ApiUsage", {
  count: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { timestamps: true });

module.exports = ApiUsage;
