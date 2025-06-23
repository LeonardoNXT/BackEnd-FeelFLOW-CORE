const bcrypt = require("bcrypt");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const Organization = require("../models/Organization");
const Employee = require("../models/Employee");
const Customer = require("../models/Customer");

// Obter dados do usuário autenticado
exports.meUser = async (req, res) => {
  try {
    const user = await Organization.findById(req.user.id, "-password")
      .populate("employees")
      .populate("customers");

    if (!user) {
      return res.status(404).json({ msg: "O usuário não foi encontrado." });
    }

    return res.status(200).json({ user });
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

// Login do usuário
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

    // CORREÇÃO: Configuração dinâmica baseada no ambiente
    const isProduction = process.env.NODE_ENV === "production";
    const origin = req.get("origin") || req.get("referer");
    const isHTTPS = origin && origin.startsWith("https://");

    console.log("Environment:", process.env.NODE_ENV);
    console.log("Origin:", origin);
    console.log("Is HTTPS:", isHTTPS);

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction && isHTTPS, // HTTPS apenas em produção
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      path: "/",
      sameSite: isProduction ? "none" : "lax", // "none" para cross-origin em produção
      domain: isProduction ? undefined : undefined, // deixa o browser decidir
    });

    console.log("Cookie set with config:", {
      secure: isProduction && isHTTPS,
      sameSite: isProduction ? "none" : "lax",
    });

    return res.status(200).json({
      msg: "Autenticação realizada com sucesso.",
      // Opcional: retornar o token também no body para debug
      ...(process.env.NODE_ENV === "development" && { token }),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Ocorreu um erro no servidor, tente novamente mais tarde!",
    });
  }
};
