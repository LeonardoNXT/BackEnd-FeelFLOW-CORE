const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const Customer = require("../models/Customer");
const Employee = require("../models/Employee");
const Organization = require("../models/Organization");
require("../models/Appointments");

// Configuração do Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Função para fazer upload no Cloudinary
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      resource_type: "image",
      folder: "customers/avatars",
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

const customersController = {
  // Criar novo cliente/paciente
  async createCustomer(req, res) {
    try {
      const { name, email, password, birth_date, patient_of } = req.body;

      console.log("📥 Dados recebidos:", {
        name,
        email,
        birth_date,
        patient_of,
      });

      // Validações básicas obrigatórias
      if (!name || !email || !password || !birth_date || !patient_of) {
        return res.status(400).json({
          error: "Todos os campos obrigatórios devem ser preenchidos",
          missing_fields: {
            name: !name,
            email: !email,
            password: !password,
            birth_date: !birth_date,
            patient_of: !patient_of,
          },
        });
      }

      // Validar formato da senha (mínimo 6 caracteres)
      if (password.length < 6) {
        return res.status(400).json({
          error: "A senha deve ter pelo menos 6 caracteres",
        });
      }

      // Validar formato do email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // regex de email pego no github ---
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: "Formato de email inválido",
        });
      }

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // Verificar se já existe cliente com mesmo email
      const existingCustomer = await Customer.findOne({
        email: email.toLowerCase(),
      });

      if (existingCustomer) {
        return res.status(409).json({
          error: "Já existe um cliente com este email",
        });
      }

      // Hash da senha
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Preparar dados do cliente
      const customerData = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        birth_date: new Date(birth_date),
        patient_of,
        client_of: req.user.id, // Quem está criando o cliente
        status: "Ativo",
      };

      // Upload do avatar se fornecido
      if (req.file) {
        try {
          console.log("📸 Fazendo upload do avatar...");
          const uploadResult = await uploadToCloudinary(req.file.buffer, {
            public_id: `customer_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`,
          });

          customerData.avatar = {
            url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
          };

          console.log(
            "✅ Upload do avatar concluído:",
            uploadResult.secure_url
          );
        } catch (uploadError) {
          console.error("❌ Erro no upload do avatar:", uploadError);
          return res.status(500).json({
            error: "Erro ao fazer upload da imagem",
            details: uploadError.message,
          });
        }
      }

      // Criar cliente
      const newCustomer = new Customer(customerData);
      const savedCustomer = await newCustomer.save();

      console.log("✅ Cliente salvo no banco:", savedCustomer._id);

      // Adicionar cliente à lista de pacientes do funcionário
      try {
        await Employee.findByIdAndUpdate(
          patient_of, // pega o id do funcionario
          {
            $addToSet: { patients: savedCustomer._id },
          },
          { new: true }
        );

        // Adiciona O Paciente ao custumers da organizacao
        await Organization.findByIdAndUpdate(
          req.user.id, // id do adm
          {
            $addToSet: { customers: savedCustomer._id },
          },
          {
            new: true,
          }
        );

        console.log(
          `✅ Cliente ${savedCustomer._id} adicionado ao funcionário ${patient_of}`
        );
      } catch (empUpdateError) {
        console.error("❌ Erro ao atualizar funcionário:", empUpdateError);

        // Deletar o cliente criado para manter consistência
        await Customer.findByIdAndDelete(savedCustomer._id);

        return res.status(500).json({
          error: "Erro ao associar cliente ao funcionário",
          details: empUpdateError.message,
        });
      }

      // Remover senha da resposta
      const customerResponse = savedCustomer.toObject();
      delete customerResponse.password;

      console.log("🎉 Cliente criado com sucesso:", {
        id: customerResponse._id,
        name: customerResponse.name,
      });

      res.status(201).json({
        message: "Cliente criado com sucesso",
        customer: customerResponse,
      });
    } catch (error) {
      console.error("❌ Erro ao criar cliente:", error);

      // Se houve erro após upload, limpar imagem do Cloudinary
      if (req.uploadedPublicId) {
        try {
          await cloudinary.uploader.destroy(req.uploadedPublicId);
        } catch (cleanupError) {
          console.error("❌ Erro ao limpar imagem:", cleanupError);
        }
      }

      // Tratamento de erros específicos do MongoDB
      if (error.name === "ValidationError") {
        const validationErrors = Object.values(error.errors).map(
          (err) => err.message
        );
        return res.status(400).json({
          error: "Dados inválidos",
          details: validationErrors,
        });
      }

      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(409).json({
          error: `Já existe um registro com este ${field}`,
        });
      }

      res.status(500).json({
        error: "Erro interno do servidor",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erro ao processar solicitação",
      });
    }
  },
  async customerLogin(req, res) {
    try {
      const { email, password, mobile } = req.body;
      if (!email)
        return res.status(422).json({ msg: "Preencha o email corretamente." });
      if (!password)
        return res.status(422).json({ msg: "Preencha a senha corretamente." });

      // Verifica se o usuário existe
      const patient = await Customer.findOne({ email }).select("+password");
      if (!patient) {
        return res.status(404).json({ msg: "Usuário não foi encontrado." });
      }

      // Verifica se a senha está correta
      const checkPassword = await bcrypt.compare(password, patient.password);
      if (!checkPassword) {
        return res
          .status(422)
          .json({ msg: "Senha incorreta. Por favor, tente novamente." });
      }

      // Gera o token JWT
      const token = jwt.sign({ id: patient._id }, process.env.SECRET, {
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
      console.log("Token generated for user:", patient._id);
      console.log("===================");

      if (mobile) {
        return res.status(200).json({
          msg: "Autenticação realizada com sucesso.",
          token: token,
          user: {
            id: patient._id,
            name: patient.name,
            email: patient.email,
          },
        });
      } else {
        return res.status(200).json({
          msg: "Autenticação realizada com sucesso.",
          user: {
            id: patient._id,
            name: patient.name,
            email: patient.email,
            role: "patient",
          },
        });
      }
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({
        msg: "Ocorreu um erro no servidor, tente novamente mais tarde!",
      });
    }
  },

  // Atualizar senha do cliente
  async updateCustomerPassword(req, res) {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;

      // Validações básicas
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          error: "Senha atual e nova senha são obrigatórias",
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          error: "A nova senha deve ter pelo menos 6 caracteres",
        });
      }

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // Buscar cliente com senha
      const customer = await Customer.findOne({
        _id: id,
        client_of: req.user.id,
      }).select("+password");

      if (!customer) {
        return res.status(404).json({
          error:
            "Cliente não encontrado ou você não tem permissão para editá-lo",
        });
      }

      // Verificar senha atual
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        customer.password
      );

      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          error: "Senha atual incorreta",
        });
      }

      // Hash da nova senha
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Atualizar senha
      await Customer.findByIdAndUpdate(id, {
        password: hashedNewPassword,
      });

      res.json({
        message: "Senha atualizada com sucesso",
      });
    } catch (error) {
      console.error("Erro ao atualizar senha:", error);
      res.status(500).json({ error: "Erro ao atualizar senha" });
    }
  },

  // Listar clientes
  async getCustomers(req, res) {
    try {
      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      console.log("Buscando clientes para o usuário:", req.user.id);

      // Buscar todos os clientes que pertencem ao usuário autenticado
      let customers = null;

      if (req.user.role == "adm") {
        customers = await Customer.find({
          client_of: req.user.id,
        })
          .select("-password")
          .populate("patient_of", "name email")
          .populate("appointments")
          .sort({ createdAt: -1 });
      } else {
        customers = await Customer.find({
          patient_of: req.user.id,
        })
          .select("-password")
          .populate("patient_of", "name email")
          .populate("appointments")
          .sort({ createdAt: -1 });
      }

      console.log(`Encontrados ${customers.length} clientes`);

      // Retornar todos os clientes
      res.json({
        customers,
        total: customers.length,
        message: "Clientes listados com sucesso",
      });
    } catch (error) {
      console.error("Erro ao listar clientes:", error);
      res.status(500).json({
        error: "Erro ao buscar clientes",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // Buscar cliente por ID
  async getCustomerById(req, res) {
    try {
      const { id } = req.params;

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // Buscar apenas clientes que pertencem ao usuário autenticado
      if (req.user.role == "adm") {
        const customer = await Customer.findOne({
          _id: id,
          client_of: req.user.id,
        })
          .select("-password")
          .populate("patient_of", "name email")
          .populate("client_of", "name")
          .populate("appointments");

        if (!customer) {
          return res.status(404).json({
            error:
              "Cliente não encontrado ou você não tem permissão para acessá-lo",
          });
        }
        res.json({ customer });
      }
      if (req.user.role == "employee") {
        const customer = await Customer.findOne({
          _id: id,
          patient_of: req.user.id,
        })
          .select("-password")
          .populate("patient_of", "name email")
          .populate("client_of", "name")
          .populate("appointments");

        if (!customer) {
          return res.status(404).json({
            error:
              "Cliente não encontrado ou você não tem permissão para acessá-lo",
          });
        }
        res.json({ customer });
      }
    } catch (error) {
      console.error("Erro ao buscar cliente:", error);
      res.status(500).json({ error: "Erro ao buscar cliente" });
    }
  },

  // Atualizar cliente
  async updateCustomer(req, res) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // Remover campos que não devem ser atualizados diretamente
      delete updateData.password; // Senha deve ser atualizada via endpoint específico
      delete updateData._id;
      delete updateData.client_of; // Não permitir alterar o dono do cliente
      delete updateData.appointments; // Appointments são gerenciados separadamente

      // Verificar se o cliente pertence ao usuário
      const existingCustomer = await Customer.findOne({
        _id: id,
        client_of: req.user.id,
      });

      if (!existingCustomer) {
        return res.status(404).json({
          error:
            "Cliente não encontrado ou você não tem permissão para editá-lo",
        });
      }

      // Se está alterando o funcionário responsável, verificar se é válido
      if (updateData.patient_of) {
        const employee = await Employee.findOne({
          _id: updateData.patient_of,
          employee_of: req.user.id,
        });

        if (!employee) {
          return res.status(400).json({
            error:
              "Funcionário responsável não encontrado ou não pertence à sua organização",
          });
        }
      }

      // Se tem nova imagem
      if (req.file) {
        try {
          // Upload nova imagem
          const uploadResult = await uploadToCloudinary(req.file.buffer, {
            public_id: `customer_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`,
          });

          updateData.avatar = {
            url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
          };

          // Deletar imagem antiga do Cloudinary
          if (existingCustomer?.avatar?.public_id) {
            await cloudinary.uploader.destroy(
              existingCustomer.avatar.public_id
            );
          }
        } catch (uploadError) {
          console.error("Erro no upload do avatar:", uploadError);
          return res.status(500).json({
            error: "Erro ao fazer upload da imagem",
          });
        }
      }

      const updatedCustomer = await Customer.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      })
        .select("-password")
        .populate("patient_of", "name email");

      res.json({
        message: "Cliente atualizado com sucesso",
        customer: updatedCustomer,
      });
    } catch (error) {
      console.error("Erro ao atualizar cliente:", error);

      if (error.name === "ValidationError") {
        const validationErrors = Object.values(error.errors).map(
          (err) => err.message
        );
        return res.status(400).json({
          error: "Dados inválidos",
          details: validationErrors,
        });
      }

      res.status(500).json({ error: "Erro ao atualizar cliente" });
    }
  },

  // Deletar cliente
  async deleteCustomer(req, res) {
    try {
      const { id } = req.params;

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // Buscar apenas clientes que pertencem ao usuário
      const customer = await Customer.findOne({
        _id: id,
        client_of: req.user.id,
      });

      if (!customer) {
        return res.status(404).json({
          error:
            "Cliente não encontrado ou você não tem permissão para deletá-lo",
        });
      }

      // Remover cliente da lista de pacientes do funcionário
      if (customer.patient_of) {
        try {
          await Employee.findByIdAndUpdate(customer.patient_of, {
            $pull: { patients: customer._id },
          });
        } catch (empUpdateError) {
          console.error("Erro ao atualizar funcionário:", empUpdateError);
        }
      }

      // Deletar imagem do Cloudinary se existir
      if (customer.avatar?.public_id) {
        try {
          await cloudinary.uploader.destroy(customer.avatar.public_id);
        } catch (cloudinaryError) {
          console.error(
            "Erro ao deletar imagem do Cloudinary:",
            cloudinaryError
          );
        }
      }

      await Customer.findByIdAndDelete(id);

      res.json({ message: "Cliente deletado com sucesso" });
    } catch (error) {
      console.error("Erro ao deletar cliente:", error);
      res.status(500).json({ error: "Erro ao deletar cliente" });
    }
  },

  // Alterar status do cliente
  async toggleCustomerStatus(req, res) {
    try {
      const { id } = req.params;

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // Buscar apenas clientes que pertencem ao usuário
      const customer = await Customer.findOne({
        _id: id,
        client_of: req.user.id,
      });

      if (!customer) {
        return res.status(404).json({
          error:
            "Cliente não encontrado ou você não tem permissão para alterar o status",
        });
      }

      const newStatus = customer.status === "Ativo" ? "Inativo" : "Ativo";

      const updatedCustomer = await Customer.findByIdAndUpdate(
        id,
        { status: newStatus },
        { new: true }
      )
        .select("-password")
        .populate("patient_of", "name email");

      res.json({
        message: `Cliente ${newStatus.toLowerCase()} com sucesso`,
        customer: updatedCustomer,
      });
    } catch (error) {
      console.error("Erro ao alterar status do cliente:", error);
      res.status(500).json({ error: "Erro ao alterar status do cliente" });
    }
  },

  // Adicionar entrada no diário de humor
  async addMoodEntry(req, res) {
    try {
      const id = req.user.id;
      const { emotion, intensity, description, address } = req.body;

      // Validações básicas
      if (!emotion || !intensity) {
        return res.status(400).json({
          error: "Emoção e intensidade são obrigatórias",
        });
      }

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      const customer = await Customer.findOne({
        _id: id,
        client_of: req.user.id,
      });

      if (!customer) {
        return res.status(404).json({
          error:
            "Cliente não encontrado ou você não tem permissão para acessá-lo",
        });
      }

      const moodEntry = {
        emotion,
        intensity: parseInt(intensity),
        description,
        address,
        createdAt: new Date(),
      };

      const updatedCustomer = await Customer.findByIdAndUpdate(
        id,
        {
          $push: { mood_diary: moodEntry },
        },
        { new: true }
      ).select("-password");

      res.json({
        message: "Entrada do diário de humor adicionada com sucesso",
        mood_entry: moodEntry,
        customer: updatedCustomer,
      });
    } catch (error) {
      console.error("Erro ao adicionar entrada do diário:", error);
      res.status(500).json({ error: "Erro ao adicionar entrada do diário" });
    }
  },

  // Obter diário de humor
  async getMoodDiary(req, res) {
    try {
      const { id } = req.params;

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      const customer = await Customer.findOne({
        _id: id,
        client_of: req.user.id,
      }).select("mood_diary name");

      if (!customer) {
        return res.status(404).json({
          error:
            "Cliente não encontrado ou você não tem permissão para acessá-lo",
        });
      }

      res.json({
        customer_name: customer.name,
        mood_diary: customer.mood_diary.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        ),
        total_entries: customer.mood_diary.length,
      });
    } catch (error) {
      console.error("Erro ao buscar diário de humor:", error);
      res.status(500).json({ error: "Erro ao buscar diário de humor" });
    }
  },
};

module.exports = customersController;
