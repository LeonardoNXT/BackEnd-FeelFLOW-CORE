const EMPLOYEE_COSTUMERS_NOTIFICATION = {
  kind: "Employee",
  notification_type: "Pacientes",
};

module.exports = {
  CREATE_PATIENT_NOTIFICATION_EMPLOYEE: {
    title: "Um novo paciente foi atrabuído",
    summary: "O paciente pode ser visto na área de pacientes.",
    ...EMPLOYEE_COSTUMERS_NOTIFICATION,
  },
};
