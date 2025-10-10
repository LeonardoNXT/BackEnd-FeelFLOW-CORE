const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["disponivel", "agendado", "cancelado", "concluido"],
    default: "disponivel", // Novo padrão: começa como disponível
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee", // Psicólogo
    required: true,
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  intendedFor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer", // Paciente
    default: null, // Será definido apenas quando o paciente escolher o horário
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  acceptedAt: {
    type: Date,
  },
  // Data e hora de início do agendamento
  startTime: {
    type: Date,
    required: true,
  },
  // Duração em minutos
  duration: {
    type: Number,
    required: true,
  },
  // Tempo final calculado automaticamente
  endTime: {
    type: Date,
  },
  send_email: {
    type: Boolean,
    default: false,
  },
});

// Garante que não existam sobreposições de horários do mesmo psicólogo
appointmentSchema.pre("save", async function (next) {
  if (!this.isModified("startTime") && !this.isModified("duration"))
    return next();

  // 🔹 Calcula o horário de término
  this.endTime = new Date(this.startTime.getTime() + this.duration * 60000);

  // 🔹 Verifica se o horário ultrapassa 22h
  const startHour = this.startTime.getHours();
  const endHour = this.endTime.getHours();

  // Se o início OU o fim for >= 22h (10 da noite), bloqueia
  if (startHour >= 22 || endHour >= 22) {
    const err = new Error("Horários após as 22:00 não são permitidos.");
    return next(err);
  }

  if (startHour < 6) {
    const err = new Error("Horários antes das 06:00 não são permitidos.");
    return next(err);
  }

  // 🔹 Verifica conflito de horários
  const overlap = await mongoose.model("Appointment").findOne({
    createdBy: this.createdBy,
    status: { $in: ["disponivel", "agendado"] },
    $or: [
      { startTime: { $lt: this.endTime }, endTime: { $gt: this.startTime } },
    ],
    _id: { $ne: this._id },
  });

  if (overlap) {
    const err = new Error("Horário conflita com outro agendamento existente.");
    return next(err);
  }

  next();
});

const Appointment = mongoose.model("Appointment", appointmentSchema);

module.exports = Appointment;
