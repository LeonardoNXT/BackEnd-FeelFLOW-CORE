const redis = require("../lib/redis");

async function rateLimit(req, res, next) {
  const ip = req.ip;

  const key = `rate-limit:${ip}`;

  // incrementa o contador
  const count = await redis.incr(key);

  // na primeira vez, seta expiração
  if (count === 1) {
    await redis.expire(key, 60); // 60 segundos
  }

  // permite 5 tentativas por minuto
  if (count > 10) {
    return res.status(429).json({
      error: "Muitas tentativas. Tente novamente em 1 minuto.",
    });
  }

  next();
}

module.exports = rateLimit;
