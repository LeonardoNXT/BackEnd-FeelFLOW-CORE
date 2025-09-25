const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    // === IDENTIFICAÇÃO BÁSICA ===
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    avatar: {
      url: {
        type: String,
        required: false,
      },
      public_id: {
        type: String,
        required: false,
      },
    },

    // === IDENTIFICAÇÃO COMPLETA DO PACIENTE ===
    birth_date: {
      type: Date,
      required: true,
    },
    address: {
      street: String,
      number: String,
      neighborhood: String,
      city: String,
      state: String,
      zip_code: String,
      complement: String,
    },
    profession: {
      type: String,
    },
    contacts: {
      phone: String,
      emergency_contact: String,
      emergency_name: String,
    },
    // Para menores de idade
    is_minor: {
      type: Boolean,
      default: false,
    },
    parents_or_guardians: {
      father_name: String,
      mother_name: String,
      guardian_name: String,
      guardian_relationship: String,
    },

    // === HISTÓRICO MÉDICO ===
    medical_history: {
      previous_health_problems: [String],
      current_medical_conditions: [String],
      current_medications: [String],
      allergies: [String],
      surgeries: [String],
      hospitalizations: [String],
    },

    // === AVALIAÇÃO DA DEMANDA ===
    assessment: {
      // Anamnese
      chief_complaint: String, // Queixa principal
      history_of_present_illness: String, // História da doença atual

      // Histórico familiar
      family_history: {
        mental_health_family: [String],
        medical_family_history: [String],
      },

      // Histórico de desenvolvimento
      development_history: {
        pregnancy_delivery: String,
        early_development: String,
        school_performance: String,
        social_relationships: String,
      },

      // Histórico psiquiátrico
      psychiatric_history: {
        previous_treatments: [String],
        previous_medications: [String],
        previous_hospitalizations: [String],
        substance_use: String,
      },

      // Avaliação do estado mental atual
      mental_status: {
        appearance: String,
        behavior: String,
        speech: String,
        mood: String,
        affect: String,
        thought_process: String,
        thought_content: String,
        perceptual_disturbances: String,
        cognitive_function: String,
        insight: String,
        judgment: String,
      },
    },

    // === OBJETIVOS DO TRATAMENTO ===
    treatment_objectives: {
      short_term_goals: [String],
      long_term_goals: [String],
      treatment_approach: String,
      expected_duration: String,
      success_criteria: [String],
    },

    // === CAMPOS ORIGINAIS MANTIDOS ===
    patient_of: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    client_of: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    disorders: [String],
    appointments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Appointment",
      },
    ],
    status: {
      type: String,
      enum: ["Ativo", "Inativo"],
      default: "Ativo",
    },
    mood_diary: [
      {
        emotion: {
          type: String,
          enum: [
            "Feliz",
            "Muito feliz",
            "Triste",
            "Muito triste",
            "Neutro",
            "Irritante",
            "Estressante",
            "Cansativo",
            "Chocante",
            "Ruim",
            "Intenso",
          ],
        },
        intensity: {
          type: Number,
          min: 1,
          max: 10,
          required: true,
        },
        description: {
          type: String,
          maxlength: 500,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true, // Adiciona createdAt e updatedAt automaticamente
  }
);

const Customer = mongoose.model("Customer", customerSchema);

module.exports = Customer;
