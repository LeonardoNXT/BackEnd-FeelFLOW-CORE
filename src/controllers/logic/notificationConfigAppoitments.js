const PATIENT_APPOINTMENTS_NOTIFICATION = {
  kind: "Customer",
  notification_type: "Agendamento",
};
const EMPLOYEE_APPOINTMENTS_NOTIFICATION = {
  kind: "Employee",
  notification_type: "Agendamento",
};

module.exports = {
  CREATE_APPOINTMENT_PATIENT: {
    title: "Há um novo agendamento pendente.",
    summary:
      "Um novo agendamento pendente está disponível na área de agendamentos.",
    ...PATIENT_APPOINTMENTS_NOTIFICATION,
  },
  RESCHEDULE_APPOINTMENT_PATIENT: {
    title: "Houve uma remarcação de agendamento.",
    summary:
      "Houve uma remarcação no agendamento. É possível visualizar a alteração na área de agendamento.",
    ...PATIENT_APPOINTMENTS_NOTIFICATION,
  },
  UNCHECK_APPOINTMENT_PATIENT: {
    title: "Houve uma desmarcação de agendamento.",
    summary: "Há, na área de desmarcações, um novo agendamento.",
    ...PATIENT_APPOINTMENTS_NOTIFICATION,
  },
  SCHEDULE_APPOINTMENT_EMPLOYEE: {
    title: "Há um novo agendamento confirmado",
    summary:
      "Um novo agendamento confirmado está disponível na área de agendamentos.",
    ...EMPLOYEE_APPOINTMENTS_NOTIFICATION,
  },
};
