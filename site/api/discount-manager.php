<?php
/* Gestión de códigos de descuento — solo admin autenticado */
session_start();
require __DIR__ . '/_lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');

if (empty($_SESSION['clc_admin'])) {
  http_response_code(401);
  echo json_encode(['ok' => false, 'error' => 'No autorizado']);
  exit;
}

$path = __DIR__ . '/data/discount_codes.json';

function load_codes($path) {
  if (!file_exists($path)) return [];
  $d = json_decode(file_get_contents($path), true);
  return is_array($d) ? $d : [];
}
function save_codes($path, $codes) {
  file_put_contents($path, json_encode($codes, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  echo json_encode(['ok' => true, 'codes' => load_codes($path)]);
  exit;
}

$body = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $body['action'] ?? '';
$codes  = load_codes($path);

if ($action === 'toggle') {
  $code = strtoupper(trim($body['code'] ?? ''));
  if (!isset($codes[$code])) { echo json_encode(['ok' => false, 'error' => 'Código no encontrado']); exit; }
  $codes[$code]['active'] = !($codes[$code]['active'] ?? false);
  save_codes($path, $codes);
  echo json_encode(['ok' => true, 'active' => $codes[$code]['active']]);

} elseif ($action === 'save') {
  $code = strtoupper(preg_replace('/[^A-Z0-9\-]/', '', $body['code'] ?? ''));
  if (!$code) { echo json_encode(['ok' => false, 'error' => 'Código inválido']); exit; }
  $d = $body['data'] ?? [];
  $codes[$code] = [
    'type'       => in_array($d['type'] ?? '', ['pct','second_night','weekday_2x1']) ? $d['type'] : 'pct',
    'pct'        => isset($d['pct']) ? max(1, min(100, (int)$d['pct'])) : null,
    'active'     => (bool)($d['active'] ?? true),
    'from'       => $d['from']       ?? null,
    'until'      => $d['until']      ?? null,
    'requiresRef'=> (bool)($d['requiresRef'] ?? false),
    'refLabel'   => substr(trim($d['refLabel'] ?? ''), 0, 60) ?: null,
    'notes'      => substr(trim($d['notes']    ?? ''), 0, 120),
  ];
  if ($codes[$code]['type'] !== 'pct') unset($codes[$code]['pct']);
  if (!$codes[$code]['from'])  unset($codes[$code]['from']);
  if (!$codes[$code]['until']) unset($codes[$code]['until']);
  if (!$codes[$code]['refLabel']) unset($codes[$code]['refLabel']);
  save_codes($path, $codes);
  clc_log("discount-manager: save $code");
  echo json_encode(['ok' => true, 'code' => $code]);

} elseif ($action === 'delete') {
  $code = strtoupper(trim($body['code'] ?? ''));
  unset($codes[$code]);
  save_codes($path, $codes);
  clc_log("discount-manager: delete $code");
  echo json_encode(['ok' => true]);

} else {
  echo json_encode(['ok' => false, 'error' => 'Acción no reconocida']);
}
