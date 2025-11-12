const bcrypt = require("bcrypt");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const Organization = require("../models/Organization");
const Employee = require("../models/Employee");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      resource_type: "image",
      folder: "organizations/avatars",
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
        { quality: "auto", fetch_format: "auto" },
      ],
      ...options,
    };

    cloudinary.uploader
      .upload_stream(uploadOptions, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      })
      .end(buffer);
  });
};

// Obter dados do usuário autenticado
exports.meUser = async (req, res) => {
  try {
    console.log(req.user.role);
    let user = null;
    switch (req.user.role) {
      case "adm":
        user = await Organization.findById(req.user.id);
        break;
      case "employee":
        user = await Employee.findById(req.user.id).populate({
          path: "patients",
          select: "name email avatar status",
        });
        break;
      case "patient":
        user = await Customer.findById(req.user.id);
        break;
    }

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

const deleteFromCloudinary = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
};

exports.updateOrganization = async (req, res) => {
  try {
    const organizationId = req.user.id;
    const { name, email, cnpj, telefone, password, confirmPassword } = req.body;

    // Busca a organização
    const organization =
      await Organization.findById(organizationId).select("+password");

    if (!organization) {
      return res.status(404).json({ msg: "Organização não encontrada." });
    }

    // Objeto para armazenar os campos a serem atualizados
    const updateFields = {};

    // Validação e atualização do nome
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(422).json({ msg: "O nome não pode estar vazio." });
      }
      if (name.trim().length < 3) {
        return res
          .status(422)
          .json({ msg: "O nome deve ter pelo menos 3 caracteres." });
      }
      updateFields.name = name.trim();
    }

    // Validação e atualização do email
    if (email !== undefined) {
      if (!email || email.trim().length === 0) {
        return res.status(422).json({ msg: "O email não pode estar vazio." });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(422).json({ msg: "Formato de email inválido." });
      }

      // Verifica se o email já está sendo usado por outra organização
      const emailExists = await Organization.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: organizationId },
      });

      if (emailExists) {
        return res
          .status(422)
          .json({ msg: "Este email já está sendo utilizado." });
      }

      updateFields.email = email.toLowerCase().trim();
    }

    // Validação e atualização do CNPJ
    if (cnpj !== undefined) {
      if (cnpj && cnpj.trim().length > 0) {
        // Remove caracteres não numéricos
        const cnpjClean = cnpj.replace(/[^\d]/g, "");

        if (cnpjClean.length !== 14) {
          return res.status(422).json({ msg: "CNPJ deve conter 14 dígitos." });
        }

        updateFields.cnpj = cnpj.trim();
      } else {
        updateFields.cnpj = "";
      }
    }

    // Validação e atualização do telefone
    if (telefone !== undefined) {
      if (telefone && telefone.trim().length > 0) {
        const telefoneClean = telefone.replace(/[^\d]/g, "");

        if (telefoneClean.length < 10 || telefoneClean.length > 11) {
          return res
            .status(422)
            .json({ msg: "Telefone inválido. Deve conter 10 ou 11 dígitos." });
        }

        updateFields.telefone = telefone.trim();
      } else {
        updateFields.telefone = "";
      }
    }

    // Validação e atualização da senha
    if (password !== undefined) {
      if (!password || password.trim().length === 0) {
        return res.status(422).json({ msg: "A senha não pode estar vazia." });
      }

      if (password.length < 6) {
        return res
          .status(422)
          .json({ msg: "A senha deve ter pelo menos 6 caracteres." });
      }

      if (password !== confirmPassword) {
        return res.status(422).json({ msg: "As senhas não coincidem." });
      }

      // Criptografa a nova senha
      const salt = await bcrypt.genSalt(
        Number(process.env.BCRYPT_SALT_ROUNDS) || 12
      );
      updateFields.password = await bcrypt.hash(password, salt);
    }

    // Se não houver campos para atualizar
    if (Object.keys(updateFields).length === 0) {
      return res
        .status(400)
        .json({ msg: "Nenhum campo válido para atualizar." });
    }

    // Atualiza a organização
    const updatedOrganization = await Organization.findByIdAndUpdate(
      organizationId,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select("-password");

    return res.status(200).json({
      msg: "Dados atualizados com sucesso.",
      organization: updatedOrganization,
    });
  } catch (error) {
    console.error("Erro ao atualizar organização:", error);
    return res.status(500).json({
      msg: "Erro ao atualizar os dados. Tente novamente mais tarde.",
    });
  }
};

exports.updateOrganizationAvatar = async (req, res) => {
  try {
    const organizationId = req.user.id;

    // Verifica se um arquivo foi enviado
    if (!req.file) {
      return res.status(400).json({ msg: "Nenhuma imagem foi enviada." });
    }

    // Busca a organização
    const organization = await Organization.findById(organizationId);

    if (!organization) {
      return res.status(404).json({ msg: "Organização não encontrada." });
    }

    // Se já existe um avatar, deleta o anterior do Cloudinary
    if (organization.avatar && organization.avatar.public_id) {
      try {
        await deleteFromCloudinary(organization.avatar.public_id);
      } catch (deleteError) {
        console.error("Erro ao deletar avatar anterior:", deleteError);
        // Continua mesmo se falhar ao deletar a imagem antiga
      }
    }

    // Faz upload da nova imagem
    const uploadResult = await uploadToCloudinary(req.file.buffer, {
      folder: "organizations/avatars",
    });

    // Atualiza o avatar na organização
    organization.avatar = {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };

    await organization.save();

    return res.status(200).json({
      msg: "Avatar atualizado com sucesso.",
      avatar: organization.avatar,
    });
  } catch (error) {
    console.error("Erro ao atualizar avatar:", error);
    return res.status(500).json({
      msg: "Erro ao atualizar o avatar. Tente novamente mais tarde.",
    });
  }
};

exports.removeOrganizationAvatar = async (req, res) => {
  try {
    const organizationId = req.user.id;

    // Busca a organização
    const organization = await Organization.findById(organizationId);

    if (!organization) {
      return res.status(404).json({ msg: "Organização não encontrada." });
    }

    // Verifica se existe um avatar
    if (!organization.avatar || !organization.avatar.public_id) {
      return res.status(400).json({ msg: "Nenhum avatar para remover." });
    }

    // Deleta a imagem do Cloudinary
    try {
      await deleteFromCloudinary(organization.avatar.public_id);
    } catch (deleteError) {
      console.error("Erro ao deletar avatar do Cloudinary:", deleteError);
    }

    // Remove o avatar da organização
    organization.avatar = {
      url: "",
      public_id: "",
    };

    await organization.save();

    return res.status(200).json({
      msg: "Avatar removido com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao remover avatar:", error);
    return res.status(500).json({
      msg: "Erro ao remover o avatar. Tente novamente mais tarde.",
    });
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
