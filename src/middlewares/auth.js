const jwt = require("jsonwebtoken");
const Organization = require("../models/Organization");
const Employees = require("../models/Employee");
const Customer = require("../models/Customer");

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
    let organizationId = "";
    if (await Organization.findById(decoded.id)) {
      role = "adm";
      const organization = await Organization.findById(decoded.id);
      organizationId = organization._id;
      req.user = {
        id: decoded.id,
        organization: organizationId,
        role,
      };
    } else if (await Employees.findById(decoded.id)) {
      role = "employee";
      const employee = await Employees.findById(decoded.id);
      organizationId = employee.employee_of;
      req.user = {
        id: decoded.id,
        organization: organizationId,
        role,
      };
    } else if (await Customer.findById(decoded.id)) {
      role = "patient";
      const patient = await Customer.findById(decoded.id);
      organizationId = patient.client_of;
      let patient_of = patient.patient_of;
      req.user = {
        id: decoded.id,
        organization: organizationId,
        role,
        patient_of,
      };
    }

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
