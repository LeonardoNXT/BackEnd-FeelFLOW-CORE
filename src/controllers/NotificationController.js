const Notification = require("../models/Notification");
const ErrorHelper = require("./logic/errorHelper");

const INTERNAL_ERROR_CONFIG = {
  status: 500,
  error: "Erro interno",
  message: "Tente Novamente mais tarde.",
};

const notificationController = {
  async getAllNotificationsUser(req, res) {
    const { id } = req.user;

    try {
      const getAllAppointments = await Notification.find({
        created_for: id,
      });

      const unread = getAllAppointments.filter(
        (notification) => notification.status == "enviado"
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
};

module.exports = notificationController;
