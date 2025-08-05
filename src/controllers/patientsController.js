const Customer = require("../models/Customer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

class PatientsController {
  // Criar um novo paciente
  async create(req, res) {
    try {
      const {
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

      // Criar o paciente
      const newPatient = new Customer({
        name,
        email,
        password: hashedPassword,
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
      });

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
      res.status(500).json({
        error: "Erro interno do servidor",
        details: error.message,
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
