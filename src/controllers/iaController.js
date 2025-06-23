const OpenAI = require("openai");
const User = require("../models/User");
const ChatSession = require("../models/ChatSession");

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

async function handleUserMessage(userId, userInput, name) {
  let session = await ChatSession.findOne({ userId });

  if (!session) {
    session = new ChatSession({ userId, messages: [] });
  }

  // Limita a 30 pares (60 mensagens)
  const recentMessages = session.messages.slice(-30);

  // Monta a conversa com a IA
  const messagesForAI = [
    {
      role: "system",
      content: `
  Você é um assistente psicológico especializado em respostas completas e inteligentes da melhor forma.
  Responda apenas perguntas relacionadas a saúde mental, emoções e comportamento humano.
  Use linguagem clara e evite jargões técnicos e se apresente como um chat da NewArch se o usuário perguntar!.
  Voce pode chamar ele pelo nome ${name}
  Formato da resposta:
<h2>Título explicativo</h2>
<p>Explicação clara, simples e acessível.</p>

Use apenas elementos como <h2>, <p>, <ul>, <li>. Nunca use CSS inline.
Vocë pode usar emojis para ser mais amigavel.
Ao final, coloque suas fontes validas.
<div class="fontes-conteiner">
  <a href="link da fonte" target="_blank">nome</a> se houver mais coloque.
</div>

`,
    },
    ...recentMessages,
    { role: "user", content: userInput },
  ];

  // Faz a chamada para a OpenAI
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: messagesForAI,
  });

  const aiResponse = completion.choices[0].message.content;

  // Salva as mensagens no banco
  session.messages.push(
    { role: "user", content: userInput },
    { role: "assistant", content: aiResponse }
  );

  await session.save();
  return { response: aiResponse, messangeCounts: session.messages.length };
}

exports.chatWithAI = async (req, res) => {
  const id = req.user.id;
  const { mensage } = req.body;
  const user = await User.findById(id, "-password -_id -email");
  const name = user.name.split(" ")[0];
  try {
    const reply = await handleUserMessage(id, mensage, name);
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao processar mensagem." });
  }
};
