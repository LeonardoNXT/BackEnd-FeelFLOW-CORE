require("dotenv").config();
const express = require("express");
const app = express();
const mongoose = require("mongoose");

// configuração ante-scamming
const cors = require("cors");
const cookieParser = require("cookie-parser");

// configuração basica de rotas
const router = require("./routes");

// IMPORTANTE: A ordem das configurações importa
app.use(cookieParser());
app.use(express.json());

// CORS configurado ANTES das rotas
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "https://feelsystem.vercel.app", // ✅ Manter para casos diretos
      ];

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, true); // ✅ Permitir rewrites do Vercel
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

// Rotas DEPOIS do CORS
app.use(router);

// Verificação das variáveis de ambiente
if (!process.env.CONNECTIONDB || !process.env.PORT) {
  console.error("Variáveis de ambiente ausentes. Verifique o arquivo .env.");
  process.exit(1);
}

// Conexão com MongoDB
mongoose
  .connect(process.env.CONNECTIONDB)
  .then(() => {
    console.log("O MongoDB foi conectado com sucesso pela API");
    app.emit("running");
  })
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });

app.on("running", () => {
  app.listen(process.env.PORT, () => {
    console.log();
    console.log(`Servidor rodando em http://127.0.0.1:${process.env.PORT}`);
    console.log();
  });
});
