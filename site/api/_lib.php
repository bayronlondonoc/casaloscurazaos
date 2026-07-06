<?php
/* Funciones compartidas entre endpoints. */

function clc_load_config() {
  static $cfg = null;
  if ($cfg === null) $cfg = require __DIR__ . '/_config.php';
  return $cfg;
}

function clc_json_response($data, $code = 200) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Access-Control-Allow-Origin: *');
  header('Cache-Control: no-cache, must-revalidate');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function clc_log($msg) {
  $cfg = clc_load_config();
  $path = $cfg['paths']['log'];
  $dir = dirname($path);
  if (!is_dir($dir)) @mkdir($dir, 0775, true);
  @file_put_contents($path,
    '[' . date('Y-m-d H:i:s') . "] " . (is_string($msg) ? $msg : json_encode($msg)) . "\n",
    FILE_APPEND);
}

/* Reservas: JSON simple {orderId: {...}} */
function clc_load_reservations() {
  $cfg = clc_load_config();
  $p = $cfg['paths']['reservas'];
  if (!file_exists($p)) return [];
  $raw = @file_get_contents($p);
  $arr = json_decode($raw, true);
  return is_array($arr) ? $arr : [];
}

function clc_save_reservations($arr) {
  $cfg = clc_load_config();
  $p = $cfg['paths']['reservas'];
  $dir = dirname($p);
  if (!is_dir($dir)) @mkdir($dir, 0775, true);
  $tmp = $p . '.tmp';
  file_put_contents($tmp, json_encode($arr, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
  @rename($tmp, $p);
}

/* === Cálculo de noches y festivos colombianos === */

/**
 * Calcula el Domingo de Pascua (algoritmo anónimo gregoriano).
 */
function clc_easter_sunday(int $year): DateTime {
  $a = $year % 19;
  $b = intdiv($year, 100);
  $c = $year % 100;
  $d = intdiv($b, 4);
  $e = $b % 4;
  $f = intdiv($b + 8, 25);
  $g = intdiv($b - $f + 1, 3);
  $h = (19 * $a + $b - $d - $g + 15) % 30;
  $i = intdiv($c, 4);
  $k = $c % 4;
  $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
  $m = intdiv($a + 11 * $h + 22 * $l, 451);
  $month = intdiv($h + $l - 7 * $m + 114, 31);
  $day   = (($h + $l - 7 * $m + 114) % 31) + 1;
  return new DateTime(sprintf('%04d-%02d-%02d', $year, $month, $day));
}

/**
 * Aplica Ley Emiliani: mueve la fecha al siguiente lunes si no es lunes.
 */
function clc_emiliani(DateTime $dt): void {
  $dow = (int)$dt->format('w'); // 0=dom..6=sáb
  if ($dow === 1) return;
  $days = ($dow === 0) ? 1 : (8 - $dow);
  $dt->modify("+{$days} days");
}

/**
 * Devuelve un Set (array asociativo) de fechas 'YYYY-MM-DD' que son festivos
 * en Colombia para el año indicado.
 */
function clc_colombia_holidays(int $year): array {
  static $cache = [];
  if (isset($cache[$year])) return $cache[$year];

  $h = [];
  $add = function(int $m, int $d) use ($year, &$h) {
    $h[sprintf('%04d-%02d-%02d', $year, $m, $d)] = true;
  };
  $addDt = function(DateTime $dt) use (&$h) {
    $h[$dt->format('Y-m-d')] = true;
  };

  // Festivos fijos
  $add(1,  1);  // Año Nuevo
  $add(5,  1);  // Día del Trabajo
  $add(7,  20); // Grito de Independencia
  $add(8,  7);  // Batalla de Boyacá
  $add(12, 8);  // Inmaculada Concepción
  $add(12, 25); // Navidad

  // Semana Santa (fijos respecto a Pascua)
  $easter = clc_easter_sunday($year);
  $juevesSanto = clone $easter; $juevesSanto->modify('-3 days'); $addDt($juevesSanto);
  $viernesSanto = clone $easter; $viernesSanto->modify('-2 days'); $addDt($viernesSanto);

  // Festivos de Pascua con Ley Emiliani
  $ascension    = clone $easter; $ascension->modify('+39 days');  clc_emiliani($ascension);    $addDt($ascension);
  $corpus       = clone $easter; $corpus->modify('+60 days');     clc_emiliani($corpus);        $addDt($corpus);
  $sagradoC     = clone $easter; $sagradoC->modify('+71 days');   clc_emiliani($sagradoC);      $addDt($sagradoC);

  // Festivos con Ley Emiliani (mes, día original)
  $emiliani = [[1,6],[3,19],[6,29],[8,15],[10,12],[11,1],[11,11]];
  foreach ($emiliani as [$m, $d]) {
    $dt = new DateTime(sprintf('%04d-%02d-%02d', $year, $m, $d));
    clc_emiliani($dt);
    $addDt($dt);
  }

  $cache[$year] = $h;
  return $h;
}

function clc_is_colombia_holiday(int $timestamp): bool {
  $year = (int)date('Y', $timestamp);
  $ymd  = date('Y-m-d', $timestamp);
  return isset(clc_colombia_holidays($year)[$ymd]);
}

/**
 * Una noche cobra tarifa de fin de semana si el AMANECER (día siguiente)
 * cae en sábado, domingo o festivo colombiano.
 *   Ej: noche del viernes → amanece sábado → finde ✓
 *       noche del domingo → amanece lunes (sin festivo) → semana ✓
 *       noche del domingo antes de festivo lunes → finde ✓
 */
function clc_is_weekend_night(int $timestamp): bool {
  $nextDay  = $timestamp + 86400;
  $dowNext  = (int)date('w', $nextDay); // 0=dom,6=sáb
  if ($dowNext === 6 || $dowNext === 0)         return true; // amanece sáb o dom
  if (clc_is_colombia_holiday($timestamp))      return true; // la noche misma es festivo
  if (clc_is_colombia_holiday($nextDay))        return true; // amanece en festivo
  return false;
}

function clc_is_high_season($timestamp) {
  $month = (int)date('m', $timestamp);
  $day   = (int)date('d', $timestamp);
  // Temporada alta: 20 de diciembre al 6 de enero
  if ($month === 12 && $day >= 20) return true;
  if ($month === 1  && $day <= 6)  return true;
  return false;
}

function clc_split_nights($startYMD, $endYMD) {
  $start = DateTime::createFromFormat('Y-m-d', $startYMD);
  $end   = DateTime::createFromFormat('Y-m-d', $endYMD);
  if (!$start || !$end || $end <= $start) return ['semana' => 0, 'finde' => 0, 'semanaSeason' => 0, 'findeSeason' => 0];
  $sem = 0; $fin = 0; $semSeason = 0; $finSeason = 0;
  $cur = clone $start;
  while ($cur < $end) {
    $ts = $cur->getTimestamp();
    $isWeekend = clc_is_weekend_night($ts);
    $isSeason = clc_is_high_season($ts);
    if ($isWeekend) {
      if ($isSeason) $finSeason++; else $fin++;
    } else {
      if ($isSeason) $semSeason++; else $sem++;
    }
    $cur->modify('+1 day');
  }
  return ['semana' => $sem, 'finde' => $fin, 'semanaSeason' => $semSeason, 'findeSeason' => $finSeason];
}

function clc_compute_amount($cabin, $startYMD, $endYMD, $discountCode = '') {
  $cfg = clc_load_config();
  if (!isset($cfg['tarifas'][$cabin])) return null;
  $t = $cfg['tarifas'][$cabin];
  if ($t['semana'] === null || $t['finde'] === null) return null;
  $n = clc_split_nights($startYMD, $endYMD);

  // Noches temporada alta: tarifa plana (campo 'temporada' en config)
  $highNights      = $n['semanaSeason'] + $n['findeSeason'];
  $rateTemporada   = $t['temporada'] ?? (int)round($t['finde'] * 1.30);
  $subtotal = $n['semana'] * $t['semana'] +
              $n['finde']  * $t['finde'] +
              $highNights  * $rateTemporada;

  // Auto-descuento por duración
  $total_nights = $n['semana'] + $n['finde'] + $n['semanaSeason'] + $n['findeSeason'];
  $auto_discount_pct = 0;
  if ($total_nights >= 7) {
    $auto_discount_pct = 15;
  } else if ($total_nights >= 4) {
    $auto_discount_pct = 10;
  }

  // Cargar códigos: primero JSON gestionado por admin, fallback a config
  $discountPath = __DIR__ . '/data/discount_codes.json';
  $allCodes = file_exists($discountPath)
    ? (json_decode(file_get_contents($discountPath), true) ?? [])
    : ($cfg['discount_codes'] ?? []);

  // Validar código de descuento
  $code_discount_pct    = 0;
  $special_discount_amt = 0;

  if (!empty($discountCode)) {
    $discountCode = strtoupper(trim($discountCode));
    if (isset($allCodes[$discountCode])) {
      $entry = $allCodes[$discountCode];

      $today  = date('Y-m-d');
      $active = isset($entry['active']) ? (bool)$entry['active'] : true;
      $type   = is_array($entry) ? ($entry['type'] ?? 'pct') : 'pct';
      $from   = is_array($entry) ? ($entry['from']  ?? null) : null;
      $until  = is_array($entry) ? ($entry['until'] ?? null) : null;
      $inDate = (!$from || $today >= $from) && (!$until || $today <= $until);

      if ($active && $inDate) {
        if ($type === 'pct') {
          $pct = is_array($entry) ? (float)($entry['pct'] ?? 0) : (float)$entry;
          $code_discount_pct = $pct;
        } elseif ($type === 'second_night' && $total_nights >= 2) {
          $special_discount_amt = (int)round(($subtotal / $total_nights) * 0.5);
        } elseif ($type === 'weekday_2x1' && $n['semana'] >= 2) {
          $special_discount_amt = (int)$t['semana'];
        }
      }
    }
  }

  // Comparar descuentos y usar el mayor (en pesos)
  $effective_discount_pct = max($auto_discount_pct, $code_discount_pct);
  $pct_discount_amount    = ($effective_discount_pct / 100) * $subtotal;
  $discount_amount        = max($pct_discount_amount, $special_discount_amt);
  $after_discount         = $subtotal - $discount_amount;

  // Agregar 5% de comisión Bold
  $bold_fee = $after_discount * 0.05;
  $final_amount = $after_discount + $bold_fee;

  // Bold exige mínimo $1.000 COP
  return (int)max(1000, round($final_amount));
}

/* === Bold === */
function clc_bold_integrity_signature($orderId, $amount, $currency, $secret) {
  return hash('sha256', $orderId . $amount . $currency . $secret);
}

function clc_new_order_id() {
  return 'CLC-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
}

/* === iCal export === */
function clc_to_ical_date($ymd) {
  return str_replace('-', '', $ymd);
}

function clc_build_ical($events, $calName) {
  $now = gmdate('Ymd\THis\Z');
  $lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Casa Los Curazaos//WebReservations//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' . $calName,
  ];
  foreach ($events as $ev) {
    $lines[] = 'BEGIN:VEVENT';
    $lines[] = 'UID:' . $ev['uid'];
    $lines[] = 'DTSTAMP:' . $now;
    $lines[] = 'DTSTART;VALUE=DATE:' . clc_to_ical_date($ev['start']);
    $lines[] = 'DTEND;VALUE=DATE:' . clc_to_ical_date($ev['end']);
    $lines[] = 'SUMMARY:' . (isset($ev['summary']) ? $ev['summary'] : 'Reservado (web)');
    if (!empty($ev['desc'])) $lines[] = 'DESCRIPTION:' . str_replace(["\r","\n"], [' ',' '], $ev['desc']);
    $lines[] = 'END:VEVENT';
  }
  $lines[] = 'END:VCALENDAR';
  return implode("\r\n", $lines) . "\r\n";
}

/* === iCal fetch con caché en disco (30 min por defecto) === */
function clc_fetch_ical_cached($url, $key, $ttl = 1800) {
  if (empty($url) || strpos($url, '[') === 0) return false;
  $cacheFile = __DIR__ . '/data/ical_' . preg_replace('/[^a-z0-9]/', '_', $key) . '.ics';
  if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < $ttl)) {
    return file_get_contents($cacheFile);
  }
  $content = clc_fetch_ical($url);
  if ($content) @file_put_contents($cacheFile, $content);
  return $content;
}

