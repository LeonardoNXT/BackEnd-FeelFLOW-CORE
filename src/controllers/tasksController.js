const Tasks = require("../models/Tasks");
const ErrorHelper = require("./logic/errorHelper");
const Employee = require("../models/Employee");
const uploadToCloudinary = require("../middlewares/uploadVideosAndImages");
const { uploadPDFToSupabase } = require("../middlewares/supabase");
const errorHelper = require("./logic/errorHelper");
const mongoose = require("mongoose");

const ERROR_CONFIG = {
  INTERNAL: {
    status: 500,
    error: "Erro interno",
    message: "Tente Novamente mais tarde.",
  },
  MISSING_BODY: {
    status: 404,
    error: "Os campos obrigatórios não foram preenchidos corretamente.",
    message:
      "Para resolver, preencha corretamente os campos destacados na página.",
  },
  CLOUDINARY_UPLOAD: {
    status: 500,
    error: "Erro ao enviar arquivo para Cloudinary",
    message: "Tente novamente mais tarde.",
  },
  PATIENT_ERROR: {
    status: 403,
    error: "O paciente não pertence a este funcionário",
    message:
      "Para alterar/adicionar novas funcionalidades ao usuário, é necessário que ele esteja vinculado ao funcionário logado.",
  },
  NOT_FOUND_ANY_TASKS: {
    status: 404,
    error: "Não foi encontrado nenhuma tarefa.",
    message: "Tente novamente com uma tarefa valida.",
  },
  DATE: {
    status: 403,
    error: "A Data colocada não é valida",
    message: "Para resolver, instancie-a com a classe Date corretamente.",
  },
};

