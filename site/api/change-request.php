<?php
/* =====================================================================
   Casa Los Curazaos — Solicitud de cambio de fecha
   ---------------------------------------------------------------------
   Recibe: { orderId, newStart, newEnd, message }
   Envia email al propietario y responde { ok: true }
   ===================================================================== */

require __DIR__ . '/_lib.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  clc_json_response(['ok' => false, 'error' => 'metodo no permitido'], 405);
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) clc_json_response(['ok' => false, 'error' => 'JSON invalido'], 400);

$orderId  = preg_replace('/[^A-Za-z0-9\-]/', '', $body['orderId']  ?? '');
$newStart = preg_replace('/[^0-9\-]/',        '', $body['newStart'] ?? '');
$newEnd   = preg_replace('/[^0-9\-]/',        '', $body['newEnd']   ?? '');
$message  = substr(trim($body['message'] ?? ''), 0, 600);

if (!$orderId || !$newStart || !$newEnd) {
  clc_json_response(['ok' => false, 'error' => 'Datos incompletos.'], 400);
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $newStart) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $newEnd)) {
  clc_json_response(['ok' => false, 'error' => 'Fechas invalidas.'], 400);
}
if ($newStart >= $newEnd) {
  clc_json_response(['ok' => false, 'error' => 'La fecha de salida debe ser posterior a la de llegada.'], 400);
}

$reservas = clc_load_reservations();
if (!isset($reservas[$orderId])) {
  clc_json_response(['ok' => false, 'error' => 'Reserva no encontrada.'], 404);
}
$r = $reservas[$orderId];

if (!in_array($r['status'] ?? '', ['confirmed', 'pending'])) {
  clc_json_response(['ok' => false, 'error' => 'Esta reserva no permite cambios.'], 400);
}

$s = DateTime::createFromFormat('Y-m-d', $newStart);
$e = DateTime::createFromFormat('Y-m-d', $newEnd);
$newNights = ($s && $e) ? $s->diff($e)->days : '?';

$rName  = htmlspecialchars($r['name']     ?? '', ENT_QUOTES);
$rCabin = htmlspecialchars($r['cabinName'] ?? ($r['cabin'] ?? ''), ENT_QUOTES);
$rPhone = htmlspecialchars($r['phone']    ?? '', ENT_QUOTES);
$rEmail = $r['email'] ?? '';
$rStart = $r['start'] ?? '';
$rEnd   = $r['end']   ?? '';

$msgNote = '';
if (!empty($message)) {
  $msgNote = '<p style="margin:16px 0 0;padding:12px 14px;background:#f9f5ef;border-left:3px solid #b6603a;border-radius:0 6px 6px 0;font-size:13px;color:#5a4f47;font-style:italic;">'
           . '"' . htmlspecialchars($message, ENT_QUOTES) . '"</p>';
}

$from    = 'marlonehotel@gmail.com';
$subject = "=?UTF-8?B?" . base64_encode("SOLICITUD CAMBIO DE FECHA -- Reserva $orderId") . "?=";

$html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>'
  . '<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">'
  . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;">'
  . '<tr><td align="center" style="padding:24px 16px;">'
  . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #ddd;">'
  . '<tr><td style="background:#b6603a;padding:20px 24px;">'
  . '<p style="margin:0;color:#fff;font-size:16px;font-weight:bold;">Solicitud de cambio de fecha</p>'
  . '<p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:12px;">Casa Los Curazaos &middot; Reserva Web</p>'
  . '</td></tr>'
  . '<tr><td style="padding:24px;">'
  . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.9;color:#333;">'
  . '<tr><td style="color:#888;width:44%;padding:4px 0;">Codigo de reserva</td>'
  . '<td style="font-weight:bold;color:#b6603a;font-family:monospace;padding:4px 0;">' . $orderId . '</td></tr>'
  . '<tr><td style="color:#888;padding:4px 0;">Cabana</td><td style="font-weight:bold;padding:4px 0;">' . $rCabin . '</td></tr>'
  . '<tr><td style="color:#888;padding:4px 0;">Huesped</td><td style="padding:4px 0;">' . $rName . '</td></tr>'
  . '<tr><td style="color:#888;padding:4px 0;">Telefono</td><td style="padding:4px 0;">' . $rPhone . '</td></tr>'
  . '<tr><td style="color:#888;padding:4px 0;">Email</td><td style="padding:4px 0;">' . htmlspecialchars($rEmail) . '</td></tr>'
  . '<tr><td colspan="2" style="padding:14px 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;">Fechas actuales</td></tr>'
  . '<tr><td style="color:#888;padding:3px 0;">Check-in</td><td style="padding:3px 0;">' . $rStart . '</td></tr>'
  . '<tr><td style="color:#888;padding:3px 0;">Check-out</td><td style="padding:3px 0;">' . $rEnd . '</td></tr>'
  . '<tr><td colspan="2" style="padding:14px 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#2e7d32;">Nuevas fechas solicitadas</td></tr>'
  . '<tr><td style="color:#888;padding:3px 0;">Nuevo check-in</td><td style="font-weight:bold;color:#2e7d32;padding:3px 0;">' . $newStart . '</td></tr>'
  . '<tr><td style="color:#888;padding:3px 0;">Nuevo check-out</td><td style="font-weight:bold;color:#2e7d32;padding:3px 0;">' . $newEnd . '</td></tr>'
  . '<tr><td style="color:#888;padding:3px 0 12px;">Noches</td><td style="padding:3px 0 12px;">' . $newNights . '</td></tr>'
  . '</table>'
  . $msgNote
  . '<div style="margin-top:20px;padding:14px 16px;background:#fff8f0;border-radius:6px;font-size:13px;color:#555;line-height:1.6;">'
  . '<strong>Accion requerida:</strong> Verifica disponibilidad y responde al huesped por WhatsApp o email confirmando o rechazando el cambio.'
  . '</div>'
  . '</td></tr>'
  . '<tr><td style="background:#1f1b16;padding:14px 24px;text-align:center;">'
  . '<p style="margin:0;color:rgba(255,255,255,.5);font-size:11px;">Casa Los Curazaos &middot; casaloscurazaos.com</p>'
  . '</td></tr>'
  . '</table></td></tr></table></body></html>';

$headers  = "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/html; charset=UTF-8\r\n";
$headers .= "From: Casa Los Curazaos Web <marlonehotel@gmail.com>\r\n";
if (!empty($rEmail)) $headers .= "Reply-To: $rEmail\r\n";

$sent = @mail($from, $subject, $html, $headers);
clc_log("change-request $orderId -> $newStart/$newEnd sent=" . ($sent ? 'ok' : 'fail'));

clc_json_response([
  'ok'      => true,
  'message' => 'Te contactaremos por WhatsApp o email para confirmar el cambio en las proximas horas.',
]);
