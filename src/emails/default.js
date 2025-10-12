const React = require("react");
const {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} = require("@react-email/components");

const WelcomeEmail = ({ username, company, description, companyImg }) => {
  const previewText = `Welcome to ${company}, ${username}!`;

  return React.createElement(
    Html,
    null,
    React.createElement(Head, null),
    React.createElement(Preview, null, previewText),
    React.createElement(
      Tailwind,
      null,
      React.createElement(
        Body,
        {
          style: {
            backgroundColor: "black",
            margin: "auto",
            fontFamily: "var(--font-sans)",
          },
        },
        React.createElement(
          Container,
          {
            style: {
              marginBottom: "40px",
              marginLeft: "auto",
              marginRight: "auto",
              padding: "20px",
              width: "465px",
            },
          },
          React.createElement(
            Section,
            { style: { marginTop: "40px" } },
            React.createElement(Img, {
              src: companyImg,
              width: "60",
              height: "60",
              alt: `Logo ${company}`,
              style: { margin: "0", marginLeft: "auto", marginRight: "auto" },
            })
          ),
          React.createElement(
            Heading,
            {
              style: {
                fontSize: "24px",
                color: "white",
                fontWeight: "normal",
                textAlign: "center",
                margin: "0",
                marginTop: "32px",
                marginLeft: "0",
                marginRight: "0",
              },
            },
            "Welcome to ",
            React.createElement("strong", null, company),
            ", ",
            username,
            "!"
          ),
          React.createElement(
            Text,
            { style: { textAlign: "start", fontSize: "14px", color: "white" } },
            `Hello ${username},`
          ),
          React.createElement(
            Text,
            {
              style: {
                textAlign: "start",
                fontSize: "14px",
                color: "white",
                lineHeight: "1.625",
              },
            },
            description
          ),
          React.createElement(
            Section,
            {
              style: {
                textAlign: "center",
                marginTop: "32px",
                marginBottom: "32px",
              },
            },
            React.createElement(
              Button,
              {
                style: {
                  padding: "10px 20px",
                  backgroundColor: "white",
                  borderRadius: "6px",
                  color: "black",
                  fontSize: "14px",
                  fontWeight: "600",
                  textDecoration: "none",
                  textAlign: "center",
                },
                href: "https://example.com/get-started",
              },
              "Get Started"
            )
          ),
          React.createElement(
            Text,
            { style: { textAlign: "start", fontSize: "14px", color: "white" } },
            "Cheers,",
            React.createElement("br", null),
            `The ${company} Team`
          )
        )
      )
    )
  );
};

module.exports = WelcomeEmail;
