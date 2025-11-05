const mongoose = require("mongoose");
const timezoneHelper = require("../controllers/logic/timezoneHelper");

const appointmentSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["disponivel", "agendado", "cancelado", "concluido"],
    default: "disponivel",
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
  startTime: {
    type: Date,
    required: true,
  },
  duration: {
    type: Number,
    required: true,
  },
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

  // 🔹 Valida horário de funcionamento usando fuso horário brasileiro
  const validation = timezoneHelper.validateBusinessHours(this.startTime, this.endTime);
  
  if (!validation.valid) {
    return next(new Error(validation.error));
  }

  // 🔹 Log para debug (pode remover depois)
  timezoneHelper.logTimeDebug(this.startTime, this.endTime, 'APPOINTMENT PRE-SAVE');

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
