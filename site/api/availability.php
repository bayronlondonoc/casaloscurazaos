<?php
/* =====================================================================
   Casa Los Curazaos — disponibilidad consolidada
   ---------------------------------------------------------------------
   Devuelve las fechas ocupadas para una cabaña combinando:
     - iCal de Airbnb (lo que se reservó por Airbnb)
     - Reservas pending+confirmed desde nuestra web (pre-bloqueo)
     - Si la cabaña pedida es luxe/comfort/prestige, también bloquea
       las fechas de "casa-completa" (porque ocupa las 3).
   ===================================================================== */

require __DIR__ . '/_lib.php';
$cfg = clc_load_config();

header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

$cabin = isset($_GET['cabin']) ? preg_replace('/[^a-z0-9\-]/', '', $_GET['cabin']) : '';
if (!isset($cfg['op']['cabin_names'][$cabin])) {
  clc_json_response(['busy' => [], 'error' => 'cabaña inválida'], 400);
}

$busy = [];

/* 0) iCal de Expedia — solo Cabaña Comfort */
$urlExpedia = $cfg['expedia_ical']['comfort'] ?? '';
if ($cabin === 'comfort' && !empty($urlExpedia)) {
  $expediaIcal = clc_fetch_ical_cached($urlExpedia, 'expedia_comfort', 1800);
  if ($expediaIcal === false) clc_log("availability: Expedia iCal FAILED — $urlExpedia");
  $busy = array_merge($busy, clc_parse_ical_busy_days($expediaIcal));
}

/* 1) iCal de Airbnb — solo el calendario de la cabaña solicitada.
      Cada cabaña en Airbnb tiene su propia disponibilidad independiente.
      La sincronización cruzada (ej: cabaña individual ↔ casa-completa)
      la gestiona el propietario directamente en Airbnb.
      Las reservas hechas en nuestra web sí bloquean de forma cruzada (paso 4). */
$urlAirbnb = $cfg['airbnb_ical'][$cabin] ?? '';
$icalText  = clc_fetch_ical($urlAirbnb);
if ($icalText === false) clc_log("availability: iCal fetch FAILED for $cabin — $urlAirbnb");
$busy = array_merge($busy, clc_parse_ical_busy_days($icalText));

/* 4) Reservas internas (pending + confirmed) — pre-bloqueo */
$reservas = clc_load_reservations();
foreach ($reservas as $r) {
  if (!in_array($r['status'], ['pending','confirmed','blocked'])) continue;
  $blocksThisCabin = false;
  if ($r['cabin'] === $cabin) $blocksThisCabin = true;
  if ($cabin === 'casa-completa' && in_array($r['cabin'], ['luxe','comfort','prestige'])) $blocksThisCabin = true;
  if (in_array($cabin, ['luxe','comfort','prestige']) && $r['cabin'] === 'casa-completa') $blocksThisCabin = true;
  if (!$blocksThisCabin) continue;

  /* "pending" tiene TTL de 2h. "blocked" no expira: permanente hasta que el admin lo elimine. */
  if ($r['status'] === 'pending') {
    $age = time() - strtotime($r['createdAt']);
    if ($age > 2 * 3600) continue;
  }

  $start = DateTime::createFromFormat('Y-m-d', $r['start']);
  $end   = DateTime::createFromFormat('Y-m-d', $r['end']);
  if (!$start || !$end) continue;
  $cur = clone $start;
  while ($cur < $end) {
    $busy[] = $cur->format('Y-m-d');
    $cur->modify('+1 day');
  }
}

$busy = array_values(array_unique($busy));
sort($busy);

clc_json_response([
  'busy'       => $busy,
  'configured' => !empty($urlAirbnb) && strpos($urlAirbnb, '[') !== 0,
  'cabin'      => $cabin,
  'count'      => count($busy),
]);
