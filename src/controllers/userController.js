const bcrypt = require("bcrypt");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const Organization = require("../models/Organization");
const Employee = require("../models/Employee");
const Customer = require("../models/Customer");

// Obter dados do usuário autenticado
exports.meUser = async (req, res) => {
  try {
    console.log(req.user.role);
    let user = null;
    switch (req.user.role) {
      case "adm":
        console.log("Ou usuário é um ", req.user.id);
        user = await Organization.findById(req.user.id);
        break;
      case "employee":
        console.log("Ou usuário é um ", req.user.id);
        user = await Employee.findById(req.user.id);
        break;
      case "patient":
        console.log("Ou usuário é um ", req.user.id);
        user = await Customer.findById(req.user.id);
        break;
    }
    console.log(user);

    if (!user) {
      return res.status(404).json({ msg: "O usuário não foi encontrado." });
    }

    return res.status(200).json([
      user,
      {
        role: req.user.role,
      },
    ]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: "Erro ao buscar usuário." });
  }
};

// Registrar novo usuário
exports.registerUser = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res
        .status(400)
        .json({ msg: "O corpo da requisição está vazio ou é inválido." });
    }
    const { name, email, password, confirmpassword } = req.body;

    if (!name)
      return res.status(422).json({ msg: "Preencha o nome corretamente." });
    if (!email)
      return res.status(422).json({ msg: "Preencha o email corretamente." });
    if (!password)
      return res.status(422).json({ msg: "Preencha a senha corretamente." });
    if (password !== confirmpassword) {
      return res.status(422).json({ msg: "As senhas estão diferentes." });
    }

    // Verifica se o usuário já existe
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(422).json({ msg: "Por favor, utilize outro email." });
    }

    // Criptografa a senha
    const salt = await bcrypt.genSalt(Number(process.env.BCRYPT_SALT_ROUNDS));
    const passwordHash = await bcrypt.hash(password, salt);

    // Cria o usuário
    const user = new User({ name, email, password: passwordHash });
    await user.save();
    return res.status(201).json({ msg: "Usuário criado com sucesso." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Ocorreu um erro no servidor, tente novamente mais tarde!",
    });
  }
};

// Login do usuário - VERSÃO CORRIGIDA
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email)
      return res.status(422).json({ msg: "Preencha o email corretamente." });
    if (!password)
      return res.status(422).json({ msg: "Preencha a senha corretamente." });

    // Verifica se o usuário existe
    const business = await Organization.findOne({ email }).select("+password");
    if (!business) {
      return res.status(404).json({ msg: "Usuário não foi encontrado." });
    }

    // Verifica se a senha está correta
    const checkPassword = await bcrypt.compare(password, business.password);
    if (!checkPassword) {
      return res
        .status(422)
        .json({ msg: "Senha incorreta. Por favor, tente novamente." });
    }

    // Gera o token JWT
    const token = jwt.sign({ id: business._id }, process.env.SECRET, {
      expiresIn: "7d",
    });

    // Configuração do cookie baseada no ambiente
    const isProduction = process.env.NODE_ENV === "production";
    const origin = req.get("origin") || req.get("referer");

    console.log("=== LOGIN DEBUG ===");
    console.log("Environment:", process.env.NODE_ENV);
    console.log("Origin:", origin);
    console.log("Is Production:", isProduction);

    // Configuração do cookie para produção (cross-origin)
    const cookieConfig = {
      httpOnly: true,
      secure: true, // Obrigatório com SameSite=None
      sameSite: "None",
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 7, // exemplo: 7 dias
    };

    if (isProduction && origin) {
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Cookie"
      );
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    res.cookie("token", token, cookieConfig);

    console.log("Cookie config:", cookieConfig);
    console.log("Token generated for user:", business._id);
    console.log("===================");

    return res.status(200).json({
      msg: "Autenticação realizada com sucesso.",
      user: {
        id: business._id,
        name: business.name,
        email: business.email,
        role: "adm",
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      msg: "Ocorreu um erro no servidor, tente novamente mais tarde!",
    });
  }
};

// ADICIONAR: Controller de verify - ESSENCIAL
exports.verify = async (req, res) => {
  try {
    console.log("=== VERIFY DEBUG ===");
    console.log("Cookies received:", req.cookies);
    console.log("Body received:", req.body);

    // Pega o token do body OU dos cookies
    const token = req.body.token || req.cookies.token;

    if (!token) {
      console.log("No token provided");
      return res.status(401).json({ msg: "Token não fornecido." });
    }

    console.log("Token present:", token ? "YES" : "NO");

    try {
      // Verifica o token JWT
      const decoded = jwt.verify(token, process.env.SECRET);
      console.log("Token decoded:", decoded);

      // Busca o usuário
      const user = await Organization.findById(decoded.id).select("-password");

      if (!user) {
        console.log("User not found for ID:", decoded.id);
        return res.status(404).json({ msg: "Usuário não encontrado." });
      }

      console.log("User found:", user._id);
      console.log("====================");

      return res.status(200).json({
        msg: "Token válido.",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
        },
      });
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError.message);
      return res.status(401).json({ msg: "Token inválido ou expirado." });
    }
  } catch (error) {
    console.error("Verify controller error:", error);
    return res.status(500).json({
      msg: "Erro interno do servidor.",
    });
  }
};
