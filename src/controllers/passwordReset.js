const Password = require("../models/PasswordResetFlow");
const Organization = require("../models/Organization");
const Employee = require("../models/Employee");
const Customer = require("../models/Customer");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const ErrorHelper = require("./logic/errorHelper");

const models = { Organization, Employee, Customer };

const findPerRole = async (role, email) => {
  const Model = models[role];
  if (!Model) return null;
  console.log(Model);
  return await Model.findOne({ email: email });
};

const passwordResetController = {
  async emailVerification(req, res) {
    const { email, role } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    console.log("EMAIL E ROLE", {
      email,
      role,
    });

    if (!email || !role) {
      return ErrorHelper({
        res,
        status: 404,
        error: "As informações requiridas não estão completas.",
        message:
          "Envie outra solicitação preenchendo corretamente as informações.",
      });
    }

    if (!emailRegex.test(email)) {
      return ErrorHelper({
        res,
        status: 401,
        error: "O Email não é válido.",
        message: "Envie novamente com um email válido.",
      });
    }

    const user = await findPerRole(role, email.trim());
    console.log("MODEL", user);
    if (!user) {
      return ErrorHelper({
        res,
        status: 404,
        error: "Esse usuário não existe.",
        message:
          "Tente novamente com outro email ou com outro nível de acesso.",
      });
    }

    try {
      const token = crypto
        .randomBytes(3)
        .toString("hex")
        .slice(0, 6)
        .toUpperCase();

      res.status(200).json({ message: token });
      const hashedToken = await bcrypt.hash(token, 10);
    } catch (err) {
      return ErrorHelper({
        res,
        status: 500,
        error: "Houve um erro interno.",
        message: "Tente novamente mais tarde.",
      });
    }
  },
};

module.exports = passwordResetController;
