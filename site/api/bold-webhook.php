<?php
/* =====================================================================
   Bold webhook receiver
   ---------------------------------------------------------------------
   Bold envía un POST a esta URL cuando un pago se aprueba o rechaza.
   Configura la URL del webhook en tu panel Bold:
     https://[TU_DOMINIO]/api/bold-webhook.php

   Esto marca la reserva como "confirmed" cuando el pago entra,
   lo que a su vez hace que aparezca en /api/calendar.php (iCal que
   Airbnb importa) para que Airbnb la bloquee.
   ===================================================================== */

require __DIR__ . '/_lib.php';
$cfg = clc_load_config();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  exit('method not allowed');
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

/* Bold puede firmar el webhook con HMAC-SHA256.
   Si configuraste un secret en _config.php, verificamos. */
$ws = $cfg['bold']['webhook_secret'];
if ($ws && strpos($ws, '[') !== 0) {
  $sigHeader = $_SERVER['HTTP_X_BOLD_SIGNATURE'] ?? $_SERVER['HTTP_BOLD_SIGNATURE'] ?? '';
  if (!empty($sigHeader)) {
    $expected = hash_hmac('sha256', $raw, $ws);
    if (!hash_equals($expected, $sigHeader)) {
      clc_log("webhook firma inválida: $sigHeader vs $expected");
      http_response_code(401);
      exit('invalid signature');
    }
  }
}

if (!is_array($payload)) {
  clc_log('webhook payload no es JSON válido: ' . substr($raw, 0, 500));
  http_response_code(400);
  exit('bad payload');
}

/* Bold suele mandar:
   { type / subject: "SALE_APPROVED" | "SALE_REJECTED" | "VOID_APPROVED" | ...
     data: { metadata: { reference: orderId, ... }, payment_id: ..., status: ... } }
   La estructura puede variar; cubrimos varias posibilidades. */

$type = $payload['type'] ?? $payload['subject'] ?? '';
$dataNode = $payload['data'] ?? $payload['payload'] ?? [];

$orderId =
  $dataNode['metadata']['reference'] ??
  $dataNode['reference']            ??
  $dataNode['order_id']             ??
  $dataNode['payment_id']           ??
  null;

if (!$orderId) {
  clc_log('webhook sin orderId reconocible: ' . substr($raw, 0, 500));
  http_response_code(200);
  echo 'ok (no orderId, ignored)';
  exit;
}

$reservas = clc_load_reservations();
if (!isset($reservas[$orderId])) {
  clc_log("webhook orderId desconocido: $orderId · type=$type");
  http_response_code(200);
  echo 'ok (orderId not found, ignored)';
  exit;
}

$resv = $reservas[$orderId];

$typeUp = strtoupper($type);
if (strpos($typeUp, 'APPROVED') !== false || strpos($typeUp, 'SUCCESS') !== false) {
  $resv['status']      = 'confirmed';
  $resv['confirmedAt'] = date('c');
  $resv['boldEvent']   = $type;
  clc_log("RESERVA CONFIRMADA $orderId");
} elseif (strpos($typeUp, 'REJECT') !== false || strpos($typeUp, 'FAIL') !== false || strpos($typeUp, 'DECLIN') !== false) {
  $resv['status']      = 'rejected';
  $resv['rejectedAt']  = date('c');
  $resv['boldEvent']   = $type;
  clc_log("Reserva rechazada $orderId");
} elseif (strpos($typeUp, 'VOID') !== false || strpos($typeUp, 'REFUND') !== false || strpos($typeUp, 'CANCEL') !== false) {
  $resv['status']      = 'cancelled';
  $resv['cancelledAt'] = date('c');
  $resv['boldEvent']   = $type;
  clc_log("Reserva cancelada $orderId");
} else {
  $resv['boldEvent']   = $type;
  $resv['lastEventAt'] = date('c');
  clc_log("Evento sin estado $orderId · $type");
}

$reservas[$orderId] = $resv;
clc_save_reservations($reservas);

http_response_code(200);
echo 'ok';
