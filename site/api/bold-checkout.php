<?php
/* =====================================================================
   Bold checkout initiator
   ---------------------------------------------------------------------
   Recibe la reserva desde el frontend, RECALCULA el monto en servidor
   (no confía en el cliente), genera orderId + integrity signature y
   guarda la reserva como "pending" en data/reservas.json.

   Devuelve al frontend lo necesario para renderizar el botón Bold.
   ===================================================================== */

require __DIR__ . '/_lib.php';
$cfg = clc_load_config();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  clc_json_response(['ok' => false, 'error' => 'method not allowed'], 405);
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
  clc_json_response(['ok' => false, 'error' => 'invalid json'], 400);
}

$cabin    = isset($body['cabin'])    ? preg_replace('/[^a-z0-9\-]/', '', $body['cabin'])    : '';
$startYMD = isset($body['start'])    ? preg_replace('/[^0-9\-]/',    '', $body['start'])    : '';
$endYMD   = isset($body['end'])      ? preg_replace('/[^0-9\-]/',    '', $body['end'])      : '';
$adults   = isset($body['adults'])   ? max(1, (int)$body['adults'])   : 1;
$children = isset($body['children']) ? max(0, (int)$body['children']) : 0;
$pets     = !empty($body['pets']);
$name     = isset($body['name'])     ? substr(trim($body['name']),    0, 80)  : '';
$cedula   = isset($body['cedula'])   ? substr(preg_replace('/[^A-Za-z0-9]/', '', $body['cedula']), 0, 20) : '';
$email    = isset($body['email'])    ? substr(trim($body['email']),   0, 120) : '';
$phone    = isset($body['phone'])    ? substr(trim($body['phone']),   0, 40)  : '';
$message  = isset($body['message'])  ? substr(trim($body['message']), 0, 600) : '';
$discount = isset($body['discount']) ? preg_replace('/[^A-Za-z0-9]/', '', $body['discount']) : '';
$guests   = [];
if (!empty($body['guests']) && is_array($body['guests'])) {
  foreach (array_slice($body['guests'], 0, 6) as $g) {
    $guests[] = [
      'type'   => in_array($g['type'] ?? '', ['adult','child']) ? $g['type'] : 'adult',
      'name'   => substr(trim($g['name'] ?? ''), 0, 80),
      'cedula' => substr(preg_replace('/[^A-Za-z0-9]/', '', $g['cedula'] ?? ''), 0, 20),
      'email'  => substr(trim($g['email'] ?? ''), 0, 120),
    ];
  }
}

if (!isset($cfg['op']['cabin_names'][$cabin])) {
  clc_json_response(['ok' => false, 'error' => 'cabaña inválida'], 400);
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startYMD) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endYMD)) {
  clc_json_response(['ok' => false, 'error' => 'fechas inválidas'], 400);
}

/* Bloqueo anti-overbooking: rechazar si las fechas ya están ocupadas */
if (clc_has_conflict($cabin, $startYMD, $endYMD)) {
  clc_log("checkout BLOQUEADO por conflicto — $cabin $startYMD→$endYMD");
  clc_json_response([
    'ok'    => false,
    'error' => 'Las fechas seleccionadas ya no están disponibles. Por favor elige otras fechas.',
    'code'  => 'DATES_CONFLICT',
  ], 409);
}

$amount = clc_compute_amount($cabin, $startYMD, $endYMD, $discount);
if ($amount === null || $amount <= 0) {
  clc_json_response(['ok' => false, 'error' => 'no se pudo calcular el monto (tarifa no configurada)'], 400);
}

/* Validar llaves Bold */
$pk = $cfg['bold']['public_key'];
$sk = $cfg['bold']['secret_key'];
if (!$pk || !$sk || strpos($pk, '[') === 0 || strpos($sk, '[') === 0) {
  clc_json_response([
    'ok' => false,
    'error' => 'pasarela de pago no configurada todavía. Pega tus llaves Bold en api/_config.php.'
  ], 503);
}

$orderId  = clc_new_order_id();
$currency = $cfg['bold']['currency'];
$sig      = clc_bold_integrity_signature($orderId, $amount, $currency, $sk);

/* Guardar reserva pendiente */
$reservas = clc_load_reservations();
$reservas[$orderId] = [
  'orderId'  => $orderId,
  'status'   => 'pending',
  'cabin'    => $cabin,
  'cabinName'=> $cfg['op']['cabin_names'][$cabin],
  'start'    => $startYMD,
  'end'      => $endYMD,
  'nights'   => array_sum(clc_split_nights($startYMD, $endYMD)),
  'adults'   => $adults,
  'children' => $children,
  'pets'     => $pets,
  'name'     => $name,
  'cedula'   => $cedula,
  'email'    => $email,
  'phone'    => $phone,
  'message'  => $message,
  'discount' => $discount,
  'guests'   => $guests,
  'amount'   => (int)$amount,
  'currency' => $currency,
  'createdAt'=> date('c'),
];
clc_save_reservations($reservas);
clc_log("checkout init $orderId — $cabin $startYMD→$endYMD = $amount $currency");

clc_json_response([
  'ok'                 => true,
  'orderId'            => $orderId,
  'amount'             => (int)$amount,
  'currency'           => $currency,
  'publicKey'          => $pk,
  'integritySignature' => $sig,
  'description'        => "Reserva " . $cfg['op']['cabin_names'][$cabin] . " · $startYMD → $endYMD",
  'redirectionUrl'     => $cfg['bold']['redirect_url'],
]);
