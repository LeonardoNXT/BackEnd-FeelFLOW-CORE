const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    cnpj: {
      type: String,
      required: false,
      trim: true,
    },
    telefone: {
      type: String,
      required: false,
      trim: true,
    },
    avatar: {
      url: {
        type: String,
        required: false,
      },
      public_id: {
        type: String,
        required: false,
      },
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // Oculta a senha por padrão nas queries
    },
    employees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
      },
    ],
    customers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Custumer",
      },
    ],
  },
  {
    timestamps: true, // Cria `createdAt` e `updatedAt` automaticamente
  }
);

const Organization = mongoose.model("Organization", organizationSchema);

module.exports = Organization;
