const jwt = require("jsonwebtoken");
const Organization = require("../models/Organization");
const Employees = require("../models/Employee");

module.exports = async (req, res, next) => {
  const token =
    req.cookies?.token ||
    req.body.token ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({
      error: "Acesso negado",
      details: "Token não encontrado",
      solution: "Faça login novamente",
    });
  }

  try {
    const secret = process.env.SECRET;
    if (!secret) {
      throw new Error("Chave secreta JWT não configurada");
    }

    const decoded = jwt.verify(token, secret);

    let role = "patient"; // padrão
    if (await Organization.findById(decoded.id)) {
      role = "adm";
    } else if (await Employees.findById(decoded.id)) {
      role = "employee";
    }

    console.log(role);
    req.user = {
      id: decoded.id,
      role,
    };

    next();
  } catch (err) {
    const errorResponse = {
      error: "Falha na autenticação",
      details: err.message,
      action: "Faça login novamente",
    };

    if (err.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ ...errorResponse, error: "Token expirado" });
    }

    if (err.name === "JsonWebTokenError") {
      return res
        .status(403)
        .json({ ...errorResponse, error: "Token inválido" });
    }

    return res.status(403).json(errorResponse);
  }
};
