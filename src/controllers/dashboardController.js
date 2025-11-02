// ========== IMPORTS ==========
const Customer = require("../models/Customer");
const Organization = require("../models/Organization");
const { sendError } = require("../controllers/logic/errorHelper");

// ========== FUNÇÕES AUXILIARES DE CÁLCULO ==========

/**
 * Calcula a variação percentual entre dois valores
 */
const calculatePercentageChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Formata número com pontos (ex: 45678 -> 45.678)
 */
const formatNumber = (num) => {
  return num.toLocaleString("pt-BR");
};

/**
 * Obtém período anterior baseado em dias
 */
const getPreviousPeriod = (days) => {
  const now = new Date();
  const currentPeriodStart = new Date(now);
  currentPeriodStart.setDate(now.getDate() - days);

  const previousPeriodStart = new Date(currentPeriodStart);
  previousPeriodStart.setDate(currentPeriodStart.getDate() - days);

  return {
    currentStart: currentPeriodStart,
    currentEnd: now,
    previousStart: previousPeriodStart,
    previousEnd: currentPeriodStart,
  };
};

// ========== LÓGICAS DE NEGÓCIO ==========

/**
 * Calcula métricas de contas criadas
 */
const getAccountsCreatedMetrics = async (organizationId) => {
  const { currentStart, currentEnd, previousStart, previousEnd } =
    getPreviousPeriod(30);

  // Contar contas criadas no período atual
  const currentCount = await Customer.countDocuments({
    client_of: organizationId,
    createdAt: { $gte: currentStart, $lte: currentEnd },
  });

  // Contar contas criadas no período anterior
  const previousCount = await Customer.countDocuments({
    client_of: organizationId,
    createdAt: { $gte: previousStart, $lte: previousEnd },
  });

  // Calcular variação percentual
  const percentageChange = calculatePercentageChange(
    currentCount,
    previousCount
  );

  // Total de todas as contas
  const totalAccounts = await Customer.countDocuments({
    client_of: organizationId,
  });

  // Determinar tendência
  let trend = "Estável";
  let trendMessage = "Mantendo média histórica";

  if (percentageChange > 15) {
    trend = "Crescimento forte";
    trendMessage = "Aumentando consideravelmente";
  } else if (percentageChange > 5) {
    trend = "Crescimento";
    trendMessage = "Engajamento excede metas";
  } else if (percentageChange < -15) {
    trend = "Queda forte";
    trendMessage = "Abaixo da média esperada";
  } else if (percentageChange < -5) {
    trend = "Queda";
    trendMessage = "Atenção necessária";
  }

  return {
    total: totalAccounts,
    formatted: formatNumber(totalAccounts),
    percentageChange: percentageChange.toFixed(1),
    trend,
    trendMessage,
    isPositive: percentageChange >= 0,
  };
};

/**
 * Calcula emoção predominante do momento (usando mood_diary)
 */
