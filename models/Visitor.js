// models/Visitor.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Visitor = sequelize.define("Visitor", {
  ip: { type: DataTypes.STRING },
  userAgent: { type: DataTypes.STRING }
}, { timestamps: true });

module.exports = Visitor;
