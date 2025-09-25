const Appointment = require("../models/Appointments");
const Employee = require("../models/Employee");
const Customer = require("../models/Customer");
const CONFIG_PROPERTYS = require("./logic/configPropertys");
const verifyPolicy = require("./logic/verifyPolicy");
const SendNotification = require("./logic/sendNotification");
const NOTIFICATION_CONFIG = require("./logic/notificationConfigAppoitments");
const sendNotification = require("./logic/sendNotification");
const errorHelper = require("./logic/errorHelper");

const INTERNAL_ERROR_CONFIG = {
  status: 500,
  error: "Erro interno",
  message: "Tente Novamente mais tarde.",
};

const VALIDATE_ERROR_CONFIG = {
  status: 401,
  error: "O usuário não foi autorizado.",
  message: "O usuário não pode efetuar a ação pelo seu nível de acesso.",
};

const ID_ERROR_CONFIG = {
  status: 404,
  error: "ID não encontrado",
  message: "O ID não foi colocado corretamente na requisição.",
};

const FIND_APPOIMENT_ERROR_CONFIG = {
  status: 404,
  error: "Erro ao encontrar o agendamento",
  message: "Certifique-se da validade do ID do agendamento.",
};

const appointmentsController = {
  async createAppointment(req, res) {
    const EmployeeId = req.user.id;
    const { organization } = req.user;
    const { patientId, date } = req.body;

    if (!EmployeeId) {
      return errorHelper({
        res,
        status: 400,
        error: "Faça o Login novamente",
        message: "Logue novamente para acessar este Endpoint",
      });
    }

    const EmployeeUser = await Employee.findById(EmployeeId);

    if (!EmployeeUser) {
      return errorHelper({
        res,
        status: 404,
        error: "Cadastro não encontrado.",
        message: "Logue em uma conta válida para acessar este Endpoint",
      });
    }

    if (
      !patientId ||
      !EmployeeUser.patients.map(String).includes(String(patientId))
    ) {
      return errorHelper({
        res,
        status: 400,
        error: "Paciente inválido",
        message:
          "Inclua o ObjectId de um paciente válido no corpo da requisição.",
      });
    }

    if (!date) {
      return errorHelper({
        res,
        status: 400,
        error: "Data não encontrada",
        message: "Inclua a data na requisição corretamente; type: date",
      });
    }
    const agendamentos = await Appointment.find({
      createdBy: EmployeeId,
      date,
    });
    if (agendamentos.length > 0) {
      return errorHelper({
        res,
        status: 401,
        error: "Há um agendamento com a mesma data",
        message:
          "Para agendar, é necessário escolher diferentes datas entre os agendamentos.",
      });
    }

    try {
      const orgOfEmployee = EmployeeUser.employee_of;
      const createAppointment = await Appointment.create({
        createdBy: EmployeeId,
        organization: orgOfEmployee,
        intendedFor: patientId,
        date,
      });

      const PatientUser = await Customer.findByIdAndUpdate(
        patientId,
        {
          $push: { appointments: createAppointment._id },
        },
        { new: true }
      );

      const createNotification = await SendNotification({
        organization,
        created_for: patientId,
        ...NOTIFICATION_CONFIG.CREATE_APPOINTMENT_PATIENT,
      });

      if (!createNotification) {
        console.log("Houve um erro na criação da notificação do agendamento.");
      }

      return res.status(201).json({
        message: `Seu agendamento foi cadastrado com sucesso para ${PatientUser.name}`,
        agendamento: {
          id: createAppointment._id,
          organization: orgOfEmployee,
          createdAt: createAppointment.createdAt,
        },
      });
    } catch (err) {
      console.log(err);
      return errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
      });
    }
  },
  async getAllAppointments(req, res) {
    const { user } = req; // vem do middleware
    const userId = user.id;
    const role = user.role;

    try {
      let appointments = [];

      if (role === "patient") {
        appointments = await Appointment.find({ intendedFor: userId })
          .populate("createdBy", "name avatar") // opcional: mostrar quem criou
          .sort({ createdAt: -1 });
      } else if (role === "employee") {
        appointments = await Appointment.find({ createdBy: userId })
          .populate("intendedFor", "name avatar") // opcional: mostrar pra quem é
          .sort({ createdAt: -1 });
      } else {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
        });
      }

      return res.status(200).json({
        message: "Agendamentos carregados com sucesso",
        total: appointments.length,
        appointments,
      });
    } catch (err) {
      return errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
      });
    }
  },
  async getPedingAppointments(req, res) {
    const { user } = req; // vem do middleware
    const userId = user.id;
    const role = user.role;

    try {
      let appointments = [];

      if (role === "patient") {
        appointments = await Appointment.find({
          intendedFor: userId,
          date: { $gt: new Date() },
        })
          .populate("createdBy", "name avatar")
          .sort({ date: 1 });
      } else if (role === "employee") {
        appointments = await Appointment.find({
          createdBy: userId,
          status: "pendente",
          date: { $gt: new Date() },
        })
          .populate("intendedFor", "name avatar") // opcional: mostrar pra quem é
          .sort({ date: 1 });
      } else {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
        });
      }

      return res.status(200).json({
        message: "Agendamentos carregados com sucesso",
        total: appointments.length,
        appointments,
      });
    } catch (err) {
      return errorHelper({
        res,
        ...CONFIG_PROPERTYSINTERNAL_ERROR_CONFIG,
      });
    }
  },
  async rescheduleAppointment(req, res) {
    const { user } = req; // vem do middleware
    const userId = user.id;
    const role = user.role;
    const { organization } = req.user;
    const id = req.params.id || req.body.id;
    const { date } = req.body;

    if (!id) {
      return errorHelper({
        res,
        ...ID_ERROR_CONFIG,
      });
    }

    if (isNaN(new Date(date).getTime())) {
      return errorHelper({
        res,
        status: 400,
        error: "Data inválida",
        message: "O formato da data está incorreto.",
      });
    }

    if (new Date().getTime() > new Date(date).getTime()) {
      return errorHelper({
        res,
        status: 400,
        error: "A data selecionada está no passado",
        message: "Selecione uma data futura para agendar.",
      });
    }

    const existing = await Appointment.findById(id);
    if (!existing) {
      return errorHelper({
        res,
        ...FIND_APPOIMENT_ERROR_CONFIG,
      });
    }

    let validateBy = verifyPolicy(existing, userId, role, CONFIG_PROPERTYS);

    if (!validateBy) {
      return errorHelper({
        res,
        ...VALIDATE_ERROR_CONFIG,
      });
    }

    try {
      const updatedAppointment = await Appointment.findByIdAndUpdate(
        id,
        { date },
        { new: true }
      );

      await SendNotification({
        organization,
        created_for: existing.intendedFor,
        ...NOTIFICATION_CONFIG.RESCHEDULE_APPOINTMENT_PATIENT,
      });

      res.status(200).json({
        message: "O agendamento foi alterado com sucesso",
        updatedAppointment,
      });
    } catch (err) {
      console.log(err);
      return errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
      });
    }
  },
  async uncheckAppointment(req, res) {
    const userId = req.user.id;
    const role = req.user.role;
    const { id } = req.params || req.body;
    const { organization } = req.user;
    const existing = await Appointment.findById(id);

    if (!existing) {
      return errorHelper({
        res,
        ...FIND_APPOIMENT_ERROR_CONFIG,
      });
    }

    let validateBy = verifyPolicy(existing, userId, role, CONFIG_PROPERTYS);
    if (!validateBy) {
      return errorHelper({
        res,
        ...VALIDATE_ERROR_CONFIG,
      });
    }
    try {
      const updatedAppointment = await Appointment.findByIdAndUpdate(
        id,
        { status: "cancelado" },
        { new: true }
      );
      await sendNotification({
        organization,
        created_for: existing.intendedFor,
        ...NOTIFICATION_CONFIG.UNCHECK_APPOINTMENT_PATIENT,
      });
      res.status(200).json({
        message: "O agendamento foi desmarcado com sucesso",
        updatedAppointment,
      });
    } catch (err) {
      console.log(err);
      return errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
      });
    }
  },
  async scheduleAppointment(req, res) {
    const { id } = req.params || req.body;
    const userId = req.user.id;
    const role = req.user.role;
    const { organization } = req.user;

    if (!id) {
      return errorHelper({
        res,
        ...ID_ERROR_CONFIG,
      });
    }
    const existing = await Appointment.findById(id);

    if (!existing) {
      return errorHelper({
        res,
        ...FIND_APPOIMENT_ERROR_CONFIG,
      });
    }

    const validateBy = verifyPolicy(existing, userId, role, CONFIG_PROPERTYS);

    if (!validateBy) {
      return errorHelper({ res, ...VALIDATE_ERROR_CONFIG });
    }

    try {
      const updateState = await Appointment.findByIdAndUpdate(
        id,
        {
          status: "agendado",
        },
        { new: true }
      );

      SendNotification({
        organization,
        created_for: existing.createdBy,
        ...NOTIFICATION_CONFIG.SCHEDULE_APPOINTMENT_EMPLOYEE,
      });

      res.status(200).json({
        message: "O agendamento foi agendado com sucesso",
        updateState,
      });
    } catch (err) {
      console.log(err);
      return errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
      });
    }
  },
};

module.exports = appointmentsController;