const calculateMoodMetrics = async (organizationId) => {
  const { currentStart, currentEnd, previousStart, previousEnd } =
    getPreviousPeriod(30);

  // Buscar todos os clientes da organização
  const customers = await Customer.find({
    client_of: organizationId,
  }).select("mood_diary");

  // Filtrar registros do mood_diary por período
  const currentMoodEntries = [];
  const previousMoodEntries = [];

  customers.forEach((customer) => {
    if (customer.mood_diary && customer.mood_diary.length > 0) {
      customer.mood_diary.forEach((entry) => {
        const entryDate = new Date(entry.createdAt);

        if (entryDate >= currentStart && entryDate <= currentEnd) {
          currentMoodEntries.push(entry);
        }

        if (entryDate >= previousStart && entryDate <= previousEnd) {
          previousMoodEntries.push(entry);
        }
      });
    }
  });

  // Contar emoções do período atual
  const currentEmotionCounts = currentMoodEntries.reduce((acc, entry) => {
    if (entry.emotion) {
      acc[entry.emotion] = (acc[entry.emotion] || 0) + 1;
    }
    return acc;
  }, {});

  // Contar emoções do período anterior
  const previousEmotionCounts = previousMoodEntries.reduce((acc, entry) => {
    if (entry.emotion) {
      acc[entry.emotion] = (acc[entry.emotion] || 0) + 1;
    }
    return acc;
  }, {});

  // Encontrar emoção predominante atual
  let dominantEmotion = "Neutro";
  let maxCount = 0;

  Object.entries(currentEmotionCounts).forEach(([emotion, count]) => {
    if (count > maxCount) {
      maxCount = count;
      dominantEmotion = emotion;
    }
  });

  // Calcular variação da emoção predominante
  const currentEmotionCount = currentEmotionCounts[dominantEmotion] || 0;
  const previousEmotionCount = previousEmotionCounts[dominantEmotion] || 0;
  const percentageChange = calculatePercentageChange(
    currentEmotionCount,
    previousEmotionCount
  );

  // Calcular emoção predominante do mês (últimos 30 dias completos)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthMoodEntries = [];
  customers.forEach((customer) => {
    if (customer.mood_diary && customer.mood_diary.length > 0) {
      customer.mood_diary.forEach((entry) => {
        const entryDate = new Date(entry.createdAt);
        if (entryDate >= monthStart) {
          monthMoodEntries.push(entry);
        }
      });
    }
  });

  const monthEmotionCounts = monthMoodEntries.reduce((acc, entry) => {
    if (entry.emotion) {
      acc[entry.emotion] = (acc[entry.emotion] || 0) + 1;
    }
    return acc;
  }, {});

  let monthTrend = "Neutro";
  let monthMaxCount = 0;

  Object.entries(monthEmotionCounts).forEach(([emotion, count]) => {
    if (count > monthMaxCount) {
      monthMaxCount = count;
      monthTrend = emotion;
    }
  });

  // Mensagem contextual
  const totalCurrentMoods = currentMoodEntries.length;
  const baseMessage = `Baseado em ${totalCurrentMoods} registro${totalCurrentMoods !== 1 ? "s" : ""} de humor recente${totalCurrentMoods !== 1 ? "s" : ""}`;

  return {
    currentEmotion: dominantEmotion,
    percentageChange: percentageChange.toFixed(1),
    monthTrend,
    message: baseMessage,
    totalMoods: totalCurrentMoods,
    isPositive: percentageChange >= 0,
    emotionDistribution: currentEmotionCounts,
  };
};

/**
 * Calcula dados de cadastros por dia (últimos 3 meses)
 */
const calculatePatientsChartData = async (organizationId) => {
  // Calcular data de 3 meses atrás
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  threeMonthsAgo.setHours(0, 0, 0, 0);

  // Buscar todos os pacientes criados nos últimos 3 meses
  const patients = await Customer.find({
    client_of: organizationId,
    createdAt: { $gte: threeMonthsAgo },
  }).select("createdAt");

  // Agrupar por data
  const dataMap = {};

  patients.forEach((patient) => {
    const date = new Date(patient.createdAt);
    const dateKey = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

    dataMap[dateKey] = (dataMap[dateKey] || 0) + 1;
  });

  // Converter para array e ordenar por data
  const chartData = Object.entries(dataMap)
    .map(([date, quantidade]) => ({
      date,
      quantidade,
    }))
    .sort((a, b) => {
      const [dayA, monthA, yearA] = a.date.split("/").map(Number);
      const [dayB, monthB, yearB] = b.date.split("/").map(Number);

      const dateA = new Date(yearA, monthA - 1, dayA);
      const dateB = new Date(yearB, monthB - 1, dayB);

      return dateA - dateB;
    });

  return chartData;
};

/**
 * Calcula dados de emoções por dia (últimos 3 meses)
 */
