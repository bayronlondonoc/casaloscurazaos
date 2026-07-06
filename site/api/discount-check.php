<?php
/* Validación pública de código de descuento.
   POST {code} → {ok, valid, requiresRef, refLabel, message}
   No expone el porcentaje ni datos internos. */
require __DIR__ . '/_lib.php';
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache');

$body = json_decode(file_get_contents('php://input'), true) ?? [];
$code = strtoupper(preg_replace('/[^A-Z0-9\-]/', '', $body['code'] ?? ''));

if (!$code) { clc_json_response(['ok' => false, 'valid' => false, 'message' => '']); }

$path  = __DIR__ . '/data/discount_codes.json';
$codes = file_exists($path) ? (json_decode(file_get_contents($path), true) ?? []) : [];

if (!isset($codes[$code])) {
  clc_json_response(['ok' => true, 'valid' => false, 'message' => '✗ Código no válido']);
}

$e     = $codes[$code];
$today = date('Y-m-d');
$active = $e['active'] ?? false;
$from   = $e['from']   ?? null;
$until  = $e['until']  ?? null;
$inDate = (!$from || $today >= $from) && (!$until || $today <= $until);

if (!$active || !$inDate) {
  clc_json_response(['ok' => true, 'valid' => false, 'message' => '✗ Código no disponible en este momento']);
}

$type = $e['type'] ?? 'pct';
$labels = [
  'pct'          => '✓ Código válido · descuento aplicado',
  'second_night' => '✓ 50% de descuento en tu segunda noche',
  'weekday_2x1'  => '✓ Segunda noche en semana gratis',
];

$pct = ($type === 'pct') ? (float)($e['pct'] ?? 0) : null;
$msg = $labels[$type] ?? '✓ Código válido';
if ($type === 'pct' && $pct) $msg = "✓ Código válido · {$pct}% de descuento";

clc_json_response([
  'ok'          => true,
  'valid'       => true,
  'type'        => $type,
  'pct'         => $pct,
  'requiresRef' => (bool)($e['requiresRef'] ?? false),
  'refLabel'    => $e['refLabel'] ?? 'Referencia',
  'message'     => $msg,
]);
