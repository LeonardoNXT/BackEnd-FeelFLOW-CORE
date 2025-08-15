module.exports = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.role)) {
      return res.status(403).json({
        error: "Acesso negado",
        details: `Você precisa ser um dos seguintes: ${rolesPermitidos.join(
          ", "
        )}`,
      });
    }
    next();
  };
};
