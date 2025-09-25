const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["lido", "enviado"],
      default: "enviado",
    },
    title: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    created_for: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "kind",
    },
    kind: {
      type: String,
      enum: ["Employee", "Organization", "Customer"],
      required: true,
    },
    notification_type: {
      type: String,
      enum: ["Agendamento", "Tarefa", "Funcionários", "Pacientes"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
