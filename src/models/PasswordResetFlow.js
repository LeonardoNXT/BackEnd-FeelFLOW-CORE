const mongoose = require("mongoose");

const ResetSchema = new mongoose.Schema({
  user: {
    id: { type: mongoose.Types.ObjectId, required: true },
    kind: {
      type: String,
      required: true,
      enum: ["Employee", "Customer", "Organization"],
    },
  },
  codeHash: String,
  codeExpiresAt: Date,
  resetTokenHash: String,
  resetTokenExpiresAt: Date,

  used: { type: Boolean, default: false },
});

const ResetPasswordModel = mongoose.model("ResetPassword", ResetSchema);

module.exports = ResetPasswordModel;
