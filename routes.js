const express = require("express");
const route = express.Router();
const checkToken = require("./src/middlewares/auth");
const userController = require("./src/controllers/userController");
const iaController = require("./src/controllers/iaController");
const employeesController = require("./src/controllers/employeesController");
const patientsController = require("./src/controllers/patientsController");
const { upload, handleMulterError } = require("./src/middlewares/upload");

route.get("/", (req, res) => {
  res.send("Bem vindo a NewArchAPI!");
});

// ---- ADM FUNCOES ---- //

route.post("/auth/login", userController.login);

// para registrar novos usuários
route.post("/auth/register", checkToken, userController.registerUser);

// para verificar se está logado
route.post("/auth/verify", checkToken, userController.meUser);

// ---- FUNCIONÁRIOS ---- //

// Criar funcionário
route.post(
  "/employees",
  checkToken,
  upload.single("avatar"),
  employeesController.createEmployee
);

// Listar funcionários
route.post("/employees/all", checkToken, employeesController.getEmployees);

// Buscar funcionário por ID
route.get("/employees/:id", checkToken, employeesController.getEmployeeById);

// Atualizar funcionário
route.put(
  "/employees/:id",
  checkToken,
  upload.single("avatar"),
  employeesController.updateEmployee
);

// Deletar funcionário
route.delete("/employees/:id", checkToken, employeesController.deleteEmployee);

// Alterar status do funcionário
route.patch(
  "/employees/:id/status",
  checkToken,
  employeesController.toggleEmployeeStatus
);

// ---- PACIENTES ---- //

// Criar novo paciente (apenas admin)
route.post("/patients", checkToken, patientsController.create);

// Listar todos os pacientes (apenas admin)
route.post("/patients/all", checkToken, patientsController.getAll);

// Buscar paciente por ID (admin ou próprio paciente)
route.get("/patients/:id", checkToken, patientsController.getById);

// Atualizar paciente (apenas admin)
route.put("/patients/:id", checkToken, patientsController.update);

// Deletar paciente (apenas admin)
route.delete("/patients/:id", checkToken, patientsController.delete);

// Ativar/Desativar paciente (apenas admin)
route.patch(
  "/patients/:id/toggle-status",
  checkToken,
  patientsController.toggleStatus
);

// Buscar pacientes por clínica (apenas admin)
route.get(
  "/patients/clinic/:clinic_id",
  checkToken,
  patientsController.getByClinic
);

// Buscar pacientes por profissional (admin ou próprio profissional)
route.get(
  "/patients/professional/:professional_id",
  checkToken,
  patientsController.getByProfessional
);

// Adicionar entrada no diário do humor (admin ou próprio paciente)
route.post(
  "/patients/:id/mood-diary",
  checkToken,
  patientsController.addMoodEntry
);

// ---- ADM FUNCOES ---- //

// CHAT AI
route.post("/ai/chat", checkToken, iaController.chatWithAI);

// Middleware de tratamento de erros do multer
route.use(handleMulterError);

module.exports = route;
