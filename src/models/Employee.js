const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
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
    birthday: {
      type: String,
      required: true,
    },
    rg: {
      type: String,
      unique: true,
      trim: true,
      validate: {
        validator: function (v) {
          // Validação básica de RG (formato pode variar por estado)
          return /^[\d\w]{5,15}$/.test(v.replace(/[.\-\s]/g, ""));
        },
        message: "RG deve ter formato válido",
      },
    },
    cpf: {
      type: String,
      unique: true,
      trim: true,
      validate: {
        validator: function (v) {
          // Remove formatação
          const cpf = v.replace(/[^\d]/g, "");

          // Validação básica de CPF
          if (cpf.length !== 11) return false;
          if (/^(\d)\1{10}$/.test(cpf)) return false; // CPFs com dígitos repetidos

          // Validação dos dígitos verificadores
          let sum = 0;
          for (let i = 0; i < 9; i++) {
            sum += parseInt(cpf.charAt(i)) * (10 - i);
          }
          let remainder = 11 - (sum % 11);
          if (remainder === 10 || remainder === 11) remainder = 0;
          if (remainder !== parseInt(cpf.charAt(9))) return false;

          sum = 0;
          for (let i = 0; i < 10; i++) {
            sum += parseInt(cpf.charAt(i)) * (11 - i);
          }
          remainder = 11 - (sum % 11);
          if (remainder === 10 || remainder === 11) remainder = 0;
          if (remainder !== parseInt(cpf.charAt(10))) return false;

          return true;
        },
        message: "CPF deve ter formato válido",
      },
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      validate: {
        validator: function (v) {
          // Remove toda formatação
          const cleanPhone = v.replace(/\D/g, "");

          // Deve ter 10 ou 11 dígitos
          if (!/^(\d{10}|\d{11})$/.test(cleanPhone)) {
            return false;
          }

          // Se tem 11 dígitos, deve ser celular (3º dígito ≥ 9)
          if (cleanPhone.length === 11) {
            const thirdDigit = parseInt(cleanPhone.charAt(2));
            return thirdDigit >= 9;
          }

          // Se tem 10 dígitos, deve ser fixo (3º dígito < 9)
          if (cleanPhone.length === 10) {
            const thirdDigit = parseInt(cleanPhone.charAt(2));
            return thirdDigit < 9;
          }

          return true;
        },
        message:
          "Número deve ter formato válido: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX",
      },
    },
    address: {
      type: String,
      trim: true,
      required: true,
    },
    remuneration: {
      type: Number,
      required: true,
      min: 0,
    },
    password: {
      type: String,
      required: true,
      select: false, // Segurança: não retorna a senha em queries
    },
    patients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
      },
    ],
    employee_of: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    hireDate: {
      type: Date,
      default: Date.now,
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
    status: { type: String, enum: ["Ativo", "Inativo"], default: "Ativo" },
  },
  {
    timestamps: true, // Adiciona createdAt e updatedAt
  }
);

const Employee = mongoose.model("Employee", employeeSchema);

module.exports = Employee;
