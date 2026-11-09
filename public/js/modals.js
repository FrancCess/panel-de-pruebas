'use strict';

/**
 * Punto de integración del sistema de modales del Panel de Pruebas.
 * Reúne los submódulos especializados de public/js/modals/:
 * - modal-proyecto.js   (CRUD de sistemas, roles y detección de carpeta)
 * - modal-auditoria.js  (Auditoría defensiva OWASP)
 * - modal-carga.js      (Simulador de usuarios concurrentes)
 * - modal-respaldos.js  (Restauración de respaldos del catálogo)
 */
(() => {
  window.PanelPruebas = window.PanelPruebas || {};
  window.PanelPruebas.modals = {
    ...window.PanelPruebas.modalProyecto,
    ...window.PanelPruebas.modalAuditoria,
    ...window.PanelPruebas.modalCarga,
    ...window.PanelPruebas.modalRespaldos
  };
})();
