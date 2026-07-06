<?php
/* =====================================================================
   Confirmación de reserva vía redirect de Bold
   ---------------------------------------------------------------------
   Bold redirige a gracias.html?reference=CLC-xxx&status=approved...
   gracias.html llama a este endpoint para confirmar la reserva
   sin esperar el webhook.

   No reemplaza al webhook — es un fallback por si Bold no lo envía.
   ===================================================================== */

require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  clc_json_response(['ok' => false, 'error' => 'method not allowed'], 405);
}

$body = json_decode(file_get_contents('php://input'), true);
$orderId = isset($body['orderId']) ? preg_replace('/[^A-Z0-9\-]/', '', strtoupper($body['orderId'])) : '';
$status  = isset($body['status'])  ? strtolower(trim($body['status']))  : '';

if (!$orderId) {
  clc_json_response(['ok' => false, 'error' => 'orderId requerido'], 400);
}

$reservas = clc_load_reservations();
if (!isset($reservas[$orderId])) {
  clc_json_response(['ok' => false, 'error' => 'orden no encontrada'], 404);
}

$r = $reservas[$orderId];

// Solo procesar si está pending (evitar sobreescribir un estado ya establecido por webhook)
if ($r['status'] !== 'pending') {
  clc_json_response(['ok' => true, 'status' => $r['status'], 'msg' => 'ya procesada']);
}

if (strpos($status, 'approved') !== false || strpos($status, 'success') !== false || strpos($status, 'approved') !== false) {
  $r['status']      = 'confirmed';
  $r['confirmedAt'] = date('c');
  $r['confirmedVia']= 'redirect';
  clc_log("RESERVA CONFIRMADA vía redirect — $orderId");
} elseif (strpos($status, 'reject') !== false || strpos($status, 'fail') !== false || strpos($status, 'declin') !== false) {
  $r['status']      = 'rejected';
  $r['rejectedAt']  = date('c');
  $r['rejectedVia'] = 'redirect';
  clc_log("Reserva rechazada vía redirect — $orderId");
} else {
  // Estado desconocido: marcar confirmed de todas formas si viene de la página de gracias
  // (el usuario llegó ahí, lo que normalmente significa que Bold aprobó el pago)
  $r['status']      = 'confirmed';
  $r['confirmedAt'] = date('c');
  $r['confirmedVia']= 'redirect-fallback';
  clc_log("RESERVA CONFIRMADA vía redirect (fallback, status=$status) — $orderId");
}

// Enviar email de confirmación (solo una vez)
if ($r['status'] === 'confirmed' && empty($r['emailSent'])) {
  clc_send_booking_email($r);
  $r['emailSent'] = true;
}

$reservas[$orderId] = $r;
clc_save_reservations($reservas);

clc_json_response(['ok' => true, 'orderId' => $orderId, 'status' => $r['status']]);
