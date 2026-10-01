/**
 * Prende o ponteiro ao elemento, para o arraste continuar quando o cursor sai da área.
 * É só conforto: se o navegador recusar (ponteiro que já soltou, evento sintético, ambiente sem a
 * função), o gesto segue sem a captura.
 */
export function capturar(elemento: HTMLElement, evento: PointerEvent): void {
  try {
    if (evento.pointerId !== undefined) elemento.setPointerCapture?.(evento.pointerId);
  } catch {
    // sem captura: o gesto continua enquanto o ponteiro estiver sobre a área
  }
}
