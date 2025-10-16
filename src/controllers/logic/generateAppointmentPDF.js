const puppeteer = require("puppeteer");
const Appointment = require("../../models/Appointments");

async function generateAppointmentPDFBuffer(appointmentId) {
  const appointment = await Appointment.findById(appointmentId)
    .populate("createdBy", "name email")
    .populate("intendedFor", "name email")
    .populate("organization", "name")
    .lean();

  console.log("[PDF] : ", appointment);

  if (!appointment) throw new Error("Agendamento não encontrado");

  const getStatusStyle = (status) => {
    const styles = {
      pending: { bg: "#fafafa", text: "#171717", border: "#e5e5e5" },
      confirmed: { bg: "#18181b", text: "#fafafa", border: "#18181b" },
      completed: { bg: "#fafafa", text: "#171717", border: "#171717" },
      cancelled: { bg: "#fafafa", text: "#737373", border: "#d4d4d4" },
    };
    return styles[status] || styles.pending;
  };

  const statusStyle = getStatusStyle(appointment.status);
  const statusLabels = {
    pending: "Pendente",
    confirmed: "Confirmado",
    completed: "Concluído",
    cancelled: "Cancelado",
  };

  const html = `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            background: #ffffff;
            padding: 40px;
            color: #09090b;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
          }
          
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e4e4e7;
            border-radius: 8px;
          }
          
          .header {
            padding: 48px 48px 32px;
            border-bottom: 1px solid #e4e4e7;
          }
          
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
          }
          
          .logo-area h1 {
            font-size: 24px;
            font-weight: 600;
            color: #09090b;
            letter-spacing: -0.5px;
            margin-bottom: 4px;
          }
          
          .logo-area p {
            font-size: 14px;
            color: #71717a;
          }
          
          .status-badge {
            display: inline-flex;
            align-items: center;
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            background: ${statusStyle.bg};
            color: ${statusStyle.text};
            border: 1px solid ${statusStyle.border};
            letter-spacing: -0.2px;
          }
          
          .document-title {
            font-size: 14px;
            font-weight: 500;
            color: #71717a;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .content {
            padding: 48px;
          }
          
          .section {
            margin-bottom: 40px;
          }
          
          .section:last-child {
            margin-bottom: 0;
          }
          
          .section-title {
            font-size: 14px;
            font-weight: 600;
            color: #09090b;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
          }
          
          .info-item {
            padding: 0;
          }
          
          .info-label {
            font-size: 12px;
            font-weight: 500;
            color: #71717a;
            margin-bottom: 6px;
            letter-spacing: 0.2px;
          }
          
          .info-value {
            font-size: 14px;
            color: #09090b;
            font-weight: 400;
            line-height: 1.5;
          }
          
          .info-value-secondary {
            font-size: 13px;
            color: #a1a1aa;
            margin-top: 4px;
          }
          
          .info-item.full-width {
            grid-column: 1 / -1;
          }
          
          .card {
            background: #fafafa;
            border: 1px solid #e4e4e7;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 12px;
          }
          
          .card:last-child {
            margin-bottom: 0;
          }
          
          .card-label {
            font-size: 11px;
            font-weight: 600;
            color: #71717a;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .card-value {
            font-size: 15px;
            color: #09090b;
            font-weight: 500;
            line-height: 1.4;
          }
          
          .divider {
            height: 1px;
            background: #e4e4e7;
            margin: 40px 0;
          }
          
          .footer {
            background: #fafafa;
            padding: 24px 48px;
            border-top: 1px solid #e4e4e7;
            border-radius: 0 0 8px 8px;
          }
          
          .footer-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: #71717a;
          }
          
          .badge-check {
            display: inline-block;
            width: 14px;
            height: 14px;
            background: #18181b;
            color: #ffffff;
            border-radius: 3px;
            text-align: center;
            line-height: 14px;
            font-size: 10px;
            margin-right: 6px;
          }
          
          .badge-x {
            display: inline-block;
            width: 14px;
            height: 14px;
            background: #e4e4e7;
            color: #71717a;
            border-radius: 3px;
            text-align: center;
            line-height: 14px;
            font-size: 10px;
            margin-right: 6px;
          }
          
          @media print {
            body {
              padding: 0;
              background: white;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="header-top">
              <div class="logo-area">
                <h1>Relatório de Agendamento</h1>
                <p>ID: ${appointment._id}</p>
              </div>
              <span class="status-badge">${statusLabels[appointment.status] || appointment.status}</span>
            </div>
            <div class="document-title">Documento Oficial</div>
          </div>
          
          <div class="content">
            <div class="section">
              <h2 class="section-title">Informações Gerais</h2>
              <div class="info-grid">
                <div class="info-item">
                  <div class="info-label">Data de Criação</div>
                  <div class="info-value">${new Date(
                    appointment.createdAt
                  ).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}</div>
                </div>
                
                <div class="info-item">
                  <div class="info-label">Horário de Criação</div>
                  <div class="info-value">${new Date(
                    appointment.createdAt
                  ).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}</div>
                </div>
                
                <div class="info-item">
                  <div class="info-label">Data da Consulta</div>
                  <div class="info-value">${new Date(
                    appointment.startTime
                  ).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}</div>
                </div>
                
                <div class="info-item">
                  <div class="info-label">Horário</div>
                  <div class="info-value">${new Date(
                    appointment.startTime
                  ).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })} - ${new Date(appointment.endTime).toLocaleTimeString(
                    "pt-BR",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )}</div>
                </div>
                
                <div class="info-item">
                  <div class="info-label">Duração</div>
                  <div class="info-value">${appointment.duration} minutos</div>
                </div>
                
                <div class="info-item">
                  <div class="info-label">Notificação</div>
                  <div class="info-value">
                    ${appointment.send_email ? '<span class="badge-check">✓</span>Email enviado' : '<span class="badge-x">✗</span>Não enviado'}
                  </div>
                </div>
              </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="section">
              <h2 class="section-title">Participantes</h2>
              
              <div class="card">
                <div class="card-label">Psicólogo Responsável</div>
                <div class="card-value">${appointment.createdBy?.name || "Não informado"}</div>
                ${appointment.createdBy?.email ? `<div class="info-value-secondary">${appointment.createdBy.email}</div>` : ""}
              </div>
              
              <div class="card">
                <div class="card-label">Paciente</div>
                <div class="card-value">${appointment.intendedFor?.name || "Não informado"}</div>
                ${appointment.intendedFor?.email ? `<div class="info-value-secondary">${appointment.intendedFor.email}</div>` : ""}
              </div>
              
              ${
                appointment.organization?.name
                  ? `
              <div class="card">
                <div class="card-label">Organização</div>
                <div class="card-value">${appointment.organization.name}</div>
              </div>
              `
                  : ""
              }
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-content">
              <span>Documento gerado automaticamente</span>
              <span>${new Date().toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })} às ${new Date().toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}</span>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
  });
  await browser.close();

  return pdfBuffer;
}

module.exports = { generateAppointmentPDFBuffer };
