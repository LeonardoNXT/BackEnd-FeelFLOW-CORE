const React = require("react");
const {
  Html,
  Head,
  Body,
  Container,
  Img,
  Section,
  Text,
  Heading,
  Preview,
} = require("@react-email/components");

const OtpEmail = ({ otp, name }) => {
  return React.createElement(
    Html,
    null,
    React.createElement(Head, null),
    React.createElement(Preview, null, `Seu código de verificação: ${otp}`),

    React.createElement(
      Body,
      {
        style: {
          margin: 0,
          padding: 0,
          backgroundColor: "#ffffff",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          color: "#000",
        },
      },

      React.createElement(
        Container,
        { style: { width: "100%", padding: "40px 0" } },

        React.createElement(
          Container,
          {
            style: {
              width: "100%",
              maxWidth: "520px",
              margin: "0 auto",
              padding: "0 20px",
            },
          },

          // Logo
          React.createElement(
            Section,
            { style: { textAlign: "center", marginBottom: "12px" } },
            React.createElement(Img, {
              src: "https://feelsystem.vercel.app/app.png",
              width: "40",
              alt: "FeelSystem",
              style: { margin: "20px auto" },
            })
          ),

          // Título
          React.createElement(
            Heading,
            {
              as: "h2",
              style: {
                fontSize: "24px",
                fontWeight: "700",
                marginBottom: "24px",
                lineHeight: "1.2",
                textAlign: "left",
              },
            },
            "Seu código de Autenticação de ",
            React.createElement("br"),
            "Dois Fatores:"
          ),

          // Código
          React.createElement(
            Section,
            {
              style: {
                background: "#f2f2f2",
                padding: "24px 0",
                borderRadius: "12px",
                textAlign: "center",
                fontSize: "36px",
                fontWeight: "700",
                letterSpacing: "4px",
                marginBottom: "32px",
              },
            },
            otp
          ),

          // Textos
          React.createElement(
            Text,
            {
              style: {
                fontSize: "15px",
                lineHeight: "1.6",
                marginBottom: "24px",
                color: "#333",
              },
            },
            `Olá, ${name},`
          ),

          React.createElement(
            Text,
            {
              style: {
                fontSize: "15px",
                lineHeight: "1.6",
                marginBottom: "24px",
                color: "#333",
              },
            },
            "Você tentou recentemente fazer a alteração da senha a partir de um novo dispositivo, navegador ou local. Para concluir sua alteração, use o código acima."
          ),

          React.createElement(
            Text,
            {
              style: {
                fontSize: "15px",
                lineHeight: "1.6",
                marginBottom: "24px",
                color: "#333",
              },
            },
            "Se não foi você, ",
            React.createElement(
              "a",
              { href: "#", style: { color: "#0078ff" } },
              "altere sua senha imediatamente"
            ),
            "."
          ),

          React.createElement(
            Text,
            {
              style: {
                fontSize: "15px",
                lineHeight: "1.6",
                marginBottom: "24px",
                color: "#333",
              },
            },
            "Cordialmente,",
            React.createElement("br"),
            "Equipe FeelSystem"
          ),

          // Divider
          React.createElement(Section, {
            style: {
              width: "100%",
              height: "1px",
              background: "#e5e5e5",
              margin: "40px 0",
            },
          }),

          // Footer
          React.createElement(
            Section,
            { style: { textAlign: "center", opacity: 0.8 } },
            React.createElement(Img, {
              src: "https://feelsystem.vercel.app/app.png",
              width: "40",
              alt: "FeelSystem",
            }),
            React.createElement(
              Text,
              { style: { fontSize: "13px", marginTop: "12px" } },
              "© 2025 FeelSystem. Todos os direitos reservados."
            )
          )
        )
      )
    )
  );
};

module.exports = OtpEmail;
