const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  // 1. Obter o token do cookie (httpOnly) ou do body
  const token =
    req.cookies?.token ||
    req.body.token ||
    req.headers.authorization?.replace("Bearer ", "");

  console.log("Token recebido:", token ? "Token presente" : "Token ausente");

  // 2. Verificar se o token existe
  if (!token) {
    return res.status(401).json({
      error: "Acesso negado",
      details: "Token não encontrado",
      solution: "Faça login novamente",
    });
  }

  try {
    // 3. Verificar se a chave secreta está configurada
    const secret = process.env.SECRET;
    if (!secret) {
      console.error("ERRO: Chave secreta JWT não configurada");
      throw new Error("Chave secreta JWT não configurada");
    }

    // 4. Verificar e decodificar o token
    const decoded = jwt.verify(token, secret);

    console.log("Token decodificado:", {
      id: decoded.id,
    });

    // 5. Adicionar informações do usuário à requisição
    req.user = {
      id: decoded.id,
    };

    next();
  } catch (err) {
    console.error("Erro na verificação do token:", err.message);

    // 6. Tratamento de erros específicos
    const errorResponse = {
      error: "Falha na autenticação",
      details: err.message,
      action: "Faça login novamente",
    };

    if (err.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ ...errorResponse, error: "Token expirado" });
    }

    if (err.name === "JsonWebTokenError") {
      return res
        .status(403)
        .json({ ...errorResponse, error: "Token inválido" });
    }

    return res.status(403).json(errorResponse);
  }
};