const calculateEmotionsChartData = async (organizationId) => {
  // Calcular data de 3 meses atrás
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  threeMonthsAgo.setHours(0, 0, 0, 0);

  // Buscar todos os clientes da organização
  const customers = await Customer.find({
    client_of: organizationId,
  }).select("mood_diary");

  // Agrupar por data e emoção
  const dataMap = {};

  // Lista de emoções possíveis baseada no schema
  const emotionsList = [
    "Feliz",
    "Muito feliz",
    "Triste",
    "Muito triste",
    "Indiferente",
    "Com raiva",
    "Furioso",
    "Cansado",
    "Ansioso",
    "Envergonhado",
    "Péssimo",
    "Animado",
  ];

  customers.forEach((customer) => {
    if (customer.mood_diary && customer.mood_diary.length > 0) {
      customer.mood_diary.forEach((entry) => {
        const entryDate = new Date(entry.createdAt);

        // Filtrar apenas registros dos últimos 3 meses
        if (entryDate >= threeMonthsAgo) {
          const year = entryDate.getFullYear();
          const month = String(entryDate.getMonth() + 1).padStart(2, "0");
          const day = String(entryDate.getDate()).padStart(2, "0");
          const dateKey = `${year}-${month}-${day}`;

          if (!dataMap[dateKey]) {
            dataMap[dateKey] = {
              date: dateKey,
            };
            // Inicializar todas as emoções com 0
            emotionsList.forEach((emotion) => {
              dataMap[dateKey][emotion] = 0;
            });
          }

          // Incrementar contagem da emoção específica
          if (entry.emotion && dataMap[dateKey][entry.emotion] !== undefined) {
            dataMap[dateKey][entry.emotion]++;
          }
        }
      });
    }
  });

  // Converter para array e ordenar por data
  const chartData = Object.values(dataMap).sort((a, b) => {
    return new Date(a.date) - new Date(b.date);
  });

  return chartData;
};

// ========== CONTROLLERS ==========

/**
 * Controller: Retorna métricas de contas criadas
 */
const getAccountsMetrics = async (req, res) => {
  try {
    const organizationId = req.user.id;

    // Validar organização
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return sendError({
        res,
        status: 404,
        error: "Organização não encontrada",
        message: "A organização especificada não existe",
      });
    }

    const metrics = await getAccountsCreatedMetrics(organizationId);

    res.status(200).json({
      title: "Contas Criadas",
      value: metrics.formatted,
      rawValue: metrics.total,
      change: `${metrics.isPositive ? "+" : ""}${metrics.percentageChange}%`,
      percentageChange: parseFloat(metrics.percentageChange),
      trend: metrics.trend,
      message: metrics.trendMessage,
      isPositive: metrics.isPositive,
    });
  } catch (error) {
    console.error("❌ Erro ao buscar métricas de contas:", error);
    return sendError({
      res,
      status: 500,
      error: "Erro ao buscar métricas",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Erro ao processar solicitação",
    });
  }
};

/**
 * Controller: Retorna métricas de emoção do momento
 */
const getMoodMetrics = async (req, res) => {
  try {
    const organizationId = req.user.id;

    // Validar organização
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return sendError({
        res,
        status: 404,
        error: "Organização não encontrada",
        message: "A organização especificada não existe",
      });
    }

    const metrics = await calculateMoodMetrics(organizationId);

    res.status(200).json({
      title: "Emoção do Momento",
      emotion: metrics.currentEmotion,
      change: `${metrics.isPositive ? "+" : ""}${metrics.percentageChange}%`,
      percentageChange: parseFloat(metrics.percentageChange),
      monthTrend: metrics.monthTrend,
      trendMessage: `Tendência desse mês (${metrics.monthTrend})`,
      message: metrics.message,
      totalMoods: metrics.totalMoods,
      isPositive: metrics.isPositive,
      distribution: metrics.emotionDistribution,
    });
  } catch (error) {
    console.error("❌ Erro ao buscar métricas de emoção:", error);
    return sendError({
      res,
      status: 500,
      error: "Erro ao buscar métricas",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Erro ao processar solicitação",
    });
  }
};

