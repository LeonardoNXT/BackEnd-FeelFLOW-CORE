const express = require("express");
const route = express.Router();
const checkToken = require("./src/middlewares/auth");
const authorize = require("./src/middlewares/authorize");
const userController = require("./src/controllers/userController");
const iaController = require("./src/controllers/iaController");
const employeesController = require("./src/controllers/employeesController");
const customersController = require("./src/controllers/customersController");
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
  authorize("adm"),
  upload.single("avatar"),
  employeesController.createEmployee
);

// Listar funcionários
route.post(
  "/employees/all", // ABAC
  checkToken,
  authorize("adm", "employee"),
  employeesController.getEmployees
);

// Buscar funcionário por ID
route.post(
  "/employees/:id",
  checkToken,
  authorize("adm"),
  employeesController.getEmployeeById
);

// Atualizar funcionário
route.put(
  "/employees/:id",
  checkToken,
  authorize("adm"),
  upload.single("avatar"),
  employeesController.updateEmployee
);

// Deletar funcionário
route.delete(
  "/employees/:id",
  checkToken,
  authorize("adm"),
  employeesController.deleteEmployee
);

// Alterar status do funcionário
route.patch(
  "/employees/:id/status",
  authorize("adm"),
  checkToken,
  employeesController.toggleEmployeeStatus
);

route.post(
  "/employees/hirings",
  authorize("adm", "employee"),
  checkToken,
  employeesController.HiringEmployees
);

// ---- PACIENTES/CLIENTES ---- //

// Criar novo cliente
route.post(
  "/customers",
  checkToken,
  upload.single("avatar"),
  handleMulterError,
  customersController.createCustomer
);

// Listar todos os clientes
route.post(
  "/customers",
  checkToken,
  authorize("adm", "employee"),
  customersController.getCustomers
);

// Buscar cliente por ID
route.post(
  "/customers/:id",
  checkToken,
  authorize("adm", "employee", "patient"),
  customersController.getCustomerById
);

// Atualizar cliente
route.put(
  "/customers/:id",
  checkToken,
  authorize("adm"), // vai editar cadastro basico - não ficha anamnese.
  upload.single("avatar"),
  handleMulterError,
  customersController.updateCustomer
);

// Deletar cliente
route.delete(
  "/customers/:id",
  checkToken,
  authorize("adm"),
  customersController.deleteCustomer
);

// Alterar status do cliente (Ativo/Inativo)
route.patch(
  "/customers/:id/status",
  checkToken,
  authorize("adm"),
  customersController.toggleCustomerStatus
);

// Atualizar senha do cliente
route.patch(
  "/customers/:id/password",
  checkToken,
  authorize("adm", "patient"),
  customersController.updateCustomerPassword
);

// Adicionar entrada no diário de humor
route.post(
  "/customers/:id/mood-diary",
  checkToken,
  authorize("patient"),
  customersController.addMoodEntry
);

// Obter diário de humor do cliente
route.get(
  "/customers/:id/mood-diary",
  checkToken,
  authorize("adm", "employee"),
  customersController.getMoodDiary
);

// ---- ADM FUNCOES ---- //

// CHAT AI
route.post("/ai/chat", checkToken, iaController.chatWithAI);

// Middleware de tratamento de erros do multer
route.use(handleMulterError);

module.exports = route;
