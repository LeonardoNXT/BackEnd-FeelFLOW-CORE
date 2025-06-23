// src/middlewares/upload.js
const multer = require("multer");

// Configuração do Multer para upload de arquivos
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos de imagem são permitidos"), false);
    }
  },
});

// Middleware de tratamento de erros do multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "Arquivo muito grande. Máximo 5MB." });
    }
    return res.status(400).json({ error: "Erro no upload do arquivo." });
  }

  if (error.message === "Apenas arquivos de imagem são permitidos") {
    return res.status(400).json({ error: error.message });
  }

  next(error);
};

module.exports = { upload, handleMulterError };
