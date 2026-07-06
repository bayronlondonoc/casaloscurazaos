<?php
/* =====================================================================
   Casa Los Curazaos — iCal export para Airbnb
   ---------------------------------------------------------------------
   Devuelve un calendario .ics con las reservas CONFIRMADAS desde la web
   para una cabaña dada. Airbnb lo importa así:

     Anuncio en Airbnb → Disponibilidad → Sincronizar calendarios →
     Importar calendario → Pega esta URL:
       https://[TU_DOMINIO]/api/calendar.php?cabin=luxe

   Hazlo para las 4 cabañas (luxe, comfort, prestige, casa-completa).
   Airbnb sincroniza cada ~3h y bloqueará esas fechas automáticamente.
   ===================================================================== */

require __DIR__ . '/_lib.php';
$cfg = clc_load_config();

$cabin = isset($_GET['cabin']) ? preg_replace('/[^a-z0-9\-]/', '', $_GET['cabin']) : '';
if (!isset($cfg['op']['cabin_names'][$cabin])) {
  http_response_code(400);
  exit('cabaña inválida');
}

$reservas = clc_load_reservations();
$events = [];

/* Función local: ¿debe incluirse esta reserva en el iCal?
   - confirmed: siempre
   - pending: sí, dentro de las primeras 2h (el pago puede estar en proceso)
   Esto asegura que Airbnb vea el bloqueo aunque el webhook tarde. */
$shouldExport = function($r) {
  if ($r['status'] === 'confirmed') return true;
  if ($r['status'] === 'blocked')   return true;
  if ($r['status'] === 'pending') {
    $age = time() - strtotime($r['createdAt']);
    return $age <= 2 * 3600;
  }
  return false;
};

foreach ($reservas as $orderId => $r) {
  if ($r['cabin'] !== $cabin) continue;
  if (!$shouldExport($r)) continue;
  $label = $r['status'] === 'confirmed' ? 'Reservado vía web' : 'Reserva en proceso (web)';
  $events[] = [
    'uid'     => $orderId . '@casaloscurazaos',
    'start'   => $r['start'],
    'end'     => $r['end'],
    'summary' => $label,
    'desc'    => ($r['status'] === 'confirmed' ? 'Confirmado' : 'Pendiente pago') . ' · ' . ($r['adults'] ?? 2) . ' adultos',
  ];
}

/* Cruzado A: si pidieron iCal de Luxe/Comfort/Prestige,
   también agregar cualquier reserva de "casa-completa" porque ocupa las 3. */
if (in_array($cabin, ['luxe','comfort','prestige'])) {
  foreach ($reservas as $orderId => $r) {
    if ($r['cabin'] !== 'casa-completa') continue;
    if (!$shouldExport($r)) continue;
    $events[] = [
      'uid' => $orderId . '-' . $cabin . '@casaloscurazaos',
      'start' => $r['start'], 'end' => $r['end'],
      'summary' => 'Casa Completa reservada (web)',
    ];
  }
}

/* Cruzado B: si pidieron iCal de "casa-completa", agregar las reservas de
   CUALQUIER cabaña individual — si una está ocupada, la finca completa
   no se puede vender. Esto hace que Airbnb bloquee el anuncio de la finca
   cuando se reserva una sola cabaña desde la web. */
if ($cabin === 'casa-completa') {
  foreach ($reservas as $orderId => $r) {
    if (!in_array($r['cabin'], ['luxe','comfort','prestige'])) continue;
    if (!$shouldExport($r)) continue;
    $events[] = [
      'uid'     => $orderId . '-casacompleta@casaloscurazaos',
      'start'   => $r['start'], 'end' => $r['end'],
      'summary' => ($r['cabinName'] ?? $r['cabin']) . ' reservada (web)',
    ];
  }
}

/* Solo Expedia → Airbnb: incluir reservas de Expedia para que Airbnb las vea bloqueadas.
   NO leer el iCal de Airbnb aquí — causaría un loop circular (Airbnb ve sus propios eventos). */
if ($cabin === 'comfort') {
  $urlExpedia = $cfg['expedia_ical']['comfort'] ?? '';
  if (!empty($urlExpedia)) {
    $expediaIcal = clc_fetch_ical_cached($urlExpedia, 'expedia_comfort', 1800);
    $events = array_merge($events, clc_parse_ical_events($expediaIcal, 'expedia'));
  }
}

header('Content-Type: text/calendar; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Content-Disposition: inline; filename="calendar-' . $cabin . '.ics"');
echo clc_build_ical($events, 'Casa Los Curazaos · ' . $cfg['op']['cabin_names'][$cabin]);