/* === Parsea iCal externo → array de eventos [{uid, start, end, summary}] === */
function clc_parse_ical_events($icalText, $source = 'ext') {
  $events = [];
  if (!$icalText) return $events;
  $icalText = preg_replace("/\r\n[ \t]/", '', $icalText);
  $icalText = preg_replace("/\n[ \t]/", '', $icalText);
  if (!preg_match_all('/BEGIN:VEVENT(.*?)END:VEVENT/s', $icalText, $m)) return $events;
  foreach ($m[1] as $block) {
    if (!preg_match('/DTSTART(?:;[^:]*)?:(\d{8})/', $block, $mS)) continue;
    if (!preg_match('/DTEND(?:;[^:]*)?:(\d{8})/',   $block, $mE)) continue;
    $fmt = fn($d) => substr($d,0,4).'-'.substr($d,4,2).'-'.substr($d,6,2);
    $events[] = [
      'uid'     => $source . '-' . md5($block) . '@casaloscurazaos',
      'start'   => $fmt($mS[1]),
      'end'     => $fmt($mE[1]),
      'summary' => 'Reservado (' . ucfirst($source) . ')',
    ];
  }
  return $events;
}

/* === Fetch iCal básico === */
function clc_fetch_ical($url) {
  if (empty($url) || strpos($url, '[') === 0) return false;
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_MAXREDIRS      => 5,
      CURLOPT_TIMEOUT        => 15,
      CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; CasaLosCurazaos-Sync/1.0)',
      CURLOPT_SSL_VERIFYPEER => false,   // algunos servidores iCal no validan bien
      CURLOPT_SSL_VERIFYHOST => false,
      CURLOPT_HTTPHEADER     => ['Accept: text/calendar, */*'],
    ]);
    $r    = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($r === false || $code >= 400) {
      clc_log("clc_fetch_ical FAILED url=$url http=$code curl_err=$err");
      return false;
    }
    return $r;
  }
  $ctx = stream_context_create(['http' => ['timeout' => 15, 'user_agent' => 'Mozilla/5.0 (compatible; CasaLosCurazaos-Sync/1.0)', 'ignore_errors' => true]]);
  return @file_get_contents($url, false, $ctx);
}

