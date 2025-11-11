const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const Customer = require("../models/Customer");
const Employee = require("../models/Employee");
const Organization = require("../models/Organization");
const SendNotification = require("./logic/sendNotification");
const NOTIFICATION_CONFIG = require("./logic/notificationConfigCostumer");
const errorHelper = require("./logic/errorHelper");
const { uploadPDFToSupabase } = require("../middlewares/supabase");
const mongoose = require("mongoose");
const { upload } = require("../middlewares/upload");
const { generatePatientReportPDF } = require("./logic/patientPdfGenerate");
const sendNotification = require("./logic/sendNotification");
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
      const {
        name,
        email,
        password,
        birth_date,
        patient_of: bodyPatientOf,
        organization: bodyOrganization,
      } = req.body;

      console.log("📥 Dados recebidos:", {
        name,
        email,
        birth_date,
        bodyPatientOf,
        bodyOrganization,
      });

      // ========== RECONHECIMENTO DE TOKEN INTERNO ==========
      let userRole = null;
      let organizationId = null;
      let authenticatedUserId = null;
      let patientOf = null;

      const token =
        req.cookies?.token ||
        req.body.token ||
        req.headers.authorization?.replace("Bearer ", "");

      if (token) {
        try {
          const secret = process.env.SECRET;
          if (!secret) {
            throw new Error("Chave secreta JWT não configurada");
          }

          const decoded = jwt.verify(token, secret);
          authenticatedUserId = decoded.id;

          // Verificar se é ADM (Organization)
          const orgUser = await Organization.findById(decoded.id);
          if (orgUser) {
            userRole = "adm";
            organizationId = orgUser._id;
            // ADM precisa informar patient_of no body
            patientOf = bodyPatientOf;
          } else {
            // Verificar se é Employee (Psicólogo)
            const empUser = await Employee.findById(decoded.id);
            if (empUser) {
              userRole = "employee";
              organizationId = empUser.employee_of; // Pega organization do employee
              patientOf = empUser._id; // O próprio employee é o patient_of

              // Validar se o employee está ativo
              if (empUser.status === "Inativo") {
                return res.status(403).json({
                  error: "Funcionário inativo",
                  message:
                    "Funcionários inativos não podem cadastrar pacientes",
                });
              }
            } else {
              // Verificar se é Patient - NÃO PODE CADASTRAR
              const patientUser = await Customer.findById(decoded.id);
              if (patientUser) {
                return res.status(403).json({
                  error: "Acesso negado",
                  message: "Pacientes não podem cadastrar outros pacientes",
                });
              }
            }
          }

          console.log("🔐 Token reconhecido:", {
            userRole,
            organizationId,
            patientOf,
          });
        } catch (tokenError) {
          console.log("⚠️ Token inválido ou expirado:", tokenError.message);
          // Token inválido, continua como deslogado
          userRole = null;
        }
      }

      // ========== DEFINIR ORGANIZAÇÃO E PATIENT_OF (DESLOGADO) ==========
      if (!userRole) {
        // Usuário deslogado - precisa informar organization e patient_of no body
        if (!bodyOrganization) {
          return res.status(400).json({
            error: "Organização não especificada",
            message: "Selecione uma organização para realizar o cadastro",
          });
        }

        if (!bodyPatientOf) {
          return res.status(400).json({
            error: "Profissional não especificado",
            message: "Selecione um profissional para realizar o cadastro",
          });
        }

        organizationId = bodyOrganization;
        patientOf = bodyPatientOf;
      }

      // ========== VALIDAR PATIENT_OF ==========
      if (!patientOf) {
        return res.status(400).json({
          error: "Profissional não especificado",
          message:
            "É necessário informar o profissional responsável pelo paciente",
        });
      }

      // Validar se o employee existe e está ativo
      const employee = await Employee.findById(patientOf);
      if (!employee) {
        return res.status(404).json({
          error: "Profissional não encontrado",
        });
      }

      if (employee.status === "Inativo") {
        return res.status(403).json({
          error: "Profissional inativo",
          message:
            "Não é possível cadastrar pacientes para profissionais inativos",
        });
      }

      // Validar se a organização existe
      const orgExists = await Organization.findById(organizationId);
      if (!orgExists) {
        return res.status(404).json({
          error: "Organização não encontrada",
        });
      }

      // Validar se o employee pertence à organização
      if (employee.employee_of.toString() !== organizationId.toString()) {
        return res.status(400).json({
          error: "Profissional não pertence à organização informada",
        });
      }

      // ========== VALIDAÇÕES BÁSICAS OBRIGATÓRIAS ==========
      if (!name || !email || !password || !birth_date) {
        return res.status(400).json({
          error: "Todos os campos obrigatórios devem ser preenchidos",
          missing_fields: {
            name: !name,
            email: !email,
            password: !password,
            birth_date: !birth_date,
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
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: "Formato de email inválido",
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

      // ========== LÓGICA RBAC - DEFINIR STATUS ==========
      let customerStatus = "Inativo"; // Padrão para employee e deslogados

      if (userRole === "adm") {
        customerStatus = "Ativo"; // Apenas ADM cria pacientes ativos
        console.log("✅ ADM criando paciente - Status: Ativo");
      } else {
        // Employee ou deslogado = Inativo
        customerStatus = "Inativo";
        if (userRole === "employee") {
          console.log(
            "⚠️ Employee criando paciente - Status: Inativo (requer aprovação do ADM)"
          );
        } else {
          console.log(
            "⚠️ Cadastro público sem autenticação - Status: Inativo (requer aprovação do ADM)"
          );
        }
      }

      // ========== PREPARAR DADOS DO CLIENTE ==========
      const customerData = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        birth_date: new Date(birth_date),
        patient_of: patientOf,
        client_of: organizationId,
        status: customerStatus,
      };

      // ========== UPLOAD DO AVATAR SE FORNECIDO ==========
      if (req.file) {
        try {
          console.log("📸 Fazendo upload do avatar...");

          // Validar tamanho (4MB)
          const MAX_SIZE = 4 * 1024 * 1024; // 4MB
          if (req.file.size > MAX_SIZE) {
            return res.status(400).json({
              error: "A imagem é muito grande",
              message: "O tamanho máximo permitido é 4MB",
            });
          }

          const uploadResult = await uploadToCloudinary(req.file.buffer, {
            public_id: `customer_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`,
            resource_type: "image",
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

      // ========== CRIAR CLIENTE ==========
      const newCustomer = new Customer(customerData);
      const savedCustomer = await newCustomer.save();
      console.log("✅ Cliente salvo no banco:", savedCustomer._id);

      // ========== ADICIONAR CLIENTE ÀS LISTAS ==========
      try {
        // Adicionar cliente à lista de pacientes do funcionário
        await Employee.findByIdAndUpdate(
          patientOf,
          {
            $addToSet: { patients: savedCustomer._id },
          },
          { new: true }
        );

        // Adicionar paciente aos customers da organização
        await Organization.findByIdAndUpdate(
          organizationId,
          {
            $addToSet: { customers: savedCustomer._id },
          },
          { new: true }
        );

        console.log(
          `✅ Cliente ${savedCustomer._id} adicionado ao funcionário ${patientOf} e organização ${organizationId}`
        );
      } catch (updateError) {
        console.error("❌ Erro ao atualizar relacionamentos:", updateError);

        // Deletar o cliente criado para manter consistência
        await Customer.findByIdAndDelete(savedCustomer._id);

        // Limpar avatar se foi feito upload
        if (customerData.avatar?.public_id) {
          try {
            await cloudinary.uploader.destroy(customerData.avatar.public_id);
          } catch (cleanupError) {
            console.error("❌ Erro ao limpar imagem:", cleanupError);
          }
        }

        return res.status(500).json({
          error: "Erro ao associar cliente",
          details: updateError.message,
        });
      }

      // ========== ENVIAR NOTIFICAÇÕES ==========
      // Enviar notificação APENAS após sucesso completo do cadastro
      try {
        if (userRole === "employee") {
          // Notificação para a ORGANIZAÇÃO quando employee cria paciente
          await SendNotification({
            organization: organizationId,
            created_for: organizationId, // Notificação vai para o ADM da organização
            kind: "Organization", // ✅ CAMPO CORRETO
            title: "Novo Paciente Cadastrado",
            summary: `Um novo paciente foi cadastrado pelo psicólogo(a) ${employee.name}. Verifique na área de pacientes.`, // ✅ CAMPO CORRETO
            notification_type: "Pacientes", // ✅ CAMPO CORRETO
          });

          console.log(
            `✅ Notificação enviada para organização ${organizationId} sobre cadastro de paciente pelo employee ${employee._id}`
          );
        } else if (userRole === "adm") {
          // Notificação para o EMPLOYEE quando ADM cria paciente para ele
          await SendNotification({
            organization: organizationId,
            created_for: savedCustomer.patient_of, // Notificação vai para o employee
            kind: "Employee", // ✅ CAMPO CORRETO
            title: "Novo Paciente Atribuído",
            summary: `Um novo paciente foi cadastrado e atribuído a você. Verifique na área de pacientes.`, // ✅ CAMPO CORRETO
            notification_type: "Pacientes", // ✅ CAMPO CORRETO
          });

          console.log(
            `✅ Notificação enviada para employee ${savedCustomer.patient_of} sobre novo paciente atribuído`
          );
        }
      } catch (notificationError) {
        // Não bloquear o cadastro se a notificação falhar
        console.error("⚠️ Erro ao enviar notificação:", notificationError);
      }

      // ========== RESPOSTA ==========
      const customerResponse = savedCustomer.toObject();
      delete customerResponse.password;

      console.log("🎉 Cliente criado com sucesso:", {
        id: customerResponse._id,
        name: customerResponse.name,
        status: customerResponse.status,
        createdBy: userRole || "público (deslogado)",
      });

      res.status(201).json({
        message: "Cliente criado com sucesso",
        customer: customerResponse,
        info: {
          status: customerResponse.status,
          requiresActivation: customerResponse.status === "Inativo",
          message:
            customerResponse.status === "Inativo"
              ? "Cadastro realizado! Aguarde a aprovação do administrador para acessar o sistema."
              : "Cadastro ativo! Você já pode acessar o sistema.",
        },
      });
    } catch (error) {
      console.error("❌ Erro ao criar cliente:", error);

      // Se houve erro após upload, limpar imagem do Cloudinary
      if (req.file && customerData?.avatar?.public_id) {
        try {
          await cloudinary.uploader.destroy(customerData.avatar.public_id);
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
      delete updateData.appointments; // Appointments são gerenciados separadamente

      let existingCustomer;

      // ========== LÓGICA BASEADA NO ROLE ==========
      if (req.role === "patient") {
        // PACIENTE: Só pode atualizar seus próprios dados
        if (id !== req.user.id) {
          return res.status(403).json({
            error: "Você só pode atualizar seus próprios dados",
          });
        }

        // Paciente não pode alterar certos campos
        delete updateData.client_of; // Não pode alterar o dono
        delete updateData.patient_of; // Não pode alterar o funcionário responsável
        delete updateData.role; // Não pode alterar a role

        existingCustomer = await Customer.findById(id);

        if (!existingCustomer) {
          return res.status(404).json({
            error: "Cliente não encontrado",
          });
        }
      } else {
        // ADMIN/FUNCIONÁRIO: Pode atualizar clientes da organização
        delete updateData.client_of; // Não permitir alterar o dono do cliente

        existingCustomer = await Customer.findOne({
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
      }

      // ========== VALIDAÇÃO DE EMAIL ==========
      if (updateData.email && updateData.email !== existingCustomer.email) {
        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(updateData.email)) {
          return res.status(400).json({
            error: "Formato de email inválido",
          });
        }

        // Verificar se o email já está em uso por outro cliente
        const emailExists = await Customer.findOne({
          email: updateData.email.toLowerCase(),
          _id: { $ne: id }, // Excluir o próprio cliente da busca
        });

        if (emailExists) {
          return res.status(400).json({
            error: "Este email já está em uso por outro cliente",
          });
        }

        // Normalizar email
        updateData.email = updateData.email.toLowerCase().trim();
      }

      // ========== VALIDAÇÃO DE TELEFONES ==========
      if (updateData.contacts) {
        const { phone, emergency_contact } = updateData.contacts;

        // Função para validar e formatar telefone brasileiro
        const validatePhone = (phoneNumber) => {
          if (!phoneNumber) return null;

          // Remove tudo que não é número
          const cleanPhone = phoneNumber.replace(/\D/g, "");

          // Validar telefone brasileiro
          // Formatos aceitos:
          // - Celular: (XX) 9XXXX-XXXX ou XX9XXXXXXXX (11 dígitos)
          // - Fixo: (XX) XXXX-XXXX ou XXXXXXXXXX (10 dígitos)
          if (cleanPhone.length === 11) {
            // Celular com DDD
            const ddd = cleanPhone.substring(0, 2);
            const firstDigit = cleanPhone.charAt(2);

            // Validar DDD (11 a 99)
            if (parseInt(ddd) < 11 || parseInt(ddd) > 99) {
              return { valid: false, message: "DDD inválido" };
            }

            // Celular deve começar com 9
            if (firstDigit !== "9") {
              return {
                valid: false,
                message: "Número de celular deve começar com 9",
              };
            }

            return {
              valid: true,
              formatted: `(${ddd}) ${cleanPhone.substring(2, 7)}-${cleanPhone.substring(7)}`,
              clean: cleanPhone,
            };
          } else if (cleanPhone.length === 10) {
            // Telefone fixo com DDD
            const ddd = cleanPhone.substring(0, 2);

            // Validar DDD
            if (parseInt(ddd) < 11 || parseInt(ddd) > 99) {
              return { valid: false, message: "DDD inválido" };
            }

            return {
              valid: true,
              formatted: `(${ddd}) ${cleanPhone.substring(2, 6)}-${cleanPhone.substring(6)}`,
              clean: cleanPhone,
            };
          } else {
            return {
              valid: false,
              message:
                "Telefone deve ter 10 dígitos (fixo) ou 11 dígitos (celular) incluindo DDD",
            };
          }
        };

        // Validar telefone principal
        if (phone) {
          const phoneValidation = validatePhone(phone);
          if (!phoneValidation.valid) {
            return res.status(400).json({
              error: `Telefone inválido: ${phoneValidation.message}`,
            });
          }
          updateData.contacts.phone = phoneValidation.formatted;
        }

        // Validar telefone de emergência
        if (emergency_contact) {
          const emergencyValidation = validatePhone(emergency_contact);
          if (!emergencyValidation.valid) {
            return res.status(400).json({
              error: `Telefone de emergência inválido: ${emergencyValidation.message}`,
            });
          }
          updateData.contacts.emergency_contact = emergencyValidation.formatted;
        }

        // Manter outros campos de contacts que não foram enviados
        updateData.contacts = {
          ...existingCustomer.contacts,
          ...updateData.contacts,
        };
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

      if (error.code === 11000) {
        // Erro de duplicação de chave única (email)
        return res.status(400).json({
          error: "Email já está em uso",
        });
      }

      res.status(500).json({ error: "Erro ao atualizar cliente" });
    }
  },
  async updateOwnProfile(req, res) {
    try {
      const id = req.user.id; // ID vem do token JWT
      const updateData = { ...req.body };

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // Remover campos que o PACIENTE não pode alterar
      delete updateData.password; // Senha deve ser via endpoint específico
      delete updateData._id;
      delete updateData.appointments; // Gerenciados separadamente
      delete updateData.client_of; // Não pode alterar o dono
      delete updateData.patient_of; // Não pode alterar funcionário responsável
      delete updateData.role; // Não pode alterar a role

      // Buscar cliente existente
      const existingCustomer = await Customer.findById(id);

      if (!existingCustomer) {
        return res.status(404).json({
          error: "Cliente não encontrado",
        });
      }

      // ========== VALIDAÇÃO DE EMAIL ==========
      if (updateData.email && updateData.email !== existingCustomer.email) {
        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(updateData.email)) {
          return res.status(400).json({
            error: "Formato de email inválido",
          });
        }

        // Verificar se o email já está em uso
        const emailExists = await Customer.findOne({
          email: updateData.email.toLowerCase(),
          _id: { $ne: id },
        });

        if (emailExists) {
          return res.status(400).json({
            error: "Este email já está em uso por outro cliente",
          });
        }

        // Normalizar email
        updateData.email = updateData.email.toLowerCase().trim();
      }

      // ========== VALIDAÇÃO DE TELEFONES ==========
      if (updateData.contacts) {
        const { phone, emergency_contact } = updateData.contacts;

        // Função para validar e formatar telefone brasileiro
        const validatePhone = (phoneNumber) => {
          if (!phoneNumber) return null;

          // Remove tudo que não é número
          const cleanPhone = phoneNumber.replace(/\D/g, "");

          if (cleanPhone.length === 11) {
            // Celular com DDD
            const ddd = cleanPhone.substring(0, 2);
            const firstDigit = cleanPhone.charAt(2);

            if (parseInt(ddd) < 11 || parseInt(ddd) > 99) {
              return { valid: false, message: "DDD inválido" };
            }

            if (firstDigit !== "9") {
              return {
                valid: false,
                message: "Número de celular deve começar com 9",
              };
            }

            return {
              valid: true,
              formatted: `(${ddd}) ${cleanPhone.substring(2, 7)}-${cleanPhone.substring(7)}`,
            };
          } else if (cleanPhone.length === 10) {
            // Telefone fixo com DDD
            const ddd = cleanPhone.substring(0, 2);

            if (parseInt(ddd) < 11 || parseInt(ddd) > 99) {
              return { valid: false, message: "DDD inválido" };
            }

            return {
              valid: true,
              formatted: `(${ddd}) ${cleanPhone.substring(2, 6)}-${cleanPhone.substring(6)}`,
            };
          } else {
            return {
              valid: false,
              message: "Telefone deve ter 10 (fixo) ou 11 dígitos (celular)",
            };
          }
        };

        // Validar telefone principal
        if (phone) {
          const phoneValidation = validatePhone(phone);
          if (!phoneValidation.valid) {
            return res.status(400).json({
              error: `Telefone inválido: ${phoneValidation.message}`,
            });
          }
          updateData.contacts.phone = phoneValidation.formatted;
        }

        // Validar telefone de emergência
        if (emergency_contact) {
          const emergencyValidation = validatePhone(emergency_contact);
          if (!emergencyValidation.valid) {
            return res.status(400).json({
              error: `Telefone de emergência inválido: ${emergencyValidation.message}`,
            });
          }
          updateData.contacts.emergency_contact = emergencyValidation.formatted;
        }

        // Manter outros campos de contacts
        updateData.contacts = {
          ...existingCustomer.contacts,
          ...updateData.contacts,
        };
      }

      // ========== UPLOAD DE AVATAR ==========
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

          // Deletar imagem antiga
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

      // ========== ATUALIZAR CLIENTE ==========
      const updatedCustomer = await Customer.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      })
        .select("-password")
        .populate("patient_of", "name email");

      res.json({
        message: "Perfil atualizado com sucesso",
        customer: updatedCustomer,
      });
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);

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
        return res.status(400).json({
          error: "Email já está em uso",
        });
      }

      res.status(500).json({ error: "Erro ao atualizar perfil" });
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

      const customer = await Customer.findById(id);

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
      const userId = req.user.id;
      const { role } = req.user;
      const { id } = req.body;

      let customer = null;

      if (role === "employee") {
        customer = await Customer.findOne({
          _id: id,
          patient_of: userId,
        });
      }
      if (role == "adm") {
        customer = await Customer.findOne({
          _id: id,
          client_of: userId,
        });
      }
      if (role == "patient") {
        customer = await Customer.findById(userId);
      }

      if (!customer) {
        return res.status(404).json({
          error:
            "Cliente não encontrado ou você não tem permissão para acessá-lo",
        });
      }

      res.json({
        customer_name: customer.name,
        mood_diary: customer.mood_diary.sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        ),
        total_entries: customer.mood_diary.length,
      });
    } catch (error) {
      console.error("Erro ao buscar diário de humor:", error);
      res.status(500).json({ error: "Erro ao buscar diário de humor" });
    }
  },
  async createAndUpdateCustomerAnamnese(req, res) {
    const userId = req.user.id;
    const patientId = req.body.id;

    if (!mongoose.isValidObjectId(patientId)) {
      return errorHelper({
        res,
        status: 401,
        error: "O Idendificador(ID) não é válido.",
        message: "Tente novamente com um identificador válido.",
      });
    }

    if (!req.file) {
      return errorHelper({
        res,
        status: 404,
        error: "O arquivo PDF não foi posto corretamente.",
        message: "Insira o arquivo PDF corretamente na requisição.",
      });
    }

    if (req.file.mimetype !== "application/pdf") {
      return errorHelper({
        res,
        status: 401,
        error: "O arquivo não é valido.",
        message: "Insira um arquivo do tipo PDF para continuar.",
      });
    }

    try {
      const patient = await Customer.findOne({
        _id: patientId,
        patient_of: userId,
      });

      if (!patient) {
        return errorHelper({
          res,
          status: 404,
          error: "Usuário não foi encontrado",
          message: "Tente novamente com outro Identificador.",
        });
      }

      let uploadPdf = null;

      if (patient.anamnese_pdf) {
        uploadPdf = await uploadPDFToSupabase(
          req.file,
          patient.anamnese_pdf.public_id
        );
      } else {
        uploadPdf = await uploadPDFToSupabase(req.file);
      }

      if (!uploadPdf) {
        return errorHelper({
          res,
          status: 500,
          error: "Houve algum erro ao fazer o upload para o banco de dados.",
          message: "Tente novamente mais tarde.",
        });
      }

      const anamneseContent = {
        archive_type: uploadPdf.format,
        public_id: uploadPdf.public_id,
        url: uploadPdf.url,
      };

      const updatedAnamnese = await Customer.findByIdAndUpdate(
        patientId,
        {
          anamnese_pdf: anamneseContent,
        },
        { new: true }
      );

      res.status(200).json({
        message: "[SUCESSO] : Ficha atualizada com sucesso.",
        pdf_url: uploadPdf.url,
        data: updatedAnamnese,
      });
    } catch (err) {
      console.log("[ERRO] : HOUVE UM ERRO INTERNO", err);
      errorHelper({
        res,
        status: 500,
        error: "Houve um erro interno.",
        message: "Tente novamente mais tarde.",
      });
    }
  },
  async getCustomersStats(req, res) {
    try {
      // Verificar autenticação
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      const { role } = req.user;
      const userId = req.user.id;

      console.log("Buscando estatísticas de clientes para:", userId, role);

      let query = {};

      // Definir query baseado no role
      if (role === "adm") {
        query = { client_of: userId };
      } else if (role === "employee") {
        query = { patient_of: userId };
      } else {
        return res.status(403).json({
          error: "Sem permissão para acessar estatísticas",
        });
      }

      // Buscar todos os clientes
      const customers = await Customer.find(query)
        .select("-password")
        .populate("patient_of", "name email avatar")
        .sort({ createdAt: -1 });

      // Calcular estatísticas
      const total = customers.length;
      const ativos = customers.filter((c) => c.status === "Ativo").length;
      const inativos = customers.filter((c) => c.status === "Inativo").length;

      // Buscar clientes mais recentes (últimos 5)
      const recentes = customers.slice(0, 5).map((customer) => ({
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        avatar: customer.avatar,
        status: customer.status,
        patient_of: customer.patient_of,
        createdAt: customer.createdAt,
        mood_diary_entries: customer.mood_diary?.length || 0,
      }));

      // Estatísticas de diário de humor
      const totalMoodEntries = customers.reduce(
        (acc, customer) => acc + (customer.mood_diary?.length || 0),
        0
      );

      // Clientes com mais entradas no diário
      const topMoodDiary = customers
        .filter((c) => c.mood_diary && c.mood_diary.length > 0)
        .sort((a, b) => b.mood_diary.length - a.mood_diary.length)
        .slice(0, 3)
        .map((customer) => ({
          _id: customer._id,
          name: customer.name,
          avatar: customer.avatar,
          mood_entries: customer.mood_diary.length,
        }));

      // Estatísticas de cadastros por mês (últimos 6 meses)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const customersByMonth = customers
        .filter((c) => new Date(c.createdAt) >= sixMonthsAgo)
        .reduce((acc, customer) => {
          const month = new Date(customer.createdAt).toLocaleDateString(
            "pt-BR",
            {
              month: "short",
              year: "numeric",
            }
          );
          acc[month] = (acc[month] || 0) + 1;
          return acc;
        }, {});

      // Distribuição por profissional (apenas para ADM)
      let customersByProfessional = [];
      if (role === "adm") {
        const distribution = customers.reduce((acc, customer) => {
          const profId =
            customer.patient_of?._id?.toString() || "Não atribuído";
          const profName = customer.patient_of?.name || "Não atribuído";

          if (!acc[profId]) {
            acc[profId] = {
              professional_id: profId,
              professional_name: profName,
              professional_avatar: customer.patient_of?.avatar,
              count: 0,
            };
          }
          acc[profId].count++;
          return acc;
        }, {});

        customersByProfessional = Object.values(distribution).sort(
          (a, b) => b.count - a.count
        );
      }

      console.log(`Estatísticas calculadas: ${total} clientes encontrados`);

      res.json({
        total,
        ativos,
        inativos,
        recentes,
        mood_stats: {
          total_entries: totalMoodEntries,
          top_contributors: topMoodDiary,
        },
        cadastros_por_mes: customersByMonth,
        ...(role === "adm" && {
          distribuicao_por_profissional: customersByProfessional,
        }),
        message: "Estatísticas de clientes obtidas com sucesso",
      });
    } catch (error) {
      console.error("Erro ao buscar estatísticas de clientes:", error);
      res.status(500).json({
        error: "Erro ao buscar estatísticas",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
  async getAllPatientsPDF(req, res) {
    const userId = req.user.id;
    try {
      const result = await generatePatientReportPDF({
        professionalId: userId,
        populateFields: [{ path: "client_of", select: "name" }],
      });

      console.log(`PDF gerado: ${result.count} pacientes`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=pacientes_${Date.now()}.pdf`
      );
      res.send(result.buffer);
    } catch (err) {
      console.error(err);
      errorHelper({
        res,
        status: 404,
        error: "Houve um erro interno",
        message: "Tente novamente mais tarde.",
      });
    }
  },
};

module.exports = customersController;
