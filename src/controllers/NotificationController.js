const Notification = require("../models/Notification");
const errorHelper = require("./logic/errorHelper");
const ErrorHelper = require("./logic/errorHelper");

const INTERNAL_ERROR_CONFIG = {
  status: 500,
  error: "Erro interno",
  message: "Tente Novamente mais tarde.",
};

const ID_ERROR_CONFIG = {
  status: 404,
  error: "ID não encontrado",
  message: "O ID não foi colocado corretamente na requisição.",
};

const FIND_NOTIFICATION_ERROR_CONFIG = {
  status: 404,
  error: "Erro ao encontrar a notificação.",
  message: "Certifique-se da validade do ID da notificação.",
};
const VALIDATE_ERROR_CONFIG = {
  status: 401,
  error: "O usuário não foi autorizado.",
  message: "O usuário não pode efetuar a ação pelo seu nível de acesso.",
};

const notificationController = {
  async getAllNotificationsUser(req, res) {
    const { id } = req.user;

    try {
      const getAllAppointments = await Notification.find({
        created_for: id,
      });

      const unread = getAllAppointments.filter(
        (notification) => notification.status === "enviado"
      ).length;
      const length = getAllAppointments.length;

      return res.status(200).json({
        unread,
        total: length,
        getAllAppointments,
      });
    } catch (err) {
      console.error(err);
      return ErrorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
      });
    }
  },
  async readNotification(req, res) {
    const id = req.params.id || req.body.id;
    const userId = req.user.id;

    if (!id) {
      return ErrorHelper({
        res,
        ...ID_ERROR_CONFIG,
      });
    }
    const existing = await Notification.findById(id);

    if (!existing) {
      return ErrorHelper({
        res,
        ...FIND_NOTIFICATION_ERROR_CONFIG,
      });
    }

    const validateBy = existing.created_for.equals(userId);
    if (!validateBy) {
      return ErrorHelper({
        res,
        ...VALIDATE_ERROR_CONFIG,
      });
    }
    try {
      const updatedNotification = await Notification.findByIdAndUpdate(
        id,
        {
          status: "lido",
        },
        { new: true }
      );
      res.status(200).json({
        message: `A notificação ${updatedNotification._id} foi visualizada com sucesso.`,
        updatedNotification,
      });
    } catch (err) {
      console.log(err);
      ErrorHelper({
        res,
        ...INTERNAL_ERROR_CONFIG,
      });
    }
  },
};

module.exports = notificationController;