function clc_parse_ical_busy_days($icalText) {
  $busy = [];
  if (!$icalText) return $busy;
  // Unfold iCal lines: CRLF+space, LF+space (algunos servidores usan solo LF)
  $icalText = preg_replace("/\r\n[ \t]/", '', $icalText);
  $icalText = preg_replace("/\n[ \t]/", '', $icalText);
  if (preg_match_all('/BEGIN:VEVENT(.*?)END:VEVENT/s', $icalText, $events)) {
    foreach ($events[1] as $block) {
      if (!preg_match('/DTSTART(?:;[^:]*)?:(\d{8})/', $block, $mStart)) continue;
      if (!preg_match('/DTEND(?:;[^:]*)?:(\d{8})/',   $block, $mEnd))   continue;
      $start = DateTime::createFromFormat('Ymd', $mStart[1]);
      $end   = DateTime::createFromFormat('Ymd', $mEnd[1]);
      if (!$start || !$end) continue;
      $cur = clone $start;
      while ($cur < $end) {
        $busy[] = $cur->format('Y-m-d');
        $cur->modify('+1 day');
      }
    }
  }
  return array_values(array_unique($busy));
}

/* === Verificación de conflictos de fechas =============================== */
/**
 * Devuelve true si la combinación cabin+fechas ya está ocupada en reservas internas.
 * Bloquea: confirmed + pending dentro del TTL de 6h.
 * Ignora reservas expiradas, rechazadas o canceladas.
 */
