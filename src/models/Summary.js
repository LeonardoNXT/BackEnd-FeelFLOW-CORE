const mongoose = require("mongoose");

const summarySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
  },
  created_for: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Summary = mongoose.model("Summary", summarySchema);

module.exports = Summary;
