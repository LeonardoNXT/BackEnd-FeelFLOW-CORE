const express = require("express");
const route = express.Router();
const checkToken = require("./src/middlewares/auth");
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

// Criar novo cliente
route.post(
  "/customers",
  checkToken,
  upload.single("avatar"),
  handleMulterError,
  customersController.createCustomer
);

// Listar todos os clientes
route.get("/customers", checkToken, customersController.getCustomers);

// Buscar cliente por ID
route.get("/customers/:id", checkToken, customersController.getCustomerById);

// Atualizar cliente
route.put(
  "/customers/:id",
  checkToken,
  upload.single("avatar"),
  handleMulterError,
  customersController.updateCustomer
);

// Deletar cliente
route.delete("/customers/:id", checkToken, customersController.deleteCustomer);

// Alterar status do cliente (Ativo/Inativo)
route.patch(
  "/customers/:id/status",
  checkToken,
  customersController.toggleCustomerStatus
);

// Atualizar senha do cliente
route.patch(
  "/customers/:id/password",
  checkToken,
  customersController.updateCustomerPassword
);

// === ROTAS ESPECÍFICAS PARA DIÁRIO DE HUMOR ===

// Adicionar entrada no diário de humor
route.post(
  "/customers/:id/mood-diary",
  checkToken,
  customersController.addMoodEntry
);

// Obter diário de humor do cliente
route.get(
  "/customers/:id/mood-diary",
  checkToken,
  customersController.getMoodDiary
);

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