function clc_has_conflict($cabin, $startYMD, $endYMD, $excludeOrderId = null) {
  $reservas = clc_load_reservations();
  $reqStart = DateTime::createFromFormat('Y-m-d', $startYMD);
  $reqEnd   = DateTime::createFromFormat('Y-m-d', $endYMD);
  if (!$reqStart || !$reqEnd || $reqEnd <= $reqStart) return false;

  foreach ($reservas as $orderId => $r) {
    if ($excludeOrderId && $orderId === $excludeOrderId) continue;
    if (!in_array($r['status'], ['pending','confirmed'])) continue;

    // Pending con más de 6h se ignoran (pago abandonado)
    if ($r['status'] === 'pending') {
      $age = time() - strtotime($r['createdAt']);
      if ($age > 2 * 3600) continue;
    }

    // ¿Bloquea esta cabaña?
    $blocks = false;
    if ($r['cabin'] === $cabin) $blocks = true;
    if ($cabin === 'casa-completa' && in_array($r['cabin'], ['luxe','comfort','prestige'])) $blocks = true;
    if (in_array($cabin, ['luxe','comfort','prestige']) && $r['cabin'] === 'casa-completa') $blocks = true;
    if (!$blocks) continue;

    // Solapamiento: si los rangos se intersectan
    $rStart = DateTime::createFromFormat('Y-m-d', $r['start']);
    $rEnd   = DateTime::createFromFormat('Y-m-d', $r['end']);
    if (!$rStart || !$rEnd) continue;

    // Dos rangos [A,B) y [C,D) se solapan si A < D && C < B
    if ($reqStart < $rEnd && $rStart < $reqEnd) return true;
  }

  // Verificar Expedia (solo Comfort)
  if ($cabin === 'comfort') {
    $cfg = clc_load_config();
    $urlExpedia = $cfg['expedia_ical']['comfort'] ?? '';
    if (!empty($urlExpedia)) {
      $expediaIcal = clc_fetch_ical_cached($urlExpedia, 'expedia_comfort', 1800);
      $expediaBusy = array_flip(clc_parse_ical_busy_days($expediaIcal));
      $cur = clone $reqStart;
      while ($cur < $reqEnd) {
        if (isset($expediaBusy[$cur->format('Y-m-d')])) return true;
        $cur->modify('+1 day');
      }
    }
  }

  return false;
}

