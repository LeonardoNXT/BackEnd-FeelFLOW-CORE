const express = require("express");
const route = express.Router();
const checkToken = require("./src/middlewares/auth");
const userController = require("./src/controllers/userController");
const iaController = require("./src/controllers/iaController");
const employeesController = require("./src/controllers/employeesController");
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
route.get("/employees/all", checkToken, employeesController.getEmployees);

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

// ---- ADM FUNCOES ---- //

// CHAT AI
route.post("/ai/chat", checkToken, iaController.chatWithAI);

// Middleware de tratamento de erros do multer
route.use(handleMulterError);

module.exports = route;
