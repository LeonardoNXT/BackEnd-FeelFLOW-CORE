const Notification = require("../../models/Notification");
module.exports = async ({
  title,
  summary,
  organization,
  created_for,
  kind,
  notification_type,
}) => {
  try {
    const newNotification = await Notification.create({
      title,
      summary,
      organization,
      created_for,
      kind,
      notification_type,
    });

    return newNotification;
  } catch (error) {
    console.error("Erro ao criar notificação:", error);
    throw error;
  }
};
