const React = require("react");
const nodemailer = require("nodemailer");
const { render } = require("@react-email/render");
const WelcomeEmail = require("../../emails/default");

module.exports = async ({ username, description, company, companyImg }) => {
  try {
    // ✅ ADICIONE AWAIT AQUI
    const html = await render(
      React.createElement(WelcomeEmail, {
        username,
        description,
        companyImg,
        company,
      })
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transporter.sendMail({
      from: `"${company}" <${process.env.EMAIL_USER}>`,
      to: "newarch.nwa@gmail.com",
      subject: "Confirmação de agendamento",
      html,
    });

    console.log("✅ Email enviado com sucesso!");
    return { success: true };
  } catch (error) {
    console.error("❌ Erro ao enviar email:", error);
    throw error;
  }
};