/**
 * Controller: Retorna todas as métricas do dashboard
 */
const getAllDashboardMetrics = async (req, res) => {
  try {
    const organizationId = req.user.id;

    // Validar organização
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return sendError({
        res,
        status: 404,
        error: "Organização não encontrada",
        message: "A organização especificada não existe",
      });
    }

    // Buscar todas as métricas em paralelo
    const [accountsMetrics, moodMetrics] = await Promise.all([
      getAccountsCreatedMetrics(organizationId),
      calculateMoodMetrics(organizationId),
    ]);

    res.status(200).json({
      accountsCreated: {
        title: "Contas Criadas",
        value: accountsMetrics.formatted,
        rawValue: accountsMetrics.total,
        change: `${accountsMetrics.isPositive ? "+" : ""}${accountsMetrics.percentageChange}%`,
        percentageChange: parseFloat(accountsMetrics.percentageChange),
        trend: accountsMetrics.trend,
        message: accountsMetrics.trendMessage,
        isPositive: accountsMetrics.isPositive,
      },
      mood: {
        title: "Emoção do Momento",
        emotion: moodMetrics.currentEmotion,
        change: `${moodMetrics.isPositive ? "+" : ""}${moodMetrics.percentageChange}%`,
        percentageChange: parseFloat(moodMetrics.percentageChange),
        monthTrend: moodMetrics.monthTrend,
        trendMessage: `Tendência desse mês (${moodMetrics.monthTrend})`,
        message: moodMetrics.message,
        totalMoods: moodMetrics.totalMoods,
        isPositive: moodMetrics.isPositive,
        distribution: moodMetrics.emotionDistribution,
      },
    });
  } catch (error) {
    console.error("❌ Erro ao buscar métricas do dashboard:", error);
    return sendError({
      res,
      status: 500,
      error: "Erro ao buscar métricas",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Erro ao processar solicitação",
    });
  }
};

/**
 * Controller: Retorna dados de cadastros por dia (gráfico)
 */
const getPatientsChartData = async (req, res) => {
  try {
    const organizationId = req.user.id;

    // Validar organização
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return sendError({
        res,
        status: 404,
        error: "Organização não encontrada",
        message: "A organização especificada não existe",
      });
    }

    const chartData = await calculatePatientsChartData(organizationId);

    res.status(200).json({
      period: "Últimos 3 meses",
      data: chartData,
      total: chartData.reduce((sum, item) => sum + item.quantidade, 0),
    });
  } catch (error) {
    console.error("❌ Erro ao buscar dados do gráfico de pacientes:", error);
    return sendError({
      res,
      status: 500,
      error: "Erro ao buscar dados",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Erro ao processar solicitação",
    });
  }
};

/**
 * Controller: Retorna dados de emoções por dia (gráfico)
 */
const getEmotionsChartData = async (req, res) => {
  try {
    const organizationId = req.user.id;

    // Validar organização
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return sendError({
        res,
        status: 404,
        error: "Organização não encontrada",
        message: "A organização especificada não existe",
      });
    }

    const chartData = await calculateEmotionsChartData(organizationId);

    res.status(200).json({
      period: "Últimos 3 meses",
      data: chartData,
      emotions: [
        "Feliz",
        "Muito feliz",
        "Triste",
        "Muito triste",
        "Indiferente",
        "Com raiva",
        "Furioso",
        "Cansado",
        "Ansioso",
        "Envergonhado",
        "Péssimo",
        "Animado",
      ],
    });
  } catch (error) {
    console.error("❌ Erro ao buscar dados do gráfico de emoções:", error);
    return sendError({
      res,
      status: 500,
      error: "Erro ao buscar dados",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Erro ao processar solicitação",
    });
  }
};

/**
 * Calcula distribuição de idades dos clientes
 */
