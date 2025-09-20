const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["agendado", "cancelado", "concluido", "pendente"],
    default: "pendente",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  intendedFor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  acceptedAt: {
    type: Date,
  },
  date: {
    type: Date,
    required: true,
  },
  send_email: {
    type: Boolean,
    default: "false",
  },
});

const Appointment = mongoose.model("Appointment", appointmentSchema);

module.exports = Appointment;
