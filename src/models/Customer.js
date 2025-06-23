const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true, // Recomendado para login/autenticação
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    select: false, // Segurança: não retorna a senha em queries
  },
  age: {
    type: Number,
    required: true,
  },
  patient_of: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
  },
  client_of: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  disorders: [String],

  appointments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
  ],
  status: { type: String, enum: ["Ativo", "Inativo"], default: "Ativo" },
  mood_diary: [
    {
      emotion: {
        type: String,
        enum: [
          "Feliz",
          "Perfeito",
          "Triste",
          "Horrível",
          "Neutro",
          "Irritante",
          "Estressante",
          "Cansativo",
          "Chocante",
          "Ruim",
          "Intenso",
        ],
        required: true,
      },
      intensity: {
        type: Number,
        min: 1,
        max: 10,
        required: true,
      },
      description: {
        type: String,
        maxlength: 500,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      address: {
        type: String,
      },
    },
  ],
});

const Customer = mongoose.model("Customer", customerSchema);

module.exports = Customer;