const calculateAgeDistribution = async (organizationId) => {
  // Buscar todos os clientes da organização
  const customers = await Customer.find({
    client_of: organizationId,
  }).select("birth_date createdAt");

  // Função para calcular idade
  const calculateAge = (birthDate) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }

    return age;
  };

  // Definir faixas etárias
  const ageRanges = {
    "0-13": 0,
    "14-16": 0,
    "17-24": 0,
    "25-32": 0,
    "33-44": 0,
    "45+": 0,
  };

  let totalWithAge = 0;
  let totalAge = 0;

  customers.forEach((customer) => {
    if (customer.birth_date) {
      const age = calculateAge(customer.birth_date);
      totalAge += age;
      totalWithAge++;

      if (age <= 13) {
        ageRanges["0-13"]++;
      } else if (age <= 16) {
        ageRanges["14-16"]++;
      } else if (age <= 24) {
        ageRanges["17-24"]++;
      } else if (age <= 32) {
        ageRanges["25-32"]++;
      } else if (age <= 44) {
        ageRanges["33-44"]++;
      } else {
        ageRanges["45+"]++;
      }
    }
  });

  const averageAge = totalWithAge > 0 ? Math.round(totalAge / totalWithAge) : 0;

  // Encontrar faixa etária predominante
  let dominantRange = "0-13";
  let maxCount = 0;

  Object.entries(ageRanges).forEach(([range, count]) => {
    if (count > maxCount) {
      maxCount = count;
      dominantRange = range;
    }
  });

  // Calcular variação do mês anterior
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const recentCustomers = customers.filter(
    (c) => c.createdAt >= oneMonthAgo && c.birth_date
  );

  const recentAgeRanges = {
    "0-13": 0,
    "14-16": 0,
    "17-24": 0,
    "25-32": 0,
    "33-44": 0,
    "45+": 0,
  };

  recentCustomers.forEach((customer) => {
    const age = calculateAge(customer.birth_date);

    if (age <= 13) {
      recentAgeRanges["0-13"]++;
    } else if (age <= 16) {
      recentAgeRanges["14-16"]++;
    } else if (age <= 24) {
      recentAgeRanges["17-24"]++;
    } else if (age <= 32) {
      recentAgeRanges["25-32"]++;
    } else if (age <= 44) {
      recentAgeRanges["33-44"]++;
    } else {
      recentAgeRanges["45+"]++;
    }
  });

  return {
    distribution: ageRanges,
    recentDistribution: recentAgeRanges,
    averageAge,
    totalCustomers: totalWithAge,
    dominantRange,
  };
};

/**
 * Controller: Retorna distribuição de idades
 */
const getAgeDistribution = async (req, res) => {
  try {
    const organizationId = req.user.id;

    // Validar organização
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return sendError({
        res,
        status: 404,
        error: "Organização não encontrada",
        message: "A organização especificada não existe",
      });
    }

    const ageData = await calculateAgeDistribution(organizationId);

    // Formatar dados para o gráfico
    const chartData = Object.entries(ageData.distribution).map(
      ([range, count]) => ({
        range,
        count,
        percentage:
          ageData.totalCustomers > 0
            ? ((count / ageData.totalCustomers) * 100).toFixed(1)
            : "0.0",
      })
    );

    res.status(200).json({
      averageAge: ageData.averageAge,
      distribution: chartData,
      totalCustomers: ageData.totalCustomers,
      dominantRange: ageData.dominantRange,
      recentDistribution: ageData.recentDistribution,
    });
  } catch (error) {
    console.error("❌ Erro ao buscar distribuição de idades:", error);
    return sendError({
      res,
      status: 500,
      error: "Erro ao buscar dados",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Erro ao processar solicitação",
    });
  }
};

// ========== EXPORTS ==========
module.exports = {
  getAccountsMetrics,
  getMoodMetrics,
  getAllDashboardMetrics,
  getPatientsChartData,
  getEmotionsChartData,
  getAgeDistribution,
};
