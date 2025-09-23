const Appointment = require("../models/Appointments");
const Employee = require("../models/Employee");
const Customer = require("../models/Customer");

function errorHelper(res, status, error, message) {
  return res.status(status).json({
    error: error,
    message: message,
  });
}

const appointmentsController = {
  async createAppointment(req, res) {
    const EmployeeId = req.user.id;
    const { patientId, date } = req.body;

    if (!EmployeeId) {
      return errorHelper(
        res,
        400,
        "Faça o Login novamente",
        "Logue novamente para acessar este Endpoint"
      );
    }

    const EmployeeUser = await Employee.findById(EmployeeId);

    if (!EmployeeUser) {
      return errorHelper(
        res,
        404,
        "Cadastro não encontrado.",
        "Logue em uma conta válida para acessar este Endpoint"
      );
    }

    if (
      !patientId ||
      !EmployeeUser.patients.map(String).includes(String(patientId))
    ) {
      return errorHelper(
        res,
        400,
        "Paciente inválido",
        "Inclua o ObjectId de um paciente válido no corpo da requisição."
      );
    }

    if (!date) {
      return errorHelper(
        res,
        400,
        "Data não encontrada",
        "Inclua a data na requisição corretamente; type: date"
      );
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

      return res.status(201).json({
        message: `Seu agendamento foi cadastrado com sucesso para ${PatientUser.name}`,
        agendamento: {
          id: createAppointment._id,
          organization: orgOfEmployee,
          createdAt: createAppointment.createdAt,
        },
      });
    } catch (err) {
      return errorHelper(
        res,
        500,
        "Erro interno",
        err.message || "Não foi possível criar o agendamento."
      );
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
        return errorHelper(
          res,
          403,
          "Acesso negado",
          "Sua role não permite visualizar agendamentos."
        );
      }

      return res.status(200).json({
        message: "Agendamentos carregados com sucesso",
        total: appointments.length,
        appointments,
      });
    } catch (err) {
      return errorHelper(
        res,
        500,
        "Erro interno",
        err.message || "Não foi possível buscar os agendamentos."
      );
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
        return errorHelper(
          res,
          403,
          "Acesso negado",
          "Sua role não permite visualizar agendamentos."
        );
      }

      return res.status(200).json({
        message: "Agendamentos carregados com sucesso",
        total: appointments.length,
        appointments,
      });
    } catch (err) {
      return errorHelper(
        res,
        500,
        "Erro interno",
        err.message || "Não foi possível buscar os agendamentos."
      );
    }
  },
  async rescheduleAppointment(req, res) {
    const { user } = req; // vem do middleware
    const userId = user.id;
    const role = user.role;
    const id = req.params.id || req.body.id;
    const { date } = req.body;

    if (!id) {
      return errorHelper(
        res,
        404,
        "ID não encontrado",
        "O ID não foi colocado corretamente na requisição."
      );
    }

    if (isNaN(new Date(date).getTime())) {
      return errorHelper(
        res,
        400,
        "Data inválida",
        "O formato da data está incorreto."
      );
    }

    if (new Date().getTime() > new Date(date).getTime()) {
      return errorHelper(
        res,
        400,
        "A data selecionada está no passado",
        "Selecione uma data futura para agendar."
      );
    }

    const existing = await Appointment.findById(id);
    if (!existing) {
      return errorHelper(
        res,
        404,
        "Erro ao encontrar o agendamento",
        "Certifique-se da validade do ID do agendamento."
      );
    }

    let validateBy = false;
    if (role === "adm") {
      validateBy = existing.organization?.equals(userId);
    } else if (role === "employee") {
      validateBy = existing.createdBy?.equals(userId);
    }

    if (!validateBy) {
      return errorHelper(
        res,
        401,
        "O usuário não foi autorizado",
        "Este usuário não pode alterar este agendamento."
      );
    }

    try {
      const updatedAppointment = await Appointment.findByIdAndUpdate(
        id,
        { date },
        { new: true }
      );
      res.status(200).json({
        message: "O agendamento foi alterado com sucesso",
        updatedAppointment,
      });
    } catch (err) {
      console.log(err);
      return errorHelper(
        res,
        500,
        "Houve um erro interno",
        "Tente novamente mais tarde."
      );
    }
  },
  async uncheckAppointment(req, res) {
    const userId = req.user.id;
    const role = req.user.role;
    const { id } = req.params || req.body;

    const existing = await Appointment.findById(id);

    if (!existing) {
      if (!existing) {
        return errorHelper(
          res,
          404,
          "Erro ao encontrar o agendamento",
          "Certifique-se da validade do ID do agendamento."
        );
      }
    }
    let validateBy = false;
    if (role === "adm") {
      validateBy = existing.organization?.equals(userId);
    } else if (role === "employee") {
      validateBy = existing.createdBy?.equals(userId);
    }
    if (!validateBy) {
      return errorHelper(
        res,
        401,
        "O usuário não foi autorizado",
        "Este usuário não pode alterar este agendamento."
      );
    }
    try {
      const updatedAppointment = await Appointment.findByIdAndUpdate(
        id,
        { status: "cancelado" },
        { new: true }
      );
      res.status(200).json({
        message: "O agendamento foi desmarcado com sucesso",
        updatedAppointment,
      });
    } catch (err) {
      console.log(err);
      return errorHelper(
        res,
        500,
        "Houve um erro interno",
        "Tente novamente mais tarde."
      );
    }
  },
};

module.exports = appointmentsController;
