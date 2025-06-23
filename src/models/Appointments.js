const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["agendado", "cancelado", "concluido", "em andamento"],
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Appointment = mongoose.model("Appointment", appointmentSchema);

module.exports = Appointment;
