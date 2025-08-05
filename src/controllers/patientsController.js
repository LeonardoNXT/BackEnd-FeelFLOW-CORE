const Customer = require("../models/Customer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;

// Função para fazer upload no Cloudinary
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      resource_type: "image",
      folder: "customers/avatars", // Pasta específica para customers
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

class PatientsController {
  // Criar um novo paciente
  async create(req, res) {
    let uploadedPublicId = null; // Variável para controlar limpeza

    try {
      console.log("📝 Dados recebidos:", req.body);
      console.log("📎 Arquivo recebido:", req.file ? "Sim" : "Não");

      // Extrair dados do FormData
      let {
        name,
        email,
        password,
        age,
        full_name,
        birth_date,
        address,
        profession,
        contacts,
        is_minor,
        parents_or_guardians,
        medical_history,
        assessment,
        treatment_objectives,
        disorders,
        patient_of,
        client_of,
      } = req.body;

      // Parse dos campos JSON que vêm como string do FormData
      try {
        if (address && typeof address === "string") {
          address = JSON.parse(address);
        }
        if (contacts && typeof contacts === "string") {
          contacts = JSON.parse(contacts);
        }
        if (parents_or_guardians && typeof parents_or_guardians === "string") {
          parents_or_guardians = JSON.parse(parents_or_guardians);
        }
        if (medical_history && typeof medical_history === "string") {
          medical_history = JSON.parse(medical_history);
        }
        if (assessment && typeof assessment === "string") {
          assessment = JSON.parse(assessment);
        }
        if (treatment_objectives && typeof treatment_objectives === "string") {
          treatment_objectives = JSON.parse(treatment_objectives);
        }
        if (disorders && typeof disorders === "string") {
          disorders = JSON.parse(disorders);
        }
      } catch (parseError) {
        console.error("❌ Erro ao parsear JSON:", parseError);
        return res.status(400).json({
          error: "Erro no formato dos dados",
          details: "Dados JSON inválidos: " + parseError.message,
        });
      }

      // Conversões de tipos
      if (age && typeof age === "string") {
        age = parseInt(age);
      }
      if (is_minor && typeof is_minor === "string") {
        is_minor = is_minor === "true";
      }

      // Validações básicas
      if (!name || !email || !password || !age || !full_name || !birth_date) {
        return res.status(400).json({
          error: "Campos obrigatórios não preenchidos",
          details:
            "name, email, password, age, full_name e birth_date são obrigatórios",
        });
      }

      // Verificar se o email já existe
      const existingPatient = await Customer.findOne({ email });
      if (existingPatient) {
        return res.status(400).json({
          error: "Email já cadastrado",
          details: "Este email já está sendo usado por outro paciente",
        });
      }

      // Criptografar a senha
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Preparar dados do paciente
      const customerData = {
        name,
        email,
        password: hashedPassword,
        age,
        full_name,
        birth_date: new Date(birth_date),
        patient_of,
        client_of,
      };

      // Campos opcionais - adicionar apenas se fornecidos
      if (address) customerData.address = address;
      if (profession) customerData.profession = profession;
      if (contacts) customerData.contacts = contacts;
      if (is_minor !== undefined) customerData.is_minor = is_minor;
      if (parents_or_guardians)
        customerData.parents_or_guardians = parents_or_guardians;
      if (medical_history) customerData.medical_history = medical_history;
      if (assessment) customerData.assessment = assessment;
      if (treatment_objectives)
        customerData.treatment_objectives = treatment_objectives;
      if (disorders && Array.isArray(disorders))
        customerData.disorders = disorders;

      // Processar upload do avatar se fornecido
      if (req.file) {
        try {
          console.log("Fazendo upload do avatar...");
          const uploadResult = await uploadToCloudinary(req.file.buffer, {
            public_id: `customer_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`,
          });

          customerData.avatar = {
            url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
          };

          uploadedPublicId = uploadResult.public_id; // Salvar para possível limpeza

          console.log("Upload do avatar concluído:", uploadResult.secure_url);
        } catch (uploadError) {
          console.error("Erro no upload do avatar:", uploadError);
          return res.status(500).json({
            error: "Erro ao fazer upload da imagem",
            details: uploadError.message,
          });
        }
      }

      // Criar o paciente
      const newPatient = new Customer(customerData);
      const savedPatient = await newPatient.save();

      // Remover a senha da resposta
      const patientResponse = { ...savedPatient.toObject() };
      delete patientResponse.password;

      res.status(201).json({
        message: "Paciente criado com sucesso",
        patient: patientResponse,
      });
    } catch (error) {
      console.error("Erro ao criar paciente:", error);

      // Se houve erro após upload, limpar imagem do Cloudinary
      if (uploadedPublicId) {
        try {
          await cloudinary.uploader.destroy(uploadedPublicId);
          console.log("Avatar removido do Cloudinary:", uploadedPublicId);
        } catch (cleanupError) {
          console.error("Erro ao limpar avatar do Cloudinary:", cleanupError);
        }
      }

      // Tratamento de erros específicos do MySQL/MongoDB
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
  }

  // Listar todos os pacientes (apenas para admin)
  async getAll(req, res) {
    try {
      const patients = await Customer.find()
        .populate("patient_of", "name email")
        .populate("client_of", "name")
        .populate("appointments")
        .select("-password");

      res.status(200).json({
        message: "Pacientes recuperados com sucesso",
        count: patients.length,
        patients,
      });
    } catch (error) {
      console.error("Erro ao buscar pacientes:", error);
      res.status(500).json({
        error: "Erro interno do servidor",
        details: error.message,
      });
    }
  }

  // Buscar paciente por ID
  async getById(req, res) {
    try {
      const { id } = req.params;

      const patient = await Customer.findById(id)
        .populate("patient_of", "name email")
        .populate("client_of", "name")
        .populate("appointments")
        .select("-password");

      if (!patient) {
        return res.status(404).json({
          error: "Paciente não encontrado",
          details: "O ID fornecido não corresponde a nenhum paciente",
        });
      }

      res.status(200).json({
        message: "Paciente encontrado",
        patient,
      });
    } catch (error) {
      console.error("Erro ao buscar paciente:", error);
      res.status(500).json({
        error: "Erro interno do servidor",
        details: error.message,
      });
    }
  }

  // Atualizar paciente
  async update(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Se a senha está sendo atualizada, criptografar
      if (updates.password) {
        const saltRounds = 10;
        updates.password = await bcrypt.hash(updates.password, saltRounds);
      }

      const updatedPatient = await Customer.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      })
        .populate("patient_of", "name email")
        .populate("client_of", "name")
        .select("-password");

      if (!updatedPatient) {
        return res.status(404).json({
          error: "Paciente não encontrado",
          details: "O ID fornecido não corresponde a nenhum paciente",
        });
      }

      res.status(200).json({
        message: "Paciente atualizado com sucesso",
        patient: updatedPatient,
      });
    } catch (error) {
      console.error("Erro ao atualizar paciente:", error);
      res.status(500).json({
        error: "Erro interno do servidor",
        details: error.message,
      });
    }
  }

  // Deletar paciente
  async delete(req, res) {
    try {
      const { id } = req.params;

      const deletedPatient = await Customer.findByIdAndDelete(id);

      if (!deletedPatient) {
        return res.status(404).json({
          error: "Paciente não encontrado",
          details: "O ID fornecido não corresponde a nenhum paciente",
        });
      }

      res.status(200).json({
        message: "Paciente deletado com sucesso",
        patient: {
          id: deletedPatient._id,
          name: deletedPatient.name,
          email: deletedPatient.email,
        },
      });
    } catch (error) {
      console.error("Erro ao deletar paciente:", error);
      res.status(500).json({
        error: "Erro interno do servidor",
        details: error.message,
      });
    }
  }

  // Adicionar entrada no diário do humor
  async addMoodEntry(req, res) {
    try {
      const { id } = req.params;
      const { emotion, intensity, description, address } = req.body;

      const patient = await Customer.findById(id);

      if (!patient) {
        return res.status(404).json({
          error: "Paciente não encontrado",
          details: "O ID fornecido não corresponde a nenhum paciente",
        });
      }

      const moodEntry = {
        emotion,
        intensity,
        description,
        address,
        createdAt: new Date(),
      };

      patient.mood_diary.push(moodEntry);
      await patient.save();

      res.status(201).json({
        message: "Entrada no diário do humor adicionada com sucesso",
        mood_entry: moodEntry,
      });
    } catch (error) {
      console.error("Erro ao adicionar entrada no diário:", error);
      res.status(500).json({
        error: "Erro interno do servidor",
        details: error.message,
      });
    }
  }

  // Buscar pacientes por clínica
  async getByClinic(req, res) {
    try {
      const { clinic_id } = req.params;

      const patients = await Customer.find({ client_of: clinic_id })
        .populate("patient_of", "name email")
        .populate("client_of", "name")
        .select("-password");

      res.status(200).json({
        message: "Pacientes da clínica recuperados com sucesso",
        count: patients.length,
        patients,
      });
    } catch (error) {
      console.error("Erro ao buscar pacientes da clínica:", error);
      res.status(500).json({
        error: "Erro interno do servidor",
        details: error.message,
      });
    }
  }

  // Buscar pacientes por profissional
  async getByProfessional(req, res) {
    try {
      const { professional_id } = req.params;

      const patients = await Customer.find({ patient_of: professional_id })
        .populate("patient_of", "name email")
        .populate("client_of", "name")
        .select("-password");

      res.status(200).json({
        message: "Pacientes do profissional recuperados com sucesso",
        count: patients.length,
        patients,
      });
    } catch (error) {
      console.error("Erro ao buscar pacientes do profissional:", error);
      res.status(500).json({
        error: "Erro interno do servidor",
        details: error.message,
      });
    }
  }

  // Ativar/Desativar paciente
  async toggleStatus(req, res) {
    try {
      const { id } = req.params;

      const patient = await Customer.findById(id);

      if (!patient) {
        return res.status(404).json({
          error: "Paciente não encontrado",
          details: "O ID fornecido não corresponde a nenhum paciente",
        });
      }

      patient.status = patient.status === "Ativo" ? "Inativo" : "Ativo";
      await patient.save();

      res.status(200).json({
        message: `Paciente ${patient.status.toLowerCase()} com sucesso`,
        patient: {
          id: patient._id,
          name: patient.name,
          email: patient.email,
          status: patient.status,
        },
      });
    } catch (error) {
      console.error("Erro ao alterar status do paciente:", error);
      res.status(500).json({
        error: "Erro interno do servidor",
        details: error.message,
      });
    }
  }
}

module.exports = new PatientsController();
