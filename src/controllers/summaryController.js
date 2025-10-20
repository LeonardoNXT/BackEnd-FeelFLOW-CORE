const Summary = require("../models/Summary");
const mongoose = require("mongoose");
const errorHelper = require("./logic/errorHelper");
const Customer = require("../models/Customer");

const INTERNAL_ERROR = {
  status: 500,
  error: "Houve um erro interno.",
  message: "Tente novamente mais tarde.",
};

const NOT_FOUND_CONTENT_ERROR = {
  status: 404,
  error: "As informações necessárias não foram encontradas.",
  message: "Insira corretamente as informações necesssárias.",
};

const NOT_FOUND_ID_ERROR = {
  status: 404,
  error: "ID não foi encontrado.",
  message: "Insira um ID.",
};

const NOT_FOUND_PATIENT_ERROR = {
  status: 404,
  error: "O paciente não foi encontrado.",
  message: "Insira um paciente válido.",
};

const NOT_FOUND_SUMMARY_ERROR = {
  status: 404,
  error: "O Resumo não foi encontrado.",
  message: "Tente outro resumo.",
};

const VALIDATE_ID_ERROR = {
  status: 401,
  error: "O ID inserido é invalido.",
  message: "Insira um ID válido.",
};

const summaryController = {
  async createSummary(req, res) {
    const userId = req.user.id;
    const title = req.body.title;
    const description = req.body.description;
    const id = req.body.id;

    if (!id) {
      return errorHelper({ res, ...NOT_FOUND_ID_ERROR });
    }

    if (!mongoose.isValidObjectId(id)) {
      return errorHelper({ res, ...VALIDATE_ID_ERROR });
    }

    const exists = await Customer.exists({ _id: id });
    if (!exists) {
      return errorHelper({ res, ...NOT_FOUND_PATIENT_ERROR });
    }

    if (!title || !description) {
      return errorHelper({ res, ...NOT_FOUND_CONTENT_ERROR });
    }

    try {
      const content = {
        title,
        description,
        created_by: userId,
        created_for: id,
      };

      const newSummary = await Summary.create(content);

      res.status(201).json({
        message: "[SUCESSO] - Resumo criado com sucesso.",
        data: newSummary,
      });
    } catch (err) {
      console.log(" ====== [ERRO Ao criar novo resumo] ======", err);
      errorHelper({ res, ...INTERNAL_ERROR });
    }
  },
  async getAllSummaries(req, res) {
    const userId = req.user.id;

    try {
      const summaries = await Summary.find({
        created_by: userId,
      })
        .populate("created_for", "name avatar")
        .sort({ createdAt: -1 });

      if (summaries.length === 0) {
        return res.status(200).json({
          message: "Não há resumos disponíveis.",
        });
      }
      res.status(200).json({
        message: "[SUCESSO] : Resumos obtidos com sucesso.",
        data: summaries,
      });
    } catch (err) {
      console.log("[==== ERRO INTERNO ====]", err);
      errorHelper({ res, ...INTERNAL_ERROR });
    }
  },
  async getSummaryPerId(req, res) {
    const userId = req.user.id;
    const { id } = req.params || req.body;

    if (!id) {
      return errorHelper({ res, ...NOT_FOUND_ID_ERROR });
    }
    if (!mongoose.isValidObjectId(id)) {
      return errorHelper({ res, ...VALIDATE_ID_ERROR });
    }

    try {
      const summaryContent = await Summary.findOne({
        _id: id,
        created_by: userId,
      });

      if (!summaryContent) {
        return errorHelper({ res, ...NOT_FOUND_SUMMARY_ERROR });
      }

      res.status(200).json({
        message: "[SUCESSO] Resumo listado com sucesso.",
        data: summaryContent,
      });
    } catch (err) {
      console.log("[==== ERRO AO OBTER RESUMO POR ID =====]", err);
      errorHelper({ res, ...INTERNAL_ERROR });
    }
  },
  async getSummariesPerPatient(req, res) {
    const userId = req.user.id;
    const { id } = req.params || req.body;

    if (!id) {
      return errorHelper({ res, ...NOT_FOUND_ID_ERROR });
    }
    if (!mongoose.isValidObjectId(id)) {
      return errorHelper({ res, ...VALIDATE_ID_ERROR });
    }

    try {
      const summariesContent = await Summary.find({
        created_by: userId,
        created_for: id,
      });

      if (!summariesContent) {
        return errorHelper({ res, ...NOT_FOUND_SUMMARY_ERROR });
      }

      res.status(200).json({
        message: "[SUCESSO] Resumo listado com sucesso.",
        data: summariesContent,
      });
    } catch (err) {
      console.log("[==== ERRO AO OBTER RESUMO POR ID =====]", err);
      errorHelper({ res, ...INTERNAL_ERROR });
    }
  },
};

module.exports = summaryController;
