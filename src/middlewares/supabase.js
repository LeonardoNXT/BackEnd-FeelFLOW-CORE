// config/supabase.js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const uploadPDFToSupabase = async (file) => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 9);
  const fileName = `${timestamp}_${randomStr}.pdf`;

  console.log(`[SUPABASE] Iniciando upload de PDF:`, {
    arquivo: file.originalname,
    tamanho: (file.size / (1024 * 1024)).toFixed(2) + "MB",
  });

  const uploadStart = Date.now();

  try {
    const { data, error } = await supabase.storage
      .from("documents")
      .upload(fileName, file.buffer, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("[SUPABASE] Erro:", error);
      throw error;
    }

    const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(2);
    console.log(`[SUPABASE] PDF enviado em ${uploadTime}s`);

    const {
      data: { publicUrl },
    } = supabase.storage.from("documents").getPublicUrl(fileName);

    console.log(`[SUPABASE] URL: ${publicUrl}`);

    return {
      resource_type: "raw",
      public_id: fileName,
      secure_url: publicUrl,
      url: publicUrl,
      format: "pdf",
      bucket: "documents",
    };
  } catch (error) {
    console.error("[SUPABASE] Erro no upload:", error);
    throw error;
  }
};

module.exports = { uploadPDFToSupabase };
