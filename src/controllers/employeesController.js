const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const Employee = require("../models/Employee"); // Ajuste o caminho conforme sua estrutura
const Organization = require("../models/Organization");

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
      folder: "employees/avatars",
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

const employeesController = {
  // Criar novo funcionário
  async createEmployee(req, res) {
    try {
      const {
        password,
        name,
        email,
        birthday,
        rg,
        cpf,
        phone,
        address,
        remuneration,
        status = "Ativo",
        hiredata,
        employee_of, // Manter para casos especiais onde admin pode especificar
      } = req.body;

      console.log("Dados recebidos:", req.body); // Debug

      // Validações básicas
      if (
        !password ||
        !name ||
        !email ||
        !birthday ||
        !rg ||
        !cpf ||
        !phone ||
        !address ||
        !remuneration
      ) {
        return res.status(400).json({
          error: "Todos os campos obrigatórios devem ser preenchidos",
          missing_fields: {
            password: !password,
            name: !name,
            email: !email,
            birthday: !birthday,
            rg: !rg,
            cpf: !cpf,
            phone: !phone,
            address: !address,
            remuneration: !remuneration,
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

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // Verificar se já existe funcionário com mesmo email, CPF ou RG
      const existingEmployee = await Employee.findOne({
        $or: [
          { email: email.toLowerCase() },
          { cpf: cpf.replace(/[^\d]/g, "") },
          { rg: rg.replace(/[.\-\s]/g, "") },
        ],
      });

      if (existingEmployee) {
        return res.status(409).json({
          error: "Já existe um funcionário com este email, CPF ou RG",
        });
      }

      // Hash da senha
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Preparar dados do funcionário
      const employeeData = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        birthday: new Date(birthday),
        rg: rg.replace(/[.\-\s]/g, ""),
        cpf: cpf.replace(/[^\d]/g, ""),
        phone: phone.replace(/\D/g, ""),
        address: address.trim(),
        remuneration: parseFloat(remuneration),
        status,
        password: hashedPassword,
        // CORREÇÃO: Usar sempre o ID do usuário autenticado
        // Permitir override apenas se fornecido explicitamente e o usuário tem permissão
        employee_of: employee_of || req.user.id, // Usar req.user.id em vez de organizationId
      };

      // Se foi enviada data de contratação
      if (hiredata) {
        employeeData.hireDate = new Date(hiredata);
      }

      // Upload do avatar se fornecido
      if (req.file) {
        try {
          console.log("Fazendo upload do avatar...");
          const uploadResult = await uploadToCloudinary(req.file.buffer, {
            public_id: `employee_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`,
          });

          employeeData.avatar = {
            url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
          };

          console.log("Upload do avatar concluído:", uploadResult.secure_url);
        } catch (uploadError) {
          console.error("Erro no upload do avatar:", uploadError);
          return res.status(500).json({
            error: "Erro ao fazer upload da imagem",
            details: uploadError.message,
          });
        }
      }

      console.log("Dados do funcionário preparados:", {
        ...employeeData,
        password: "[HIDDEN]", // Não mostrar a senha no log
      });

      // Criar funcionário
      const newEmployee = new Employee(employeeData);
      const savedEmployee = await newEmployee.save();

      // AGORA adicionar o funcionário à organização (após salvar o funcionário)
      try {
        const organizationId = employeeData.employee_of;

        await Organization.findByIdAndUpdate(
          organizationId,
          {
            $addToSet: { employees: savedEmployee._id }, // $addToSet evita duplicatas
          },
          { new: true }
        );

        console.log(
          `Funcionário ${savedEmployee._id} adicionado à organização ${organizationId}`
        );
      } catch (orgUpdateError) {
        console.error("Erro ao atualizar organização:", orgUpdateError);

        await Employee.findByIdAndDelete(savedEmployee._id);

        return res.status(500).json({
          error: "Erro ao associar funcionário à organização",
          details: orgUpdateError.message,
        });
      }

      // Remover senha da resposta
      const employeeResponse = savedEmployee.toObject();
      delete employeeResponse.password;

      console.log("Funcionário criado com sucesso:", employeeResponse);

      // Gerar token JWT para o novo funcionário
      const token = jwt.sign(
        {
          employeeId: savedEmployee._id,
          email: savedEmployee.email,
          id: savedEmployee._id, // Incluir id também para consistência
          role: savedEmployee.role || "employee", // Incluir role se existir
          organizationId: savedEmployee.employee_of, // Manter organizationId para compatibilidade
        },
        process.env.SECRET,
        { expiresIn: "24h" }
      );

      res.status(201).json({
        message: "Funcionário criado com sucesso",
        employee: employeeResponse,
        token,
      });
    } catch (error) {
      console.error("Erro ao criar funcionário:", error);

      // Se houve erro após upload, limpar imagem do Cloudinary
      if (req.uploadedPublicId) {
        try {
          await cloudinary.uploader.destroy(req.uploadedPublicId);
        } catch (cleanupError) {
          console.error("Erro ao limpar imagem:", cleanupError);
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
  async employeeLogin(req, res) {
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
            role: "employee",
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

  // Atualizar senha do funcionário
  async updateEmployeePassword(req, res) {
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

      // Buscar funcionário com senha
      const employee = await Employee.findOne({
        _id: id,
        employee_of: req.user.id,
      });

      if (!employee) {
        return res.status(404).json({
          error:
            "Funcionário não encontrado ou você não tem permissão para editá-lo",
        });
      }

      // Verificar senha atual
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        employee.password
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
      await Employee.findByIdAndUpdate(id, {
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

  // Listar funcionários
  async getEmployees(req, res) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      let filter = {};
      let selectContent = "";

      if (req.user.role === "adm") {
        filter = { employee_of: req.user.id };
        selectContent = "-password";
      } else if (req.user.role === "employee") {
        const employee = await Employee.findById(req.user.id);
        if (!employee) {
          return res.status(404).json({ error: "Funcionário não encontrado" });
        }
        filter = { employee_of: employee.employee_of };
        selectContent =
          "-password -cpf -rg -birthday -phone -address -remuneration";
      } else {
        return res.status(403).json({ error: "Função não autorizada" });
      }

      const employees = await Employee.find(filter)
        .select(selectContent || "-password") // conteudo mudo de acordo com o role
        .sort({ createdAt: -1 });
      let ativos = 0;
      let inativos = 0;
      employees.forEach((e) => {
        // evitei o filter porque ele passa duas vezes pela lista
        if (e.status === "Ativo") ativos++;
        else if (e.status === "Inativo") inativos++;
      });

      res.json({
        employees,
        total: employees.length,
        ativos,
        inativos,
        message: `POST realizado com sucesso pelo ${
          req.user.role === "adm" ? "Administrador" : "Funcionário"
        }`,
      });
    } catch (error) {
      console.error("Erro ao listar funcionários:", error);
      res.status(500).json({
        error: "Erro ao buscar funcionários",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // Buscar funcionário por ID
  async getEmployeeById(req, res) {
    try {
      const { id } = req.params;

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // CORREÇÃO: Buscar apenas funcionários que pertencem ao usuário autenticado
      const employee = await Employee.findOne({
        _id: id,
        employee_of: req.user.id, // Garantir que o funcionário pertence ao usuário
      })
        .select("-password")
        .populate("employee_of", "name")
        .populate("patients", "name email");

      if (!employee) {
        return res.status(404).json({
          error:
            "Funcionário não encontrado ou você não tem permissão para acessá-lo",
        });
      }

      res.json({ employee });
    } catch (error) {
      console.error("Erro ao buscar funcionário:", error);
      res.status(500).json({ error: "Erro ao buscar funcionário" });
    }
  },

  // Atualizar funcionário
  async updateEmployee(req, res) {
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
      delete updateData.employee_of; // Não permitir alterar o dono do funcionário

      // Verificar se o funcionário pertence ao usuário
      const existingEmployee = await Employee.findOne({
        _id: id,
        employee_of: req.user.id,
      });

      if (!existingEmployee) {
        return res.status(404).json({
          error:
            "Funcionário não encontrado ou você não tem permissão para editá-lo",
        });
      }

      // Se tem nova imagem
      if (req.file) {
        try {
          // Upload nova imagem
          const uploadResult = await uploadToCloudinary(req.file.buffer, {
            public_id: `employee_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`,
          });

          updateData.avatar = {
            url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
          };

          // Deletar imagem antiga do Cloudinary
          if (existingEmployee?.avatar?.public_id) {
            await cloudinary.uploader.destroy(
              existingEmployee.avatar.public_id
            );
          }
        } catch (uploadError) {
          console.error("Erro no upload do avatar:", uploadError);
          return res.status(500).json({
            error: "Erro ao fazer upload da imagem",
          });
        }
      }

      const updatedEmployee = await Employee.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      }).select("-password");

      res.json({
        message: "Funcionário atualizado com sucesso",
        employee: updatedEmployee,
      });
    } catch (error) {
      console.error("Erro ao atualizar funcionário:", error);

      if (error.name === "ValidationError") {
        const validationErrors = Object.values(error.errors).map(
          (err) => err.message
        );
        return res.status(400).json({
          error: "Dados inválidos",
          details: validationErrors,
        });
      }

      res.status(500).json({ error: "Erro ao atualizar funcionário" });
    }
  },

  // Deletar funcionário
  async deleteEmployee(req, res) {
    try {
      const { id } = req.params;

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // CORREÇÃO: Buscar apenas funcionários que pertencem ao usuário
      const employee = await Employee.findOne({
        _id: id,
        employee_of: req.user.id,
      });

      if (!employee) {
        return res.status(404).json({
          error:
            "Funcionário não encontrado ou você não tem permissão para deletá-lo",
        });
      }

      // Deletar imagem do Cloudinary se existir
      if (employee.avatar?.public_id) {
        try {
          await cloudinary.uploader.destroy(employee.avatar.public_id);
        } catch (cloudinaryError) {
          console.error(
            "Erro ao deletar imagem do Cloudinary:",
            cloudinaryError
          );
        }
      }

      await Employee.findByIdAndDelete(id);

      res.json({ message: "Funcionário deletado com sucesso" });
    } catch (error) {
      console.error("Erro ao deletar funcionário:", error);
      res.status(500).json({ error: "Erro ao deletar funcionário" });
    }
  },

  // Alterar status do funcionário
  async toggleEmployeeStatus(req, res) {
    try {
      const { id } = req.params;

      // Verificar se o usuário está autenticado
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: "Usuário não autenticado",
        });
      }

      // CORREÇÃO: Buscar apenas funcionários que pertencem ao usuário
      const employee = await Employee.findOne({
        _id: id,
        employee_of: req.user.id,
      });

      if (!employee) {
        return res.status(404).json({
          error:
            "Funcionário não encontrado ou você não tem permissão para alterar o status",
        });
      }

      const newStatus = employee.status === "Ativo" ? "Inativo" : "Ativo";

      const updatedEmployee = await Employee.findByIdAndUpdate(
        id,
        { status: newStatus },
        { new: true }
      ).select("-password");

      res.json({
        message: `Funcionário ${newStatus.toLowerCase()} com sucesso`,
        employee: updatedEmployee,
      });
    } catch (error) {
      console.error("Erro ao alterar status do funcionário:", error);
      res.status(500).json({ error: "Erro ao alterar status do funcionário" });
    }
  },
  async HiringEmployees(req, res) {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      // Verifica se é admin ou employee autorizado
      if (!["adm", "employee"].includes(userRole)) {
        return res.status(400).json({
          error: "Acesso negado",
          message: "Usuário não autorizado para esta operação",
        });
      }
      let findMethod = {};
      if (userRole == "adm") {
        console.log("passou por aqui");
        findMethod = {
          employee_of: userId,
        };
      } else if (userRole == "employee") {
        const employee = await Employee.findById(userId);
        if (!employee) {
          return res.status(404).json({
            error: "Acesso Negado",
            message: "O usuário autenticado está incorreto",
          });
        }
        const idOrganization = employee.employee_of;
        findMethod = {
          employee_of: idOrganization,
        };
      }
      const employees = await Employee.find(findMethod);

      // Agrupa os employees por data de criação
      const hiringStats = {};

      employees.forEach((employee) => {
        // Extrai apenas a data (YYYY-MM-DD) do createdAt
        const date = employee.createdAt.toISOString().split("T")[0];

        if (hiringStats[date]) {
          hiringStats[date]++;
        } else {
          hiringStats[date] = 1;
        }
      });

      // Converte o objeto em array no formato desejado
      const result = Object.keys(hiringStats)
        .sort() // Ordena as datas
        .map((date) => ({
          date: date,
          quantidade: hiringStats[date],
        }));

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar estatísticas de contratação:", error);
      return res.status(500).json({
        error: "Erro interno do servidor",
        message: error.message,
      });
    }
  },
};

module.exports = employeesController;
