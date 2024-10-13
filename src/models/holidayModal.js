const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, unique: true },
  },
  {
    timestamps: true,
  }
);

const holidayModal = mongoose.model("Holiday", holidaySchema);

module.exports = holidayModal;