const tasksController = {
  async createTask(req, res) {
    const { title, description, steps, intendedFor, completionDate } = req.body;
    const createdBy = req.user.id;
    let stepsParsed;
    if (steps) {
      stepsParsed = JSON.parse(steps);
    }

    if (
      !title ||
      !description ||
      !completionDate ||
      !createdBy ||
      !intendedFor
    ) {
      return ErrorHelper({ res, ...ERROR_CONFIG.MISSING_BODY });
    }

    let dateOfCompletation = new Date(completionDate);
    if (!(dateOfCompletation instanceof Date) || isNaN(dateOfCompletation)) {
      return ErrorHelper({ res, ...ERROR_CONFIG.DATE });
    }

    try {
      const employee = await Employee.findById(createdBy);

      const isPatientValid = employee.patients.some(
        (id) => id.toString() === intendedFor.toString()
      );

      if (!isPatientValid) {
        return ErrorHelper({ res, ...ERROR_CONFIG.PATIENT_ERROR });
      }

      let archive = null;

      if (req.file) {
        const isVideo = req.file.mimetype.startsWith("video/");

        console.log("\n=== INICIANDO UPLOAD ===");
        console.log("Arquivo:", {
          nome: req.file.originalname,
          tipo: req.file.mimetype,
          tamanho: (req.file.size / (1024 * 1024)).toFixed(2) + "MB",
        });

        try {
          if (isVideo) {
            console.log(
              "[VÍDEO] Processando em background (não trava resposta)..."
            );

            const publicId = `task_${Date.now()}_${Math.random()
              .toString(36)
              .substring(2, 9)}`;
            const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
            const folder = "tasks/files";
            const fullPublicId = `${folder}/${publicId}`;

            const predictedUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${fullPublicId}.mp4`;

            archive = {
              archive_type: "video",
              public_id: fullPublicId,
              url: predictedUrl,
              processing: true,
            };

            const TASK_CONFIG = {
              title,
              description,
              steps: steps ? stepsParsed : null,
              createdBy,
              intendedFor,
              completionDate: dateOfCompletation,
              organization: employee.employee_of,
              archive,
            };

            const task = new Tasks({ ...TASK_CONFIG });
            const taskCreated = await task.save();

            // Upload em background
            uploadToCloudinary(req.file, { public_id: publicId })
              .then(async (result) => {
                // ✅ Atualiza com URL real
                taskCreated.archive = {
                  archive_type: result.resource_type,
                  public_id: result.public_id,
                  url: result.secure_url, // ✅ URL REAL do Cloudinary
                  processing: false,
                };
                await taskCreated.save();
                console.log(
                  "[BACKGROUND] Upload concluído e tarefa atualizada!"
                );
                console.log(`[BACKGROUND] URL final: ${result.secure_url}`); // ✅ Log final
              })
              .catch((err) => {
                console.error(
                  "[BACKGROUND] Erro no upload (mas tarefa já foi criada):",
                  err
                );
              });

            return res.status(201).json({
              message: "Tarefa criada! O vídeo estará disponível em instantes.",
              taskCreated,
              videoProcessing: true,
            });
          }

          if (req.file.mimetype === "application/pdf") {
            const uploadPDF = await uploadPDFToSupabase(req.file);
            archive = {
              archive_type: uploadPDF.format,
              public_id: uploadPDF.public_id,
              url: uploadPDF.url,
            };
          } else {
            const resultUploadArchive = await uploadToCloudinary(req.file);

            archive = {
              archive_type: resultUploadArchive.resource_type,
              public_id: resultUploadArchive.public_id,
              url: resultUploadArchive.secure_url,
            };
          }

          console.log("=== UPLOAD CONCLUÍDO ===\n");
        } catch (err) {
          console.error("[ERRO CRÍTICO] Falha no upload:", err);
          return ErrorHelper({ res, ...ERROR_CONFIG.CLOUDINARY_UPLOAD });
        }
      }

      const TASK_CONFIG = {
        title,
        description,
        steps: steps ? stepsParsed : null,
        createdBy,
        intendedFor,
        completionDate: dateOfCompletation,
        organization: employee.employee_of,
        archive,
      };

      const task = new Tasks({ ...TASK_CONFIG });
      const taskCreated = await task.save();

      res.status(201).json({
        message: "Sua tarefa foi adicionada com sucesso.",
        taskCreated,
      });
    } catch (err) {
      console.error("Erro ao criar tarefa:", err);
      return ErrorHelper({ res, ...ERROR_CONFIG.INTERNAL });
    }
  },
  // ✅ VERSÃO CORRIGIDA - Remove duplicação de código

  async createPatientResponse(req, res) {
    const { taskId, title, description } = req.body;
    const patientId = req.user.id;

    // Validação dos campos obrigatórios
    if (!taskId || !title || !description) {
      return ErrorHelper({ res, ...ERROR_CONFIG.MISSING_BODY });
    }

    try {
      // Busca a tarefa
      const task = await Tasks.findById(taskId);

      if (!task) {
        return ErrorHelper({
          res,
          status: 404,
          message: "Tarefa não encontrada.",
        });
      }

      // Verifica se a tarefa é destinada ao paciente autenticado
      if (task.intendedFor.toString() !== patientId.toString()) {
        return ErrorHelper({
          res,
          status: 403,
          message: "Você não tem permissão para responder esta tarefa.",
        });
      }

      // Verifica se já existe uma resposta
      if (task.content_of_response) {
        return ErrorHelper({
          res,
          status: 400,
          message: "Esta tarefa já possui uma resposta.",
        });
      }

      let archive = null;

      // Processamento do arquivo anexado (se existir)
      if (req.file) {
        const isVideo = req.file.mimetype.startsWith("video/");

        console.log("\n=== INICIANDO UPLOAD DA RESPOSTA ===");
        console.log("Arquivo:", {
          nome: req.file.originalname,
          tipo: req.file.mimetype,
          tamanho: (req.file.size / (1024 * 1024)).toFixed(2) + "MB",
        });

        try {
          if (isVideo) {
            console.log(
              "[VÍDEO] Processando em background (não trava resposta)..."
            );

            const publicId = `task_response_${taskId}_${Date.now()}_${Math.random()
              .toString(36)
              .substring(2, 9)}`;
            const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
            const folder = "tasks/responses";
            const fullPublicId = `${folder}/${publicId}`;

            const predictedUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${fullPublicId}.mp4`;

            archive = {
              archive_type: "video",
              public_id: fullPublicId,
              url: predictedUrl,
              processing: true, // ✅ Flag de processamento
            };

            // ✅ Adiciona a resposta com vídeo em processamento
            task.content_of_response = {
              title,
              description,
              archive,
            };
            task.status = "complete";
            await task.save();

            // ✅ Upload em background (não bloqueia resposta)
            uploadToCloudinary(req.file, { public_id: publicId })
              .then(async (result) => {
                // Atualiza com URL real do Cloudinary
                task.content_of_response.archive = {
                  archive_type: result.resource_type,
                  public_id: result.public_id,
                  url: result.secure_url,
                  processing: false, // ✅ Processamento concluído
                };
                await task.save();
                console.log(
                  "[BACKGROUND] Upload concluído e resposta atualizada!"
                );
                console.log(`[BACKGROUND] URL final: ${result.secure_url}`);
              })
              .catch((err) => {
                console.error(
                  "[BACKGROUND] Erro no upload (mas resposta já foi criada):",
                  err
                );
              });

            // ✅ RETORNA IMEDIATAMENTE (vídeo processa em background)
            return res.status(201).json({
              message:
                "Resposta criada! O vídeo estará disponível em instantes.",
              task,
              videoProcessing: true,
            });
          }

          // ✅ Upload de PDF (síncrono)
          if (req.file.mimetype === "application/pdf") {
            const uploadPDF = await uploadPDFToSupabase(req.file);
            archive = {
              archive_type: uploadPDF.format,
              public_id: uploadPDF.public_id,
              url: uploadPDF.url,
              processing: false, // PDF já está disponível
            };
          } else {
            // ✅ Upload de imagens e outros arquivos (síncrono)
            const resultUploadArchive = await uploadToCloudinary(req.file);

            archive = {
              archive_type: resultUploadArchive.resource_type,
              public_id: resultUploadArchive.public_id,
              url: resultUploadArchive.secure_url,
              processing: false, // Arquivo já está disponível
            };
          }

          console.log("=== UPLOAD CONCLUÍDO ===\n");
        } catch (err) {
          console.error("[ERRO CRÍTICO] Falha no upload:", err);
          return ErrorHelper({ res, ...ERROR_CONFIG.CLOUDINARY_UPLOAD });
        }
      }

      // ✅ Adiciona a resposta à tarefa (para arquivos não-vídeo ou sem arquivo)
      task.content_of_response = {
        title,
        description,
        archive,
      };
      task.status = "complete";
      await task.save();

      // ✅ Resposta de sucesso padrão
      res.status(201).json({
        message: "Sua resposta foi adicionada com sucesso.",
        task,
      });
    } catch (err) {
      console.error("Erro ao criar resposta do paciente:", err);
      return ErrorHelper({ res, ...ERROR_CONFIG.INTERNAL });
    }
  },
  async getALLPendingTasks(req, res) {
    const userId = req.user.id;
    const { role } = req.user;

    let pendingTasks = null;

    try {
      if (role === "employee") {
        pendingTasks = await Tasks.find({
          createdBy: userId,
          status: "pending",
          completionDate: {
            $gt: new Date(),
          },
        })
          .populate("intendedFor", "avatar name")
          .sort({ completionDate: 1 });
      } else if (role == "patient") {
        pendingTasks = await Tasks.find({
          intendedFor: userId,
          status: "pending",
          completionDate: {
            $gt: new Date(),
          },
        })
          .populate("createdBy", "avatar name")
          .sort({ completionDate: -1 });
      }
      const total = pendingTasks ? pendingTasks.length : 0;
      return res.status(200).json({
        message: "Os agendamentos pendentes foram listados com sucesso.",
        data: pendingTasks,
        total: total,
      });
    } catch (err) {
      console.log(err);
      ErrorHelper({ res, ...ERROR_CONFIG.INTERNAL });
    }
  },
  async getALLCompleteTasks(req, res) {
    const userId = req.user.id;
    const role = req.user.role;

    try {
      let tasks = null;
      if (role === "employee") {
        tasks = await Tasks.find({
          createdBy: userId,
          status: "complete",
        })
          .populate("intendedFor", "name avatar")
          .sort({ updatedAt: -1 });
      }
      if (role === "patient") {
        tasks = await Tasks.find({
          status: "complete",
          intendedFor: userId,
        })
          .populate("createdBy", "name avatar")
          .sort({ updatedAt: -1 });
      }
      if (tasks.length === 0) {
        return res.status(200).json({
          message: "Não foi encontrado nenhuma tarefa concluída.",
        });
      }
      res.status(200).json({
        message: "As tarefas concluídas foram listadas com sucesso.",
        data: tasks,
      });
    } catch (err) {
      console.log("[ERRO AO OBTER TAREFAS CONCLUÍDAS]", err);
      errorHelper({ res, ...ERROR_CONFIG.INTERNAL });
    }
  },
  async getCompleteTasksPerId(req, res) {
    const userId = req.user.id;
    const role = req.user.role;
    const { id } = req.params || req.body;

    if (!id) {
      return errorHelper({ res, ...ERROR_CONFIG.MISSING_BODY });
    }
    if (!mongoose.isValidObjectId(id)) {
      return errorHelper({
        res,
        status: 404,
        error: "O id não é válido.",
        message: "Digite um um Id válido para continuar.",
      });
    }

    try {
      let tasks = null;
      if (role === "employee") {
        tasks = await Tasks.findOne({
          _id: id,
          createdBy: userId,
        })
          .populate("intendedFor", "name avatar")
          .sort({ completionDate: -1 });
      }
      if (role === "patient") {
        tasks = await Tasks.find({
          _id: id,
          intendedFor: userId,
        })
          .populate("createdBy", "name avatar")
          .sort({ completionDate: -1 });
      }
      if (!tasks) {
        return errorHelper({ res, ...ERROR_CONFIG.NOT_FOUND_ANY_TASKS });
      }
      res.status(200).json({
        message: "As tarefas concluídas foram listadas com sucesso.",
        data: tasks,
      });
    } catch (err) {
      console.log("[ERRO AO OBTER TAREFAS CONCLUÍDAS]", err);
      errorHelper({ res, ...ERROR_CONFIG.INTERNAL });
    }
  },
};

module.exports = tasksController;
