<?php
/* =====================================================================
   Casa Los Curazaos — consulta de reserva por código de orden
   GET /api/reservation-lookup.php?orderId=CLC-XXXXXX
   ===================================================================== */

require __DIR__ . '/_lib.php';

header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, no-store, must-revalidate');

$orderId = isset($_GET['orderId']) ? trim($_GET['orderId']) : '';
if (!$orderId) {
  clc_json_response(['ok' => false, 'error' => 'orderId requerido'], 400);
}

$reservas = clc_load_reservations();
if (!isset($reservas[$orderId])) {
  clc_json_response(['ok' => false, 'error' => 'Reserva no encontrada'], 404);
}

$r = $reservas[$orderId];

// Las entradas de bloqueo admin no se exponen al cliente
if (($r['status'] ?? '') === 'blocked') {
  clc_json_response(['ok' => false, 'error' => 'Reserva no encontrada'], 404);
}

$cfg = clc_load_config();

$start = new DateTime($r['start']);
$today = new DateTime((new DateTime())->format('Y-m-d'));
$daysUntil = (int)$today->diff($start)->format('%r%a'); // negativo si ya pasó

clc_json_response([
  'ok' => true,
  'reservation' => [
    'orderId'        => $orderId,
    'status'         => $r['status'],
    'cabin'          => $r['cabin'],
    'cabinName'      => $cfg['op']['cabin_names'][$r['cabin']] ?? $r['cabin'],
    'start'          => $r['start'],
    'end'            => $r['end'],
    'nights'         => $r['nights'] ?? null,
    'adults'         => $r['adults'] ?? null,
    'children'       => $r['children'] ?? 0,
    'name'           => $r['name'] ?? '',
    'email'          => $r['email'] ?? '',
    'daysUntilCheckin' => $daysUntil,
  ],
]);
