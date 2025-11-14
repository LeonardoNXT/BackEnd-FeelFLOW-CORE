const Password = require("../models/PasswordResetFlow");
const Organization = require("../models/Organization");
const Employee = require("../models/Employee");
const Customer = require("../models/Customer");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const ErrorHelper = require("./logic/errorHelper");
const sendOtpEmail = require("./logic/sendOtpEmail");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const models = { Organization, Employee, Customer };

function getCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: true, // HTTPS obrigatório em produção
    sameSite: isProd ? "Strict" : "none", // Mais restritivo em produção
    domain: isProd ? ".feelsystem.com.br" : undefined, // Aplica subdomínio apenas em prod
    maxAge: 10 * 60 * 1000, // 10 minutos
    path: "/auth/reset-password",
  };
}

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

    if (!email || !role) {
      return ErrorHelper({
        res,
        status: 400,
        error: "Dados incompletos.",
        message: "Envie o email e o tipo de usuário.",
      });
    }

    if (!emailRegex.test(email)) {
      return ErrorHelper({
        res,
        status: 400,
        error: "Email inválido.",
        message: "Envie um email válido.",
      });
    }

    const user = await findPerRole(role, email.trim());
    if (!user) {
      return ErrorHelper({
        res,
        status: 404,
        error: "Usuário não encontrado.",
        message:
          "Tente novamente com outro email ou com outro nível de acesso.",
      });
    }

    try {
      // GERAR TOKEN
      const token = crypto
        .randomBytes(3)
        .toString("hex")
        .slice(0, 6)
        .toUpperCase();

      const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      // SALVAR NO REDIS (expira sozinho)
      await redis.set(
        `reset:${email.toLowerCase()}`,
        {
          userId: user._id.toString(),
          role,
          codeHash: hashedToken,
        },
        { ex: 600 } // 10 minutos
      );

      await sendOtpEmail({ email: email, otp: token, name: user.name });

      return res.json({ name: user.name.split(" ")[0] });
    } catch (err) {
      console.error(err);
      return ErrorHelper({
        res,
        status: 500,
        error: "Erro interno.",
        message: "Tente novamente mais tarde.",
      });
    }
  },
  async codeVerification(req, res) {
    const { email, token } = req.body;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !token) {
      return ErrorHelper({
        res,
        status: 400,
        error: "Dados incompletos.",
        message: "Envie o email e o token.",
      });
    }

    if (!emailRegex.test(email)) {
      return ErrorHelper({
        res,
        status: 400,
        error: "Email inválido.",
        message: "Envie um email válido.",
      });
    }

    try {
      // PEGAR O FLUXO NO REDIS
      const data = await redis.get(`reset:${email.toLowerCase()}`);

      if (!data) {
        return ErrorHelper({
          res,
          status: 401,
          error: "Código expirado.",
          message: "Solicite um novo código.",
        });
      }

      // VALIDAR TOKEN
      const hashedIncoming = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      if (hashedIncoming !== data.codeHash) {
        return ErrorHelper({
          res,
          status: 401,
          error: "Código incorreto.",
          message: "Verifique o código enviado ao email.",
        });
      }

      // GERAR RESET TOKEN (para permitir troca de senha)
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenHash = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      // SALVAR NO REDIS (expira em 10 min)
      await redis.set(
        `reset-flow:${email.toLowerCase()}`,
        {
          userId: data.userId,
          role: data.role,
          resetTokenHash,
        },
        { ex: 600 }
      );

      // COOKIE PARA TROCA DE SENHA
      res.cookie("reset_token", resetToken, getCookieOptions());

      return res.status(200).json({ verified: true });
    } catch (err) {
      console.error(err);
      return ErrorHelper({
        res,
        status: 500,
        error: "Erro interno.",
        message: "Tente novamente mais tarde.",
      });
    }
  },
};

module.exports = passwordResetController;
