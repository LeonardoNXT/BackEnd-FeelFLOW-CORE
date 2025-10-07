const Tasks = require("../models/Tasks");
const ErrorHelper = require("./logic/errorHelper");
const Employee = require("../models/Employee");
const uploadToCloudinary = require("../middlewares/uploadVideosAndImages");
const { uploadPDFToSupabase } = require("../middlewares/supabase");

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
  async getALLPendingTasks(req, res) {
    const userId = req.user.id;
    const { role } = req.user;

    let pendingTasks = null;

    try {
      if (role === "employee") {
        pendingTasks = await Tasks.find({
          createdBy: userId,
          status: "pending",
        }).populate("intendedFor", "avatar name");
      } else if (role == "patient") {
        pendingTasks = await Tasks.find({
          intendedFor: userId,
          status: "pending",
        }).populate("createdBy", "avatar name");
      }
      const total = pendingTasks ? pendingTasks.length : 0;
      return res.status(200).json({
        message: "Os agendamentos pendentes foram listados com sucesso.",
        pendingTasks,
        total: total,
      });
    } catch (err) {
      console.log(err);
      ErrorHelper({ res, ...ERROR_CONFIG.INTERNAL });
    }
  },
};

module.exports = tasksController;
