/**
 * Helper para lidar com fuso horário brasileiro (America/Sao_Paulo)
 * Evita problemas ao validar horários em UTC
 */
const TIMEZONE = 'America/Sao_Paulo';

/**
 * Obtém a hora local (Brasil) de um objeto Date
 * @param {Date} date - Data em UTC
 * @returns {number} - Hora local (0-23)
 */
function getLocalHour(date) {
  const brTime = date.toLocaleString('pt-BR', { 
    timeZone: TIMEZONE,
    hour: '2-digit',
    hour12: false 
  });
  return parseInt(brTime);
}

/**
 * Obtém a hora e minuto local (Brasil) de um objeto Date
 * @param {Date} date - Data em UTC
 * @returns {{hour: number, minute: number}} - Hora e minuto local
 */
function getLocalTime(date) {
  const brTime = date.toLocaleString('pt-BR', { 
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false 
  });
  const [hour, minute] = brTime.split(':').map(Number);
  return { hour, minute };
}

/**
 * Valida se o horário está dentro do intervalo permitido (6h - 22h)
 * @param {Date} startTime - Horário inicial
 * @param {Date} endTime - Horário final
 * @returns {{valid: boolean, error: string|null}} - Resultado da validação
 */
function validateBusinessHours(startTime, endTime) {
  const startLocal = getLocalTime(startTime);
  const endLocal = getLocalTime(endTime);
  
  // Converte para minutos totais para comparação precisa
  const startTotalMinutes = startLocal.hour * 60 + startLocal.minute;
  const endTotalMinutes = endLocal.hour * 60 + endLocal.minute;
  
  // Limite inferior: 6:00 (360 minutos)
  const MIN_MINUTES = 6 * 60;
  // Limite superior: 22:00 (1320 minutos)
  const MAX_MINUTES = 22 * 60;
  
  if (startTotalMinutes < MIN_MINUTES) {
    return {
      valid: false,
      error: "O horário de início não pode ser anterior a 06:00."
    };
  }
  
  if (endTotalMinutes > MAX_MINUTES) {
    return {
      valid: false,
      error: "O horário de término não pode ultrapassar 22:00."
    };
  }
  
  if (startTotalMinutes >= MAX_MINUTES) {
    return {
      valid: false,
      error: "O horário de início não pode ser às 22:00 ou depois."
    };
  }
  
  return { valid: true, error: null };
}

/**
 * Formata uma data no fuso horário brasileiro
 * @param {Date} date - Data a ser formatada
 * @param {Object} options - Opções de formatação (Intl.DateTimeFormat)
 * @returns {string} - Data formatada
 */
function formatLocalDate(date, options = {}) {
  const defaultOptions = {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };
  
  return date.toLocaleString('pt-BR', defaultOptions);
}

/**
 * Verifica se uma data está no passado (considerando fuso horário local)
 * @param {Date} date - Data a ser verificada
 * @returns {boolean} - true se a data é passada
 */
function isPastDate(date) {
  const now = new Date();
  return date.getTime() < now.getTime();
}

/**
 * Loga informações de debug sobre horários (útil para desenvolvimento)
 * @param {Date} startTime - Horário inicial
 * @param {Date} endTime - Horário final
 * @param {string} label - Label para o log
 */
function logTimeDebug(startTime, endTime, label = 'HORÁRIOS') {
  console.log(`[${label}]`, {
    startUTC: startTime.toISOString(),
    endUTC: endTime.toISOString(),
    startLocal: formatLocalDate(startTime),
    endLocal: formatLocalDate(endTime),
    startHourLocal: getLocalHour(startTime),
    endHourLocal: getLocalHour(endTime)
  });
}

module.exports = {
  TIMEZONE,
  getLocalHour,
  getLocalTime,
  validateBusinessHours,
  formatLocalDate,
  isPastDate,
  logTimeDebug
};
