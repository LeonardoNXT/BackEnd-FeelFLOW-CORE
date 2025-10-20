const Appointment = require("../models/Appointments");
const Employee = require("../models/Employee");
const Customer = require("../models/Customer");
const CONFIG_PROPERTYS = require("./logic/configPropertys");
const verifyPolicy = require("./logic/verifyPolicy");
const SendNotification = require("./logic/sendNotification");
const NOTIFICATION_CONFIG = require("./logic/notificationConfigAppoitments");
const sendNotification = require("./logic/sendNotification");
const errorHelper = require("./logic/errorHelper");
const GET_APPOINTMENTS_CONFIG = require("./logic/configGetAppointmentPerRole");
const GetAppointments = require("./logic/getPerIDAndRole");
const DefaultSendEmail = require("./logic/emailsend");
const mongoose = require("mongoose");
const { generateAppointmentReportPDF } = require("./logic/generatePDFperRole");
const {
  generateAppointmentPDFBuffer,
} = require("./logic/generateAppointmentPDF");

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
  async createAvailability(req, res) {
    const { user } = req;
    const userId = user.id;
    const organization = user.organization;
    const role = user.role;

    try {
      // Apenas funcionários (psicólogos) podem criar disponibilidades
      if (role !== "employee") {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message: "Apenas funcionários podem criar disponibilidades.",
        });
      }

      const { startTime, duration } = req.body;

      if (!startTime || !duration) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message: "Informe o horário inicial e a duração em minutos.",
        });
      }

      const start = new Date(startTime);
      const end = new Date(start.getTime() + duration * 60000);

      if (start.getHours() >= 22 || end.getHours() >= 22) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message:
            "O horário de início ou de término não pode ultrapassar 22 horas.",
        });
      }
      if (start.getHours() < 6 || end.getHours() < 6) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message:
            "O horário de começo ou de término não pode ser inferior a 6 horas.",
        });
      }

      // Verifica se já existe conflito de horário
      const conflict = await Appointment.findOne({
        createdBy: userId,
        status: { $in: ["disponivel", "agendado"] },
        $or: [{ startTime: { $lt: end }, endTime: { $gt: start } }],
      });

      if (conflict) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message:
            "Este horário conflita com outra disponibilidade/agendamento.",
        });
      }

      // Cria a disponibilidade
      const availability = await Appointment.create({
        createdBy: userId,
        organization,
        startTime: start,
        endTime: end,
        duration,
        status: "disponivel",
      });

      return res.status(201).json({
        message: "Disponibilidade criada com sucesso.",
        availability,
      });
    } catch (err) {
      console.error("Erro ao criar disponibilidade:", err);
      return errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
        message: "Erro ao criar disponibilidade.",
      });
    }
  },
  async getAvailables(req, res) {
    const { user } = req;
    const userId = user.id;
    const role = user.role;
    const createdBy = user.patient_of;

    try {
      let query = {};

      if (role === "employee") {
        // Funcionário vê as próprias disponibilidades
        query = {
          createdBy: userId,
          status: "disponivel",
          startTime: { $gt: new Date() },
        };
      } else if (role === "patient") {
        // Paciente vê todas as disponibilidades gerais
        query = {
          createdBy: createdBy,
          status: "disponivel",
          startTime: { $gt: new Date() },
        };
      } else {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message: "Usuário não autorizado a listar disponibilidades.",
        });
      }

      const appointments = await Appointment.find(query)
        .populate("createdBy", "name avatar")
        .populate("organization", "name avatar")
        .populate("intendedFor", "name avatar")
        .sort({ startTime: 1 });

      const firstAppointment = appointments[0];

      return res.status(200).json({
        message: "Disponibilidades carregadas com sucesso.",
        total: appointments.length,
        appointments,
      });
    } catch (err) {
      console.error("Erro ao listar disponibilidades:", err);
      return errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
        message: "Erro interno ao carregar disponibilidades.",
      });
    }
  },
  async updateAvailability(req, res) {
    const { user } = req;
    const userId = user.id;
    const role = user.role;
    const { appointmentId, newStartTime, newDuration } = req.body;

    try {
      if (role !== "employee") {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message: "Apenas funcionários podem alterar disponibilidades.",
        });
      }

      if (!appointmentId || !newStartTime || !newDuration) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message: "Informe o ID, a nova data/hora inicial e a nova duração.",
        });
      }

      const appointment = await Appointment.findOne({
        _id: appointmentId,
        createdBy: userId,
        status: "disponivel",
      });

      if (!appointment) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message: "Disponibilidade não encontrada ou já reservada.",
        });
      }

      const newStart = new Date(newStartTime);
      const newEnd = new Date(newStart.getTime() + newDuration * 60000);

      console.log("[HORAS]", {
        comeco: newStart.getHours(),
        fim: newEnd.getHours(),
      });

      if (newStart.getHours() >= 22 || newEnd.getHours() >= 22) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message:
            "O horário de início ou de término não pode ultrapassar 22 horas.",
        });
      }
      if (newStart.getHours() < 6 || newEnd.getHours() < 6) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message:
            "O horário de começo ou de término não pode ser inferior a 6 horas.",
        });
      }

      // Verifica se há conflito com outros horários do mesmo psicólogo
      const conflict = await Appointment.findOne({
        createdBy: userId,
        _id: { $ne: appointmentId },
        status: { $in: ["disponivel", "agendado"] },
        $or: [{ startTime: { $lt: newEnd }, endTime: { $gt: newStart } }],
      });

      if (conflict) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message:
            "O novo horário entra em conflito com outro agendamento existente.",
        });
      }

      appointment.startTime = newStart;
      appointment.endTime = newEnd;
      appointment.duration = newDuration;
      await appointment.save();

      return res.status(200).json({
        message: "Disponibilidade atualizada com sucesso.",
        updated: appointment,
      });
    } catch (err) {
      console.error("Erro ao atualizar disponibilidade:", err);
      return errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
        message: "Erro ao atualizar disponibilidade.",
      });
    }
  },
  async getUncheckedAppointments(req, res) {
    const { id, role } = req.user;

    try {
      const uncheckedAppointments = await GetAppointments(
        Appointment,
        id,
        role,
        GET_APPOINTMENTS_CONFIG,
        { status: "cancelado" }
      );

      res.status(200).json({
        sucesso: "Os agendamentos cancelados foram enviados com sucesso",
        total: uncheckedAppointments.length,
        uncheckedAppointments,
      });
    } catch (err) {
      console.log("Erro ao buscar agendamentos cancelados:", err);
      errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
      });
    }
  },
  async deleteAvailability(req, res) {
    const { user } = req;
    const userId = user.id;
    const role = user.role;
    const { appointmentId } = req.body;

    try {
      if (role !== "employee") {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message: "Apenas funcionários podem deletar disponibilidades.",
        });
      }

      if (!appointmentId) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message: "Informe o ID da disponibilidade que deseja deletar.",
        });
      }

      const appointment = await Appointment.findOne({
        _id: appointmentId,
        createdBy: userId,
        status: "disponivel",
      });

      if (!appointment) {
        return errorHelper({
          res,
          ...VALIDATE_ERROR_CONFIG,
          message: "Disponibilidade não encontrada ou já agendada.",
        });
      }

      await appointment.deleteOne();

      return res.status(200).json({
        message: "Disponibilidade removida com sucesso.",
        deletedId: appointmentId,
      });
    } catch (err) {
      console.error("Erro ao deletar disponibilidade:", err);
      return errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
        message: "Erro ao deletar disponibilidade.",
      });
    }
  },
  async cancelScheduleAppointments(req, res) {
    const userID = req.user.id;
    const { role } = req.user;
    const id = req.body.id;

    console.log("[CANCEL SCHEDULE]", {
      APPOINTMENT_ID: id,
      role,
      USER_ID: userID,
    });

    if (!id) {
      return errorHelper({ res, ...ID_ERROR_CONFIG });
    }

    let appointmentFind = null;

    switch (role) {
      case "adm":
        appointmentFind = await Appointment.findOne({
          _id: id,
          organization: userID,
        });
        break;
      case "employee":
        console.log("[EMPLOYEE]");
        appointmentFind = await Appointment.findOne({
          _id: id,
          createdBy: userID,
        });
        break;
      default:
        appointmentFind = await Appointment.findOne({
          _id: id,
          intendedFor: userID,
        });
    }

    if (!appointmentFind) {
      return errorHelper({ res, ...FIND_APPOIMENT_ERROR_CONFIG });
    }

    if (
      appointmentFind.status === "pendente" ||
      appointmentFind.status === "cancelado" ||
      appointmentFind.status === "concluido"
    ) {
      return errorHelper({
        res,
        ...FIND_APPOIMENT_ERROR_CONFIG,
        message: `O agendamento não pode ter seu estado alterado. Ele está ${appointmentFind.status}`,
      });
    }

    try {
      const updatedAppointment = await Appointment.findByIdAndUpdate(
        id,
        {
          status: "cancelado",
        },
        { new: true }
      );

      await SendNotification({
        organization: updatedAppointment.organization,
        created_for: updatedAppointment.intendedFor,
        ...NOTIFICATION_CONFIG.UNCHECK_APPOINTMENT_PATIENT,
      });
      await SendNotification({
        organization: updatedAppointment.organization,
        created_for: updatedAppointment.createdBy,
        ...NOTIFICATION_CONFIG.UNCHECK_APPOINTMENT_PATIENT,
      });
      res.status(200).json({
        message: "[SUCESSO] : O agendamento foi cancelado com sucesso!",
        appointment: updatedAppointment,
      });
    } catch (err) {
      console.log(err);
      return errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async scheduleAppointment(req, res) {
    const id = req.body.id;
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

    try {
      const updateState = await Appointment.findByIdAndUpdate(
        id,
        {
          status: "agendado",
          intendedFor: userId,
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
      r;
    } catch (err) {
      console.log(err);
      return errorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
      });
    }
  },
  async getAllConfirmAppointments(req, res) {
    const userId = req.user.id;
    const { role } = req.user;

    let existing = null;

    const now = new Date();

    try {
      if (role == "employee") {
        existing = await Appointment.find({
          createdBy: userId,
          status: "agendado",
          startTime: { $gt: now },
        })
          .populate("intendedFor", "name avatar")
          .sort({ date: 1 });
      }
      if (role == "patient") {
        existing = await Appointment.find({
          intendedFor: userId,
          status: "agendado",
          startTime: { $gt: now },
        })
          .populate("createdBy", "name avatar")
          .sort({ date: 1 });
      }

      res.status(200).json({
        message: "Os agendamentos confirmados foram listados com sucesso.",
        appointments: existing,
      });
    } catch (er) {
      console.log(err);
      errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async getAllPastConfirmAppointments(req, res) {
    const userId = req.user.id;
    const { role } = req.user;
    const now = new Date();
    try {
      const appointments = await GetAppointments(
        Appointment,
        userId,
        role,
        GET_APPOINTMENTS_CONFIG,
        {
          status: "agendado",
          startTime: { $lt: now },
          endTime: { $lt: now },
        },
        [
          { path: "createdBy", select: "name avatar" },
          { path: "intendedFor", select: "name avatar" },
        ]
      );
      if (!appointments.length) {
        return res.status(200).json({
          message: "Nenhum agendamento passado foi encontrado.",
          appointments: [],
        });
      }
      res.status(200).json({
        message: "Os agendamentos confirmados foram listados com sucesso.",
        appointments,
      });
    } catch (err) {
      console.log(err);
      errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async completeAppointment(req, res) {
    const userID = req.user.id;
    const { role } = req.user;
    const id = req.body.id;

    console.log("[COMPLTE SCHEDULE]", {
      APPOINTMENT_ID: id,
      role,
      USER_ID: userID,
    });

    if (!id) {
      return errorHelper({ res, ...ID_ERROR_CONFIG });
    }

    let appointmentFind = null;

    switch (role) {
      case "adm":
        appointmentFind = await Appointment.findOne({
          _id: id,
          organization: userID,
        });
        break;
      case "employee":
        console.log("[EMPLOYEE]");
        appointmentFind = await Appointment.findOne({
          _id: id,
          createdBy: userID,
        });
        break;
      default:
        appointmentFind = await Appointment.findOne({
          _id: id,
          intendedFor: userID,
        });
    }

    if (!appointmentFind) {
      return errorHelper({ res, ...FIND_APPOIMENT_ERROR_CONFIG });
    }

    if (
      appointmentFind.status === "pendente" ||
      appointmentFind.status === "cancelado" ||
      appointmentFind.status === "concluido"
    ) {
      return errorHelper({
        res,
        ...FIND_APPOIMENT_ERROR_CONFIG,
        message: `O agendamento não pode ter seu estado alterado. Ele está ${appointmentFind.status}`,
      });
    }

    try {
      const updatedAppointment = await Appointment.findByIdAndUpdate(
        id,
        {
          status: "concluido",
        },
        { new: true }
      );

      await SendNotification({
        organization: updatedAppointment.organization,
        created_for: updatedAppointment.intendedFor,
        ...NOTIFICATION_CONFIG.COMPLETE_APPOINTMENT_PATIENT,
      });
      await SendNotification({
        organization: updatedAppointment.organization,
        created_for: updatedAppointment.createdBy,
        ...NOTIFICATION_CONFIG.COMPLETE_APPOINTMENT_EMPLOYEE,
      });
      res.status(200).json({
        message: "[SUCESSO] : O agendamento foi concluido com sucesso!",
        appointment: updatedAppointment,
      });
    } catch (err) {
      console.log(err);
      return errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async getAllCompleteAppointments(req, res) {
    const userId = req.user.id;
    const { role } = req.user;

    try {
      const completeAppointments = await GetAppointments(
        Appointment,
        userId,
        role,
        GET_APPOINTMENTS_CONFIG,
        {
          status: "concluido",
        },
        [
          {
            path: "intendedFor",
            select: "name avatar",
          },
          {
            path: "createdBy",
            select: "name avatar",
          },
          {
            path: "organization",
            select: "name avatar",
          },
        ]
      );

      const total = completeAppointments.length;

      if (completeAppointments.length === 0) {
        return res.status(200).json({
          message: "Não há nenhum agendamento completo disponível",
        });
      }

      res.status(200).json({
        message: "Os agendamentos completos foram listados com sucesso.",
        appointments: completeAppointments,
        total,
      });
    } catch (err) {
      console.log(err);
      errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async getAllCanceledCAppointments(req, res) {
    const userId = req.user.id;
    const { role } = req.user;

    try {
      const completeAppointments = await GetAppointments(
        Appointment,
        userId,
        role,
        GET_APPOINTMENTS_CONFIG,
        {
          status: "cancelado",
        },
        [
          {
            path: "intendedFor",
            select: "name avatar",
          },
          {
            path: "createdBy",
            select: "name avatar",
          },
          {
            path: "organization",
            select: "name avatar",
          },
        ]
      );

      const total = completeAppointments.length;

      if (completeAppointments.length === 0) {
        return res.status(200).json({
          message: "Não há nenhum agendamento completo disponível",
        });
      }

      res.status(200).json({
        message: "Os agendamentos completos foram listados com sucesso.",
        appointments: completeAppointments,
        total,
      });
    } catch (err) {
      console.log(err);
      errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async getAppointmentPDF(req, res) {
    const id = req.params.id || req.body.id;

    if (!id) {
      return errorHelper({ res, ...ID_ERROR_CONFIG });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "ID inválido",
        message: `O ID "${id}" não é um ObjectId válido. Deve ter 24 caracteres hexadecimais.`,
        received: id,
      });
    }

    try {
      const pdfBuffer = await generateAppointmentPDFBuffer(id);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=agendamento_${id}.pdf`,
        "Content-Length": pdfBuffer.length,
      });

      res.send(pdfBuffer);
    } catch (err) {
      console.error("Erro ao gerar PDF individual:", err);
      errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async getAllCanceledAppointmentPDF(req, res) {
    const userId = req.user.id;
    try {
      const result = await generateAppointmentReportPDF({
        professionalId: userId,
        status: "cancelado",
        populateFields: [
          { path: "intendedFor", select: "name email" },
          { path: "organization", select: "name" },
        ],
      });

      console.log(`PDF gerado: ${result.count} agendamentos cancelados`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=agendamentos_cancelados_${Date.now()}.pdf`
      );
      res.send(result.buffer);
    } catch (err) {
      console.error(err);
      errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async getAllPastConfirmAppointmentPDF(req, res) {
    const userId = req.user.id;
    try {
      const result = await generateAppointmentReportPDF({
        professionalId: userId,
        status: "agendado",
        populateFields: [
          { path: "intendedFor", select: "name email" },
          { path: "organization", select: "name" },
        ],
        additionalFilters: {
          startTime: {
            $lte: new Date(),
          },
        },
      });

      console.log(`PDF gerado: ${result.count} agendamentos cancelados`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=agendamentos_confirmados_${Date.now()}.pdf`
      );
      res.send(result.buffer);
    } catch (err) {
      console.error(err);
      errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async getAllConfirmAppointmentPDF(req, res) {
    const userId = req.user.id;
    try {
      const result = await generateAppointmentReportPDF({
        professionalId: userId,
        status: "agendado",
        populateFields: [
          { path: "intendedFor", select: "name email" },
          { path: "organization", select: "name" },
        ],
        additionalFilters: {
          startTime: {
            $gte: new Date(),
          },
        },
      });

      console.log(`PDF gerado: ${result.count} agendamentos cancelados`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=agendamentos_confirmados_${Date.now()}.pdf`
      );
      res.send(result.buffer);
    } catch (err) {
      console.error(err);
      errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async getAllPendingAppointmentPDF(req, res) {
    const userId = req.user.id;
    try {
      const result = await generateAppointmentReportPDF({
        professionalId: userId,
        status: "disponivel",
        populateFields: [
          { path: "intendedFor", select: "name email" },
          { path: "organization", select: "name" },
        ],
        additionalFilters: {
          startTime: {
            $gte: new Date(),
          },
        },
      });

      console.log(`PDF gerado: ${result.count} agendamentos cancelados`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=agendamentos_pendenetes_${Date.now()}.pdf`
      );
      res.send(result.buffer);
    } catch (err) {
      console.error(err);
      errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
  async getAllCompleteAppointmentPDF(req, res) {
    const userId = req.user.id;
    try {
      const result = await generateAppointmentReportPDF({
        professionalId: userId,
        status: "concluido",
        populateFields: [
          { path: "intendedFor", select: "name email" },
          { path: "organization", select: "name" },
        ],
      });

      console.log(`PDF gerado: ${result.count} agendamentos cancelados`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=agendamentos_concluidos_${Date.now()}.pdf`
      );
      res.send(result.buffer);
    } catch (err) {
      console.error(err);
      errorHelper({ res, ...INTERNAL_ERROR_CONFIG });
    }
  },
};

module.exports = appointmentsController;
