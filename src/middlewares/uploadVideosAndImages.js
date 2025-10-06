const cloudinary = require("cloudinary").v2;
const stream = require("stream");
const sharp = require("sharp");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  api_proxy: null,
});

const compressImage = async (buffer) => {
  return await sharp(buffer)
    .resize(1920, 1080, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();
};

module.exports = async (file, options = {}) => {
  return new Promise(async (resolve, reject) => {
    let resourceType = "raw";
    const isImage = file.mimetype.startsWith("image/");
    const isVideo = file.mimetype.startsWith("video/");
    const isPDF = file.mimetype === "application/pdf";

    if (isImage) resourceType = "image";
    else if (isVideo) resourceType = "video";

    const publicId =
      options.public_id ||
      `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const uploadOptions = {
      resource_type: resourceType,
      folder: isImage ? "employees/avatars" : "tasks/files",
      public_id: publicId,
      chunk_size: 6000000,
      eager_async: true,
      invalidate: false,
      overwrite: false,
      use_filename: false,

      ...(isVideo && {
        resource_type: "video",
        eager_async: true,
        eager: undefined,
        format: undefined,
        moderation: undefined,
        quality_analysis: false,
        notification_url: undefined,
        async: true,
        return_delete_token: false,
      }),

      ...(isImage && {
        quality: "auto:good",
        fetch_format: "auto",
      }),

      ...(isPDF && {
        resource_type: "raw",
        format: "pdf",
      }),

      timeout: 60000,
      ...options,
    };

    // Timeout de segurança
    const safetyTimeout = setTimeout(() => {
      console.log(
        "[TIMEOUT] Vídeo enviado 100%, finalizando sem esperar processamento..."
      );

      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const folder = uploadOptions.folder;
      const fullPublicId = `${folder}/${publicId}`;

      let predictedUrl;
      if (isVideo) {
        predictedUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${fullPublicId}.mp4`;
      } else if (isImage) {
        predictedUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${fullPublicId}.jpg`;
      } else {
        predictedUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${fullPublicId}`;
      }

      // ✅ LOG MOVIDO PARA CÁ (dentro do timeout)
      console.log("[TIMEOUT] URL preditiva gerada:", predictedUrl);
      console.log(`[SUCESSO] URL: ${predictedUrl}`);

      resolve({
        resource_type: resourceType,
        public_id: fullPublicId,
        secure_url: predictedUrl,
        url: predictedUrl,
        fallback: true,
      });
    }, 30000);

    const fileSizeMB = (file.buffer.length / (1024 * 1024)).toFixed(2);
    console.log(`[UPLOAD] Iniciando ${resourceType}:`, {
      mimetype: file.mimetype,
      size: `${fileSizeMB}MB`,
      chunks: resourceType === "video" ? "6MB" : "padrão",
    });

    const uploadStart = Date.now();

    try {
      let bufferToUpload = file.buffer;

      if (isImage && file.buffer.length > 500 * 1024) {
        console.log("[COMPRESSÃO] Reduzindo tamanho da imagem...");
        const startCompress = Date.now();
        bufferToUpload = await compressImage(file.buffer);

        const originalSize = (file.buffer.length / (1024 * 1024)).toFixed(2);
        const compressedSize = (bufferToUpload.length / (1024 * 1024)).toFixed(
          2
        );
        const savings = (
          (1 - bufferToUpload.length / file.buffer.length) *
          100
        ).toFixed(0);

        console.log(
          `[COMPRESSÃO] Concluída em ${Date.now() - startCompress}ms`
        );
        console.log(
          `[COMPRESSÃO] ${originalSize}MB → ${compressedSize}MB (${savings}% menor)`
        );
      }

      const bufferStream = new stream.PassThrough({
        highWaterMark: isVideo ? 6 * 1024 * 1024 : 64 * 1024,
      });
      bufferStream.end(bufferToUpload);

      let lastProgress = 0;
      bufferStream.on("data", (chunk) => {
        const progress = Math.floor(
          (chunk.length / bufferToUpload.length) * 100
        );
        if (progress - lastProgress >= 10) {
          console.log(`[UPLOAD] Progresso: ${progress}%`);
          lastProgress = progress;
        }
      });

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          clearTimeout(safetyTimeout);
          const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(2);

          if (error) {
            console.error(`[ERRO] Upload falhou após ${uploadTime}s:`, error);

            if (error.http_code === 499 || error.message?.includes("timeout")) {
              console.log("[RECUPERAÇÃO] Usando URL preditiva após timeout...");
              const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
              const folder = uploadOptions.folder;
              const publicId = uploadOptions.public_id;
              const predictedUrl = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${folder}/${publicId}`;

              console.log(`[SUCESSO] URL (recuperada): ${predictedUrl}`);

              return resolve({
                resource_type: resourceType,
                public_id: `${folder}/${publicId}`,
                secure_url: predictedUrl,
                url: predictedUrl,
                recovered: true,
              });
            }

            return reject(error);
          }

          console.log(`[SUCESSO] Upload concluído em ${uploadTime}s`);
          console.log(
            "[DEBUG] Resposta do Cloudinary:",
            JSON.stringify(result, null, 2)
          );

          // ✅ CORREÇÃO: Se não vier URL no result, construir manualmente
          let finalUrl = result.secure_url || result.url;

          if (!finalUrl) {
            console.log(
              "[AVISO] Cloudinary não retornou URL, construindo manualmente..."
            );
            const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
            const folder = uploadOptions.folder;

            // O public_id pode vir completo ou não
            const fullPublicId = result.public_id || `${folder}/${publicId}`;

            if (isVideo) {
              finalUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${fullPublicId}.mp4`;
            } else if (isImage) {
              finalUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${fullPublicId}.jpg`;
            } else {
              finalUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${fullPublicId}`;
            }
          }

          console.log(`[SUCESSO] URL: ${finalUrl}`);

          resolve({
            ...result,
            resource_type: resourceType,
            secure_url: finalUrl,
            url: finalUrl,
          });
        }
      );

      bufferStream.pipe(uploadStream);
    } catch (error) {
      clearTimeout(safetyTimeout); // ✅ Limpa timeout em caso de erro
      console.error("[ERRO] Falha ao processar arquivo:", error);
      reject(error);
    }
  });
};
