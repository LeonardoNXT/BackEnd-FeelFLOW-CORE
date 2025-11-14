const React = require("react");
const nodemailer = require("nodemailer");
const { render } = require("@react-email/render");
const OtpEmail = require("../../emails/otp");

module.exports = async ({ email, otp, name }) => {
  try {
    const html = await render(React.createElement(OtpEmail, { otp, name }));

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transporter.sendMail({
      from: `"FeelSystem" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Seu código de verificação",
      html,
    });

    return { success: true };
  } catch (error) {
    console.error("Erro ao enviar email:", error);
    throw error;
  }
};
