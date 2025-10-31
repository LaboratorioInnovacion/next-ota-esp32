import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Formatea una fecha UTC para mostrarla como "hace X tiempo" considerando la zona horaria local
 */
export function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  
  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: es,
  });
}

/**
 * Convierte una fecha UTC a horario argentino (UTC-3)
 */
export function toArgentinaTime(dateString) {
  const utcDate = new Date(dateString);
  // Argentina es UTC-3, así que restamos 3 horas
  return new Date(utcDate.getTime() - 3 * 60 * 60 * 1000);
}

/**
 * Formatea una fecha para mostrar en horario argentino
 */
export function formatArgentinaTime(dateString) {
  const argTime = toArgentinaTime(dateString);
  return format(argTime, 'dd/MM/yyyy HH:mm:ss', { locale: es });
}

/**
 * Calcula los minutos transcurridos desde una fecha UTC hasta ahora
 */
export function getMinutesSince(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
}