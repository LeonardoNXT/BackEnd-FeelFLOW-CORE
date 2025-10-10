const express = require("express");
const route = express.Router();
const checkToken = require("./src/middlewares/auth");
const authorize = require("./src/middlewares/authorize");
const userController = require("./src/controllers/userController");
const iaController = require("./src/controllers/iaController");
const employeesController = require("./src/controllers/employeesController");
const customersController = require("./src/controllers/customersController");
const appointmentsController = require("./src/controllers/appointmentsController");
const tasksController = require("./src/controllers/tasksController");
const {
  upload,
  handleMulterError,
  uploadTask,
} = require("./src/middlewares/upload");
const notificationController = require("./src/controllers/NotificationController");

route.get("/", (req, res) => {
  res.send("Bem vindo a NewArchAPI!");
});

// ---- Notificações ---- //

route.post(
  "/notification/all",
  checkToken,
  authorize("employee", "patient"),
  notificationController.getAllNotificationsUser
);

route.post(
  "/notification/read/:id",
  checkToken,
  authorize("patient", "employee"),
  notificationController.readNotification
);

// ---- Agendamento ---- ///

// cria novos agendamentos
route.post(
  "/appointments/availability/create",
  checkToken,
  authorize("employee"),
  appointmentsController.createAvailability
);

// pega todos os agendamentos daquele adm
route.post(
  "/appointments/all",
  checkToken,
  authorize("employee", "patient", "adm"),
  appointmentsController.getAllAppointments
);

// pega todos os agendamentos pendentes

route.post(
  "/appointments/availability/all",
  checkToken,
  authorize("employee", "patient"),
  appointmentsController.getAvailables
);

// pega todos os agendamentos confirmados

route.post(
  "/appointments/all/schedule",
  checkToken,
  authorize("employee", "patient"),
  appointmentsController.getAllConfirmAppointments
);

//Altera a data do agendamento

route.patch(
  "/appointments/availability/update",
  checkToken,
  authorize("employee"),
  appointmentsController.updateAvailability
);

// Cancelar o agendamento selecionado
route.post(
  "/appointments/availability/delete",
  checkToken,
  authorize("employee"),
  appointmentsController.deleteAvailability
);

// GET em todos os agendamentos cancelados

route.post(
  "/appointments/unchecked",
  checkToken,
  authorize("employee", "patient"),
  appointmentsController.getUncheckedAppointments
);

// Aceitar/Agendar

route.patch(
  "/appointments/schedule/",
  checkToken,
  authorize("patient"),
  appointmentsController.scheduleAppointment
);

// ---- TAREFAS ---- //

// criar tarefas

route.post(
  "/tasks/create",
  checkToken,
  authorize("employee"),
  uploadTask.single("archive"),
  handleMulterError,
  tasksController.createTask
);

// GET de todas as tarefas pendentes

route.post(
  "/tasks/pending",
  checkToken,
  authorize("employee", "patient"),
  tasksController.getALLPendingTasks
);

// para verificar se está logado FUNCIONARIO/ADM/CLIENTE
route.post("/auth/verify", checkToken, userController.meUser);

// ---- ADM FUNCOES ---- //

route.post("/admin/login", userController.login);

// ---- FUNCIONÁRIOS ---- //

//login funcionários

route.post("/employees/login", employeesController.employeeLogin);

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

route.post(
  "/employees/hirings",
  checkToken,
  authorize("adm", "employee"),
  employeesController.HiringEmployees
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

// ---- PACIENTES/CLIENTES ---- //

// cadastrar novo pacientes
route.post(
  "/customers",
  checkToken,
  upload.single("avatar"),
  handleMulterError,
  customersController.createCustomer
);

// login de pacientes

route.post("/custumers/login", customersController.customerLogin);

// Listar todos os clientes
route.post(
  "/customers/all",
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
  "/customers/set/mood-diary",
  checkToken,
  authorize("patient"),
  customersController.addMoodEntry
);

// Obter diário de humor do cliente
route.post(
  "/customers/get/mood-diary",
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

// logout //'

route.post("/logout", (req, res) => {
  res.clearCookie("token", {
    path: "/",
    sameSite: "None",
    secure: true,
    httpOnly: true, // recomendável manter
  });
  res.status(200).send({ message: "Logout realizado com sucesso" });
});
