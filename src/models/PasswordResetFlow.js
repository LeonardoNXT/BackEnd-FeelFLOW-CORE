const mongoose = require("mongoose");

const ResetSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "userKind",
  },
  userKind: {
    type: String,
    required: true,
    enum: ["Employee", "Customer", "Organization"],
  },

  email: String,
  codeHash: String,
  codeExpiresAt: Date,
  resetTokenHash: String,
  resetTokenExpiresAt: Date,
  used: { type: Boolean, default: false },
});

const ResetPasswordModel = mongoose.model("ResetPassword", ResetSchema);

module.exports = ResetPasswordModel;
