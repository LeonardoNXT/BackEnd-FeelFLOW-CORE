const chromium = require("@sparticuz/chromium");
const puppeteerCore = require("puppeteer-core");
const mongoose = require("mongoose");

// Helper para detectar ambiente de produção
function isProductionEnvironment() {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.NODE_ENV === "production"
  );
}

async function generatePatientListPDFBuffer(patients, config) {
  const { professional, organization, status } = config;

  const getStatusStyle = (status) => {
    const styles = {
      Ativo: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
      Inativo: { bg: "#fafafa", text: "#737373", border: "#d4d4d4" },
    };
    return styles[status] || styles.Ativo;
  };

  const statusStyle = status ? getStatusStyle(status) : null;
  const totalPatients = patients.length;

  const formatDate = (date) =>
    new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  const calculateAge = (birthDate) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  };

  const patientCards = patients
    .map(
      (patient, index) => `
    <div class="patient-card">
      <div class="card-header">
        <span class="card-number">#${String(index + 1).padStart(3, "0")}</span>
        <span class="card-mini-status" style="background: ${getStatusStyle(patient.status).bg}; color: ${getStatusStyle(patient.status).text}; border-color: ${getStatusStyle(patient.status).border};">${patient.status}</span>
      </div>
      <div class="card-content">
        <div class="patient-name-section">
          <div class="patient-name">${patient.name}</div>
          <div class="patient-email">${patient.email}</div>
        </div>
        
        <div class="card-divider"></div>
        
        <div class="card-row">
          <div class="card-info">
            <div class="card-label">Data de Nascimento</div>
            <div class="card-value">${formatDate(patient.birth_date)}</div>
            <div class="card-value-secondary">${calculateAge(patient.birth_date)} anos</div>
          </div>
          <div class="card-info">
            <div class="card-label">Profissão</div>
            <div class="card-value">${patient.profession || "Não informada"}</div>
          </div>
        </div>

        ${
          patient.contacts?.phone || patient.contacts?.emergency_contact
            ? `
        <div class="card-row">
          ${
            patient.contacts?.phone
              ? `
          <div class="card-info">
            <div class="card-label">Telefone</div>
            <div class="card-value">${patient.contacts.phone}</div>
          </div>
          `
              : ""
          }
          ${
            patient.contacts?.emergency_contact
              ? `
          <div class="card-info">
            <div class="card-label">Contato de Emergência</div>
            <div class="card-value">${patient.contacts.emergency_name || "Não informado"}</div>
            <div class="card-value-secondary">${patient.contacts.emergency_contact}</div>
          </div>
          `
              : ""
          }
        </div>
        `
            : ""
        }

        ${
          patient.address?.city || patient.address?.state
            ? `
        <div class="card-row">
          <div class="card-info">
            <div class="card-label">Endereço</div>
            <div class="card-value">
              ${patient.address.street ? `${patient.address.street}${patient.address.number ? `, ${patient.address.number}` : ""}` : ""}
            </div>
            <div class="card-value-secondary">
              ${patient.address.neighborhood ? `${patient.address.neighborhood}, ` : ""}${patient.address.city || ""}${patient.address.state ? ` - ${patient.address.state}` : ""}
            </div>
          </div>
        </div>
        `
            : ""
        }



        <div class="card-footer">
          <div class="card-info-small">
            <span class="card-label-inline">Cadastrado em:</span>
            <span class="card-value-inline">${formatDate(patient.createdAt)}</span>
          </div>
        </div>
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
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; background: #ffffff; padding: 40px; color: #09090b; line-height: 1.6; -webkit-font-smoothing: antialiased; }
          .container { max-width: 800px; margin: 0 auto; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; }
          .header { padding: 48px 48px 32px; border-bottom: 1px solid #e4e4e7; }
          .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
          .logo-area h1 { font-size: 24px; font-weight: 600; color: #09090b; letter-spacing: -0.5px; margin-bottom: 4px; }
          .logo-area p { font-size: 14px; color: #71717a; }
          .status-badge { display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 500; border: 1px solid; letter-spacing: -0.2px; }
          .document-title { font-size: 14px; font-weight: 500; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; }
          .content { padding: 48px; }
          .section { margin-bottom: 40px; }
          .section-title { font-size: 14px; font-weight: 600; color: #09090b; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.3px; }
          .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 32px; }
          .stat-card { background: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 20px; text-align: center; }
          .stat-value { font-size: 28px; font-weight: 600; color: #09090b; margin-bottom: 4px; }
          .stat-label { font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.3px; }
          .info-card { background: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 20px; margin-bottom: 12px; }
          .info-label { font-size: 11px; font-weight: 600; color: #71717a; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
          .info-value { font-size: 15px; color: #09090b; font-weight: 500; line-height: 1.4; }
          .info-value-secondary { font-size: 13px; color: #a1a1aa; margin-top: 4px; }
          .divider { height: 1px; background: #e4e4e7; margin: 40px 0; }
          .patient-card { background: #ffffff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin-bottom: 16px; page-break-inside: avoid; }
          .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f4f4f5; }
          .card-number { font-size: 12px; font-weight: 600; color: #71717a; letter-spacing: 0.5px; }
          .card-mini-status { font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 4px; border: 1px solid; }
          .card-content { display: flex; flex-direction: column; gap: 12px; }
          .patient-name-section { margin-bottom: 8px; }
          .patient-name { font-size: 18px; font-weight: 600; color: #09090b; margin-bottom: 4px; }
          .patient-email { font-size: 13px; color: #71717a; }
          .card-divider { height: 1px; background: #f4f4f5; margin: 12px 0; }
          .card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .card-row.full-width { grid-template-columns: 1fr; }
          .card-info { display: flex; flex-direction: column; }
          .card-label { font-size: 11px; font-weight: 500; color: #71717a; margin-bottom: 4px; letter-spacing: 0.2px; }
          .card-value { font-size: 14px; color: #09090b; font-weight: 500; }
          .card-value-secondary { font-size: 12px; color: #a1a1aa; margin-top: 2px; }
          .disorders-info { background: #f9fafb; padding: 12px; border-radius: 4px; border: 1px solid #e4e4e7; }
          .disorders-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
          .disorder-tag { display: inline-block; background: #ffffff; border: 1px solid #e4e4e7; padding: 4px 10px; border-radius: 4px; font-size: 11px; color: #09090b; font-weight: 500; }
          .card-footer { margin-top: 8px; padding-top: 12px; border-top: 1px solid #f4f4f5; }
          .card-info-small { display: flex; gap: 8px; align-items: center; }
          .card-label-inline { font-size: 11px; color: #71717a; }
          .card-value-inline { font-size: 11px; color: #09090b; font-weight: 500; }
          .empty-state { text-align: center; padding: 60px 20px; color: #71717a; }
          .empty-state-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.3; }
          .footer { background: #fafafa; padding: 24px 48px; border-top: 1px solid #e4e4e7; border-radius: 0 0 8px 8px; }
          .footer-content { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #71717a; }
          @media print { body { padding: 0; background: white; } }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="header-top">
              <div class="logo-area">
                <h1>Relatório de Pacientes</h1>
                <p>${organization?.name || "Sistema de Gestão Clínica"}</p>
              </div>
              ${statusStyle ? `<span class="status-badge" style="background: ${statusStyle.bg}; color: ${statusStyle.text}; border-color: ${statusStyle.border};">${status}</span>` : ""}
            </div>
            <div class="document-title">Documento Oficial</div>
          </div>
          <div class="content">
            <div class="section">
              <h2 class="section-title">Resumo</h2>
              <div class="stats-grid">
                <div class="stat-card"><div class="stat-value">${totalPatients}</div><div class="stat-label">Total de Pacientes</div></div>
                <div class="stat-card"><div class="stat-value">${patients.filter((p) => p.status === "Ativo").length}</div><div class="stat-label">Pacientes Ativos</div></div>
              </div>
              <div class="info-card">
                <div class="info-label">Profissional Responsável</div>
                <div class="info-value">${professional?.name || "Não informado"}</div>
                ${professional?.email ? `<div class="info-value-secondary">${professional.email}</div>` : ""}
              </div>
            </div>
            <div class="divider"></div>
            <div class="section">
              <h2 class="section-title">Lista de Pacientes (${totalPatients})</h2>
              ${totalPatients > 0 ? patientCards : `<div class="empty-state"><div class="empty-state-icon">👥</div><p>Nenhum paciente encontrado</p></div>`}
            </div>
          </div>
          <div class="footer">
            <div class="footer-content">
              <span>Documento gerado automaticamente</span>
              <span>${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const isProduction = isProductionEnvironment();
  console.log(
    `🔍 Ambiente: ${isProduction ? "PRODUÇÃO (Vercel/Lambda)" : "LOCAL"}`
  );

  let browser;

  if (isProduction) {
    console.log("🚀 Inicializando puppeteer-core + @sparticuz/chromium");
    browser = await puppeteerCore.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  } else {
    console.log("🔧 Inicializando puppeteer local");
    try {
      const puppeteer = require("puppeteer");
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } catch (error) {
      throw new Error(
        "Puppeteer não está instalado. Execute: npm install puppeteer"
      );
    }
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

async function generatePatientReportPDF(params) {
  const {
    professionalId,
    status,
    populateFields = [],
    additionalFilters = {},
  } = params;

  try {
    if (!professionalId) throw new Error("professionalId é obrigatório");
    if (!mongoose.Types.ObjectId.isValid(professionalId))
      throw new Error(`professionalId inválido: "${professionalId}"`);

    if (status) {
      const validStatuses = ["Ativo", "Inativo"];
      if (!validStatuses.includes(status))
        throw new Error(
          `Status inválido: "${status}". Valores aceitos: ${validStatuses.join(", ")}`
        );
    }

    console.log("=== Gerando PDF de Pacientes ===");
    console.log("professionalId:", professionalId);
    console.log("status:", status || "Todos");

    const Customer = require("../../models/Customer");
    const Employee = require("../../models/Employee");

    const query = { patient_of: professionalId, ...additionalFilters };
    if (status) {
      query.status = status;
    }

    let patientsQuery = Customer.find(query).select(
      "-password -anamnese_pdf -appointments -parents_or_guardians -medical_history -assessment -treatment_objectives -mood_diary"
    );

    if (Array.isArray(populateFields) && populateFields.length > 0) {
      populateFields.forEach((field) => {
        if (typeof field === "string") {
          patientsQuery = patientsQuery.populate(field);
        } else if (typeof field === "object" && field.path) {
          patientsQuery = patientsQuery.populate(field);
        }
      });
    }

    const patients = await patientsQuery.lean();
    console.log(`✓ Encontrados ${patients.length} pacientes`);

    const professional = await Employee.findById(professionalId)
      .select("name email")
      .lean();
    if (!professional)
      console.warn(`⚠ Profissional não encontrado: ${professionalId}`);
    else console.log(`✓ Profissional: ${professional.name}`);

    let organization = null;
    if (patients.length > 0 && patients[0].client_of) {
      const Organization = require("../../models/Organization");
      organization = await Organization.findById(patients[0].client_of)
        .select("name")
        .lean();
      if (organization) console.log(`✓ Organização: ${organization.name}`);
    }

    const pdfBuffer = await generatePatientListPDFBuffer(patients, {
      status,
      professional,
      organization,
    });

    console.log("✓ PDF gerado com sucesso");
    console.log("===================================");

    return {
      success: true,
      buffer: pdfBuffer,
      count: patients.length,
      patients,
    };
  } catch (error) {
    console.error("❌ Erro ao gerar relatório PDF:", error.message);
    throw error;
  }
}

module.exports = {
  generatePatientListPDFBuffer,
  generatePatientReportPDF,
};