/* =====================================================================
   Email de confirmación
   --------------------------------------------------------------------- */
function clc_send_booking_email(array $r): void {
  if (!empty($r['emailSent'])) return;

  $name     = htmlspecialchars($r['name']     ?? 'Huésped', ENT_QUOTES);
  $cabin    = htmlspecialchars($r['cabinName'] ?? ($r['cabin'] ?? ''), ENT_QUOTES);
  $start    = $r['start']   ?? '';
  $end      = $r['end']     ?? '';
  $adults   = $r['adults']  ?? '';
  $orderId  = $r['orderId'] ?? '';
  $amount   = isset($r['amount']) ? '$ ' . number_format((int)$r['amount'], 0, ',', '.') . ' COP' : '—';
  $guest       = $r['email']       ?? '';
  $cedula      = $r['cedula']      ?? '';
  $phone       = $r['phone']       ?? '';
  $discCode    = $r['discount']    ?? '';
  $discRef     = $r['discountRef'] ?? '';
  $discAmt     = isset($r['discountAmount']) ? '$ ' . number_format((int)$r['discountAmount'], 0, ',', '.') . ' COP' : null;

  // Calcular noches desde las fechas si no viene el campo
  $nights = $r['nights'] ?? '';
  if (empty($nights) && $start && $end) {
    $s = DateTime::createFromFormat('Y-m-d', $start);
    $e = DateTime::createFromFormat('Y-m-d', $end);
    if ($s && $e) $nights = $s->diff($e)->days;
  }
  $nightsLabel = $nights ? $nights . ' noche' . ($nights != 1 ? 's' : '') : '—';

  $from    = 'marlonehotel@gmail.com';
  $subject = "=?UTF-8?B?" . base64_encode("Reserva confirmada — Casa Los Curazaos · $orderId") . "?=";

  /* ── Plantilla HTML para el huésped ─────────────────────────── */
  $html = <<<HTML
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tu reserva está confirmada</title>
</head>
<body style="margin:0;padding:0;background:#f0ebe0;font-family:Georgia,'Times New Roman',serif;color:#2a231a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ebe0;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

  <!-- Header -->
  <tr><td style="background:#2a231a;border-radius:12px 12px 0 0;padding:36px 40px;text-align:center;">
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:4px;color:rgba(255,255,255,.45);text-transform:uppercase;">Casa Los Curazaos · Llanogrande</p>
    <p style="margin:16px 0 0;font-size:30px;color:#ffffff;font-weight:400;font-style:italic;line-height:1.2;">Tu reserva quedó<br>confirmada ✓</p>
  </td></tr>

  <!-- Dates bar -->
  <tr><td style="background:#b6603a;padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:18px 24px;text-align:center;border-right:1px solid rgba(255,255,255,.2);">
        <p style="margin:0 0 3px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:2px;color:rgba(255,255,255,.65);text-transform:uppercase;">Check-in</p>
        <p style="margin:0;font-size:17px;color:#fff;font-weight:600;font-family:Arial,sans-serif;">$start</p>
        <p style="margin:3px 0 0;font-size:11px;color:rgba(255,255,255,.7);font-family:Arial,sans-serif;">4:00 p.&nbsp;m.</p>
      </td>
      <td style="padding:18px 12px;text-align:center;color:rgba(255,255,255,.5);font-size:20px;">→</td>
      <td style="padding:18px 24px;text-align:center;border-left:1px solid rgba(255,255,255,.2);">
        <p style="margin:0 0 3px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:2px;color:rgba(255,255,255,.65);text-transform:uppercase;">Check-out</p>
        <p style="margin:0;font-size:17px;color:#fff;font-weight:600;font-family:Arial,sans-serif;">$end</p>
        <p style="margin:3px 0 0;font-size:11px;color:rgba(255,255,255,.7);font-family:Arial,sans-serif;">11:00 a.&nbsp;m.</p>
      </td>
    </tr>
    </table>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#fff;padding:32px 40px;">
    <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Hola, <strong>$name</strong> — 👋</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#5a4f47;">Tu estadía en <strong style="color:#2a231a;">$cabin</strong> está confirmada. A continuación el resumen completo:</p>

    <!-- Details -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e0d4;border-radius:8px;font-size:14px;margin-bottom:24px;overflow:hidden;">
      <tr style="background:#f9f5ef;">
        <td colspan="2" style="padding:10px 16px;border-bottom:1px solid #e8e0d4;">
          <span style="font-family:Arial,sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#a09080;">Resumen de la reserva</span>
        </td>
      </tr>
      <tr style="border-bottom:1px solid #e8e0d4;">
        <td style="padding:11px 16px;color:#7a6e63;width:40%;">Cabaña</td>
        <td style="padding:11px 16px;font-weight:600;">$cabin</td>
      </tr>
      <tr style="background:#fdf6f2;border-bottom:1px solid #e8e0d4;">
        <td style="padding:11px 16px;color:#7a6e63;">Código de Confirmación</td>
        <td style="padding:11px 16px;font-family:monospace;font-weight:700;font-size:16px;color:#b6603a;letter-spacing:.06em;">$orderId</td>
      </tr>
      <tr style="border-bottom:1px solid #e8e0d4;">
        <td style="padding:11px 16px;color:#7a6e63;">Huéspedes</td>
        <td style="padding:11px 16px;">$adults adultos</td>
      </tr>
      <tr style="border-bottom:1px solid #e8e0d4;">
        <td style="padding:11px 16px;color:#7a6e63;">Noches</td>
        <td style="padding:11px 16px;">$nightsLabel</td>
      </tr>
      <tr style="background:#fdf9f5;">
        <td style="padding:14px 16px;color:#5a4f47;font-weight:600;">Total pagado</td>
        <td style="padding:14px 16px;font-size:20px;font-weight:700;color:#b6603a;">$amount</td>
      </tr>
    </table>

    <!-- Welcome -->
    <div style="background:#f9f5ef;border-left:3px solid #b6603a;border-radius:0 6px 6px 0;padding:16px 18px;margin-bottom:24px;font-size:13px;line-height:1.75;color:#5a4f47;">
      <p style="margin:0 0 10px;">🏡 <strong style="color:#2a231a;">¡Bienvenido a Casa Los Curazaos!</strong><br>
      Esperamos que disfrutes una estadía tranquila, rodeada de naturaleza y en completo silencio.</p>
      <p style="margin:0 0 10px;">📲 <strong>Avísanos al menos 1 hora antes de tu llegada</strong> para coordinar el ingreso y asegurarnos de que el portón esté abierto.</p>
      <p style="margin:0;">📌 Recibirás todos los detalles (ubicación, Wi-Fi, jacuzzi) por WhatsApp. ¡Estamos felices de recibirte! 🌿</p>
    </div>

    <p style="margin:0;font-size:11px;color:#c0b8b0;font-family:Arial,sans-serif;">Este email es la confirmación de tu reserva. Guárdalo como comprobante.</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#2a231a;border-radius:0 0 12px 12px;padding:22px 40px;text-align:center;">
    <p style="margin:0 0 6px;font-size:13px;color:rgba(255,255,255,.65);">Casa Los Curazaos · Llanogrande, Rionegro, Antioquia</p>
    <p style="margin:0;font-size:12px;font-family:Arial,sans-serif;">
      <a href="https://casaloscurazaos.com" style="color:#c17b4f;text-decoration:none;">casaloscurazaos.com</a>
      &nbsp;&middot;&nbsp;
      <a href="https://instagram.com/casaloscurazaos" style="color:#c17b4f;text-decoration:none;">@casaloscurazaos</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>
HTML;

  $htmlHeaders  = "MIME-Version: 1.0\r\n";
  $htmlHeaders .= "Content-Type: text/html; charset=UTF-8\r\n";
  $htmlHeaders .= "From: Casa Los Curazaos <{$from}>\r\n";
  $htmlHeaders .= "Reply-To: {$from}\r\n";

  if ($guest) {
    @mail($guest, $subject, $html, $htmlHeaders);
  }

  /* ── Enviar confirmación a huéspedes acompañantes con email ─── */
  if (!empty($r['guests']) && is_array($r['guests'])) {
    foreach ($r['guests'] as $companion) {
      $cEmail = trim($companion['email'] ?? '');
      if (empty($cEmail) || $cEmail === $guest) continue;
      $cName = htmlspecialchars($companion['name'] ?? 'Huésped', ENT_QUOTES);
      // Personalizar saludo para el acompañante
      $compHtml = str_replace(
        'Hola, <strong>' . $name . '</strong>',
        'Hola, <strong>' . $cName . '</strong>',
        $html
      );
      @mail($cEmail, $subject, $compHtml, $htmlHeaders);
    }
  }

  /* ── Notificación al propietario (HTML) ──────────────────────── */
  $ownerSubj = "=?UTF-8?B?" . base64_encode("Nueva reserva — $cabin · $start → $end") . "?=";
  $ownerHtml = <<<OWNER
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Nueva reserva</title></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #ddd;">
  <tr><td style="background:#b6603a;padding:20px 24px;">
    <p style="margin:0;color:#fff;font-size:15px;font-weight:bold;">🏡 Nueva reserva — Casa Los Curazaos</p>
  </td></tr>
  <tr><td style="background:#fff;padding:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.8;color:#333;">
      <tr><td style="color:#888;padding:5px 0;width:40%;">Cabaña</td><td style="font-weight:bold;padding:5px 0;">$cabin</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Huésped</td><td style="padding:5px 0;">$name</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Cédula</td><td style="padding:5px 0;">$cedula</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Email</td><td style="padding:5px 0;">$guest</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Teléfono</td><td style="padding:5px 0;">$phone</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Check-in</td><td style="padding:5px 0;">$start · 4:00 p. m.</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Check-out</td><td style="padding:5px 0;">$end · 11:00 a. m.</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Noches</td><td style="padding:5px 0;">$nightsLabel</td></tr>
      <tr><td colspan="2" style="padding-top:16px;border-top:1px solid #eee;"></td></tr>
      <tr><td style="color:#555;font-weight:bold;padding:5px 0;">Total</td><td style="padding:5px 0;font-size:20px;font-weight:bold;color:#b6603a;">$amount</td></tr>
      <tr><td colspan="2" style="padding-top:12px;font-size:13px;font-weight:700;color:#b6603a;font-family:monospace;">Código: $orderId</td></tr>
    </table>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
OWNER;

  @mail('marlonehotel@gmail.com', $ownerSubj, $ownerHtml,
    "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nFrom: Casa Los Curazaos <{$from}>\r\n");
}
