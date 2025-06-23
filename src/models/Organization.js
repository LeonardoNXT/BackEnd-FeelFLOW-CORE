const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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
        ref: "Customer",
      },
    ],
  },
  {
    timestamps: true, // Cria `createdAt` e `updatedAt` automaticamente
  }
);

const Organization = mongoose.model("Organization", organizationSchema);

module.exports = Organization;
