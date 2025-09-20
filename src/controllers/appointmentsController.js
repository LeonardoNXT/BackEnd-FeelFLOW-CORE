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
    const dateNow = new Date().getTime();

    try {
      let appointments = [];

      if (role === "patient") {
        appointments = await Appointment.find({
          intendedFor: userId,
          date: { $gt: new Date() },
        })
          .populate("createdBy", "name avatar")
          .sort({ date: -1 });
      } else if (role === "employee") {
        appointments = await Appointment.find({
          createdBy: userId,
          date: { $gt: new Date() },
        })
          .populate("intendedFor", "name avatar") // opcional: mostrar pra quem é
          .sort({ date: -1 });
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
};

module.exports = appointmentsController;
