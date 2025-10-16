const puppeteer = require("puppeteer");
const mongoose = require("mongoose");

/**
 * Gera PDF buffer com lista de appointments filtrados por status
 * @param {Array} appointments - Lista de appointments
 * @param {Object} config - Configurações do PDF
 * @param {string} config.status - Status dos appointments
 * @param {Object} config.professional - Dados do profissional {name, email}
 * @param {Object} config.organization - Dados da organização {name}
 * @param {Object} config.period - Período {startDate, endDate} (opcional)
 * @returns {Promise<Buffer>} - Buffer do PDF gerado
 */
async function generateAppointmentListPDFBuffer(appointments, config) {
  const { status, professional, organization, period } = config;

  const getStatusStyle = (status) => {
    const styles = {
      disponivel: { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
      agendado: { bg: "#18181b", text: "#fafafa", border: "#18181b" },
      concluido: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
      cancelado: { bg: "#fafafa", text: "#737373", border: "#d4d4d4" },
    };
    return styles[status] || styles.disponivel;
  };

  const statusStyle = getStatusStyle(status);
  const statusLabels = {
    disponivel: "Disponível",
    agendado: "Agendado",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };

  // Estatísticas
  const totalAppointments = appointments.length;
  const totalDuration = appointments.reduce(
    (sum, apt) => sum + (apt.duration || 0),
    0
  );
  const totalHours = (totalDuration / 60).toFixed(1);

  // Função para formatar data
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPeriod = () => {
    if (!period?.startDate && !period?.endDate) return "Todos os períodos";
    if (period.startDate && period.endDate) {
      return `${formatDate(period.startDate)} até ${formatDate(period.endDate)}`;
    }
    if (period.startDate) return `A partir de ${formatDate(period.startDate)}`;
    if (period.endDate) return `Até ${formatDate(period.endDate)}`;
    return "Todos os períodos";
  };

  // Gerar cards de appointments
  const appointmentCards = appointments
    .map(
      (apt, index) => `
    <div class="appointment-card">
      <div class="card-header">
        <span class="card-number">#${String(index + 1).padStart(3, "0")}</span>
        <span class="card-mini-status" style="background: ${statusStyle.bg}; color: ${statusStyle.text}; border-color: ${statusStyle.border};">
          ${statusLabels[apt.status]}
        </span>
      </div>
      
      <div class="card-content">
        <div class="card-row">
          <div class="card-info">
            <div class="card-label">Data da Consulta</div>
            <div class="card-value">${formatDate(apt.startTime)}</div>
          </div>
          <div class="card-info">
            <div class="card-label">Horário</div>
            <div class="card-value">${formatTime(apt.startTime)} - ${formatTime(apt.endTime)}</div>
          </div>
        </div>
        
        <div class="card-row">
          <div class="card-info">
            <div class="card-label">Duração</div>
            <div class="card-value">${apt.duration} minutos</div>
          </div>
          <div class="card-info">
            <div class="card-label">Criado em</div>
            <div class="card-value">${formatDate(apt.createdAt)}</div>
          </div>
        </div>
        
        ${
          apt.intendedFor
            ? `
        <div class="card-row full-width">
          <div class="card-info patient-info">
            <div class="card-label">Paciente</div>
            <div class="card-value">${apt.intendedFor.name}</div>
            ${apt.intendedFor.email ? `<div class="card-value-secondary">${apt.intendedFor.email}</div>` : ""}
          </div>
        </div>
        `
            : ""
        }
        
        ${
          apt.acceptedAt && status === "agendado"
            ? `
        <div class="card-row">
          <div class="card-info">
            <div class="card-label">Agendado em</div>
            <div class="card-value">${formatDate(apt.acceptedAt)} às ${formatTime(apt.acceptedAt)}</div>
          </div>
        </div>
        `
            : ""
        }
      </div>
    </div>
  `
    )
    .join("");

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
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
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
          
          .section-title {
            font-size: 14px;
            font-weight: 600;
            color: #09090b;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 32px;
          }
          
          .stat-card {
            background: #fafafa;
            border: 1px solid #e4e4e7;
            border-radius: 6px;
            padding: 20px;
            text-align: center;
          }
          
          .stat-value {
            font-size: 28px;
            font-weight: 600;
            color: #09090b;
            margin-bottom: 4px;
          }
          
          .stat-label {
            font-size: 12px;
            color: #71717a;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          
          .info-card {
            background: #fafafa;
            border: 1px solid #e4e4e7;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 12px;
          }
          
          .info-label {
            font-size: 11px;
            font-weight: 600;
            color: #71717a;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .info-value {
            font-size: 15px;
            color: #09090b;
            font-weight: 500;
            line-height: 1.4;
          }
          
          .info-value-secondary {
            font-size: 13px;
            color: #a1a1aa;
            margin-top: 4px;
          }
          
          .divider {
            height: 1px;
            background: #e4e4e7;
            margin: 40px 0;
          }
          
          .appointment-card {
            background: #ffffff;
            border: 1px solid #e4e4e7;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 16px;
            page-break-inside: avoid;
          }
          
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid #f4f4f5;
          }
          
          .card-number {
            font-size: 12px;
            font-weight: 600;
            color: #71717a;
            letter-spacing: 0.5px;
          }
          
          .card-mini-status {
            font-size: 11px;
            font-weight: 500;
            padding: 4px 10px;
            border-radius: 4px;
            border: 1px solid;
          }
          
          .card-content {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          
          .card-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          
          .card-row.full-width {
            grid-template-columns: 1fr;
          }
          
          .card-info {
            display: flex;
            flex-direction: column;
          }
          
          .card-label {
            font-size: 11px;
            font-weight: 500;
            color: #71717a;
            margin-bottom: 4px;
            letter-spacing: 0.2px;
          }
          
          .card-value {
            font-size: 14px;
            color: #09090b;
            font-weight: 500;
          }
          
          .card-value-secondary {
            font-size: 12px;
            color: #a1a1aa;
            margin-top: 2px;
          }
          
          .patient-info {
            background: #f9fafb;
            padding: 12px;
            border-radius: 4px;
            border: 1px solid #e4e4e7;
          }
          
          .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #71717a;
          }
          
          .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.3;
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
                <h1>Relatório de Agendamentos</h1>
                <p>${organization?.name || "Sistema de Agendamentos"}</p>
              </div>
              <span class="status-badge">${statusLabels[status]}</span>
            </div>
            <div class="document-title">Documento Oficial</div>
          </div>
          
          <div class="content">
            <div class="section">
              <h2 class="section-title">Resumo</h2>
              
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-value">${totalAppointments}</div>
                  <div class="stat-label">Total</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${totalHours}h</div>
                  <div class="stat-label">Duração Total</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${totalDuration}min</div>
                  <div class="stat-label">Minutos</div>
                </div>
              </div>
              
              <div class="info-card">
                <div class="info-label">Profissional Responsável</div>
                <div class="info-value">${professional?.name || "Não informado"}</div>
                ${professional?.email ? `<div class="info-value-secondary">${professional.email}</div>` : ""}
              </div>
              
              <div class="info-card">
                <div class="info-label">Período</div>
                <div class="info-value">${formatPeriod()}</div>
              </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="section">
              <h2 class="section-title">Lista de Agendamentos (${totalAppointments})</h2>
              
              ${
                totalAppointments > 0
                  ? appointmentCards
                  : `
              <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <p>Nenhum agendamento encontrado com o status "${statusLabels[status]}"</p>
              </div>
              `
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
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
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

/**
 * Função principal para buscar appointments e gerar PDF
 * @param {Object} params - Parâmetros da busca e geração
 */
async function generateAppointmentReportPDF(params) {
  const {
    professionalId,
    status,
    populateFields = ["intendedFor", "organization"],
    additionalFilters = {},
  } = params;

  try {
    // ========== VALIDAÇÕES CRÍTICAS ==========

    // 1. Validar professionalId
    if (!professionalId) {
      throw new Error("professionalId é obrigatório");
    }

    if (!mongoose.Types.ObjectId.isValid(professionalId)) {
      throw new Error(
        `professionalId inválido: "${professionalId}". Deve ser um ObjectId válido (24 caracteres hexadecimais).`
      );
    }

    // 2. Validar status
    const validStatuses = ["disponivel", "agendado", "concluido", "cancelado"];
    if (!status) {
      throw new Error("status é obrigatório");
    }

    if (!validStatuses.includes(status)) {
      throw new Error(
        `Status inválido: "${status}". Valores aceitos: ${validStatuses.join(", ")}`
      );
    }

    // 3. Log para debug
    console.log("=== Gerando PDF de Appointments ===");
    console.log("professionalId:", professionalId);
    console.log("status:", status);
    console.log(
      "additionalFilters:",
      JSON.stringify(additionalFilters, null, 2)
    );

    // ========== BUSCAR DADOS ==========

    const Appointment = require("../../models/Appointments");
    const Employee = require("../../models/Employee");

    // Construir query
    const query = {
      createdBy: professionalId,
      status,
      ...additionalFilters,
    };

    console.log("Query MongoDB:", JSON.stringify(query, null, 2));

    // Buscar appointments
    let appointmentsQuery = Appointment.find(query);

    // Aplicar populate
    if (Array.isArray(populateFields)) {
      populateFields.forEach((field) => {
        if (typeof field === "string") {
          appointmentsQuery = appointmentsQuery.populate(field);
        } else if (typeof field === "object" && field.path) {
          appointmentsQuery = appointmentsQuery.populate(field);
        }
      });
    }

    const appointments = await appointmentsQuery.lean();
    console.log(`✓ Encontrados ${appointments.length} agendamentos`);

    // Buscar dados do profissional
    const professional = await Employee.findById(professionalId)
      .select("name email")
      .lean();

    if (!professional) {
      console.warn(`⚠ Profissional não encontrado: ${professionalId}`);
    } else {
      console.log(`✓ Profissional: ${professional.name}`);
    }

    // Buscar dados da organização
    let organization = null;
    if (appointments.length > 0 && appointments[0].organization) {
      organization = appointments[0].organization;
      console.log(`✓ Organização: ${organization.name}`);
    }

    // ========== GERAR PDF ==========

    const pdfBuffer = await generateAppointmentListPDFBuffer(appointments, {
      status,
      professional,
      organization,
      period: {
        startDate: additionalFilters.startTime?.$gte,
        endDate: additionalFilters.startTime?.$lte,
      },
    });

    console.log("✓ PDF gerado com sucesso");
    console.log("===================================");

    return {
      success: true,
      buffer: pdfBuffer,
      count: appointments.length,
      appointments,
    };
  } catch (error) {
    console.error("❌ Erro ao gerar relatório PDF:");
    console.error("Mensagem:", error.message);
    console.error("Stack:", error.stack);
    throw error;
  }
}

module.exports = {
  generateAppointmentListPDFBuffer,
  generateAppointmentReportPDF,
};
