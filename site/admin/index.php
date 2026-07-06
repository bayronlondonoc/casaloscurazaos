<?php
/* =====================================================================
   Casa Los Curazaos — Panel de administración
   /admin/index.php
   - Login con sesión PHP
   - Tab "Reservas": tabla de todas las reservas web
   - Tab "Calendario": bloquear/liberar fechas por cabaña
   ===================================================================== */

session_start();
require __DIR__ . '/../api/_lib.php';
$cfg = clc_load_config();
$adminPwd = $cfg['admin']['password'] ?? 'CLC2026!';

/* ── Logout ─────────────────────────────────────────────────── */
if (isset($_GET['logout'])) {
  session_destroy();
  header('Location: index.php');
  exit;
}

/* ── Login POST ─────────────────────────────────────────────── */
$loginError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
  if ($_POST['password'] === $adminPwd) {
    $_SESSION['clc_admin'] = true;
    header('Location: index.php' . (isset($_GET['tab']) ? '?tab=' . $_GET['tab'] : ''));
    exit;
  }
  $loginError = 'Contraseña incorrecta.';
}

$authed = !empty($_SESSION['clc_admin']);

/* ── Acciones admin (solo autenticado) ─────────────────────── */
$actionMsg = '';
if ($authed && $_SERVER['REQUEST_METHOD'] === 'POST') {

  /* Crear bloqueo */
  if (isset($_POST['action']) && $_POST['action'] === 'block') {
    $cabin    = preg_replace('/[^a-z0-9\-]/', '', $_POST['cabin'] ?? '');
    $bStart   = trim($_POST['block_start'] ?? '');
    $bEnd     = trim($_POST['block_end']   ?? '');
    $notes    = trim($_POST['notes']       ?? '');
    $cabins   = $cabin === 'todas'
      ? ['luxe','comfort','prestige','casa-completa']
      : [$cabin];

    if ($bStart && $bEnd && $bStart < $bEnd) {
      $reservas = clc_load_reservations();
      foreach ($cabins as $c) {
        $id = 'BLK-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
        $reservas[$id] = [
          'orderId'   => $id,
          'status'    => 'blocked',
          'cabin'     => $c,
          'start'     => $bStart,
          'end'       => $bEnd,
          'notes'     => $notes,
          'createdAt' => date('c'),
        ];
      }
      clc_save_reservations($reservas);
      $actionMsg = '✓ Fechas bloqueadas correctamente.';
    } else {
      $actionMsg = '✗ Revisa el rango de fechas.';
    }
  }

  /* Eliminar entrada */
  if (isset($_POST['action']) && $_POST['action'] === 'delete') {
    $delId = trim($_POST['del_id'] ?? '');
    if ($delId) {
      $reservas = clc_load_reservations();
      if (isset($reservas[$delId])) {
        unset($reservas[$delId]);
        clc_save_reservations($reservas);
        $actionMsg = '✓ Entrada eliminada.';
      }
    }
  }
}

$activeTab = $_GET['tab'] ?? 'calendario';
$reservas  = $authed ? clc_load_reservations() : [];

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtDate($ymd) {
  if (!$ymd) return '—';
  $d = DateTime::createFromFormat('Y-m-d', $ymd);
  return $d ? $d->format('d/m/Y') : $ymd;
}
function statusLabel($s) {
  $map = ['confirmed'=>'Confirmada','pending'=>'Pendiente','blocked'=>'Bloqueado (admin)','cancelled'=>'Cancelada'];
  return $map[$s] ?? $s;
}
function statusColor($s) {
  $map = ['confirmed'=>'#2e7d32','pending'=>'#b45309','blocked'=>'#5c4a1e','cancelled'=>'#999'];
  return $map[$s] ?? '#333';
}

/* ── Ordenar reservas: más recientes primero ─────────────────── */
uasort($reservas, function($a,$b) {
  return strcmp($b['createdAt'] ?? '', $a['createdAt'] ?? '');
});

$cabinNames = $cfg['op']['cabin_names'] ?? [];
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Admin — Casa Los Curazaos</title>
<meta name="robots" content="noindex, nofollow" />
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Inter, -apple-system, sans-serif; background: #f3ece0; color: #1f1b16; min-height: 100vh; }
a { color: #b6603a; }

/* ── Header ── */
.adm-header { background: #1f1b16; color: #f3ece0; padding: .9rem 1.5rem; display: flex; align-items: center; justify-content: space-between; }
.adm-brand { font-family: Georgia, serif; font-size: 1.1rem; letter-spacing: .03em; }
.adm-brand span { color: #b6603a; }
.adm-logout { font-size: .8rem; color: #c69566; text-decoration: none; padding: .4rem .8rem; border: 1px solid #c69566; border-radius: 4px; }
.adm-logout:hover { background: #c69566; color: #1f1b16; }

/* ── Login ── */
.login-wrap { max-width: 380px; margin: 6rem auto; background: #fff; border-radius: 12px; padding: 2.5rem; box-shadow: 0 2px 20px rgba(0,0,0,.1); }
.login-wrap h1 { font-size: 1.4rem; font-weight: 600; margin-bottom: 1.5rem; }
.field { margin-bottom: 1rem; }
.field label { display: block; font-size: .8rem; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: #6e6356; margin-bottom: .35rem; }
.field input, .field select, .field textarea { width: 100%; padding: .65rem .85rem; border: 1px solid #ddd; border-radius: 6px; font-size: .95rem; background: #fbf7ef; }
.field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: #b6603a; }
.btn { display: inline-block; padding: .7rem 1.5rem; border-radius: 6px; font-size: .9rem; font-weight: 600; cursor: pointer; border: none; transition: opacity .15s; }
.btn:hover { opacity: .85; }
.btn-primary { background: #b6603a; color: #fff; }
.btn-danger  { background: #c62828; color: #fff; font-size: .8rem; padding: .35rem .75rem; }
.btn-ghost   { background: transparent; border: 1px solid #b6603a; color: #b6603a; }
.error-msg   { color: #c62828; font-size: .85rem; margin-top: .5rem; }
.ok-msg      { color: #2e7d32; font-size: .85rem; margin-bottom: 1rem; font-weight: 600; }

/* ── Tabs ── */
.adm-tabs { display: flex; border-bottom: 2px solid #e0d5c7; background: #fff; padding: 0 1.5rem; }
.adm-tab  { padding: .85rem 1.25rem; font-size: .9rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; color: #6e6356; text-decoration: none; }
.adm-tab.active { border-bottom-color: #b6603a; color: #b6603a; }

/* ── Content ── */
.adm-content { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }

/* ── Block form ── */
.block-form { background: #fff; border-radius: 10px; padding: 1.5rem; margin-bottom: 2rem; border: 1px solid #e0d5c7; }
.block-form h2 { font-size: 1.05rem; font-weight: 700; margin-bottom: 1.25rem; }
.form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }

/* ── Tables ── */
.adm-table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; border: 1px solid #e0d5c7; font-size: .85rem; }
th { background: #1f1b16; color: #f3ece0; padding: .7rem 1rem; text-align: left; font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; }
td { padding: .7rem 1rem; border-bottom: 1px solid #f0e8db; vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #fbf7ef; }
.status-pill { display: inline-block; padding: .2rem .55rem; border-radius: 20px; font-size: .72rem; font-weight: 700; color: #fff; }
.notes-cell { color: #6e6356; font-size: .8rem; max-width: 160px; }

/* ── Stats ── */
.stats-row { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.stat-card { background: #fff; border-radius: 10px; padding: 1rem 1.5rem; border: 1px solid #e0d5c7; min-width: 130px; }
.stat-num { font-size: 1.8rem; font-weight: 700; color: #b6603a; line-height: 1; }
.stat-lbl { font-size: .75rem; color: #6e6356; margin-top: .25rem; }

@media (max-width: 600px) {
  .adm-content { padding: 1rem; }
  .form-row { grid-template-columns: 1fr; }
}
</style>
</head>
<body>

<?php if (!$authed): ?>
<!-- ============================================================
     PANTALLA DE LOGIN
     ============================================================ -->
<div class="login-wrap">
  <h1>🔒 Casa Los Curazaos<br><small style="font-weight:400;font-size:.85rem;color:#6e6356;">Panel de administración</small></h1>
  <?php if ($loginError): ?>
    <p class="error-msg"><?= htmlspecialchars($loginError) ?></p>
  <?php endif ?>
  <form method="POST">
    <div class="field">
      <label>Contraseña</label>
      <input type="password" name="password" autofocus autocomplete="current-password" />
    </div>
    <button type="submit" class="btn btn-primary" style="width:100%">Entrar</button>
  </form>
</div>

<?php else: ?>
<!-- ============================================================
     PANEL AUTENTICADO
     ============================================================ -->

<div class="adm-header">
  <div class="adm-brand">Casa <span>Los Curazaos</span> · Admin</div>
  <a href="?logout=1" class="adm-logout">Cerrar sesión</a>
</div>

<div class="adm-tabs">
  <a class="adm-tab <?= $activeTab==='calendario'?'active':'' ?>" href="?tab=calendario">📅 Calendario / Bloqueos</a>
  <a class="adm-tab <?= $activeTab==='reservas'?'active':'' ?>" href="?tab=reservas">📋 Reservas</a>
  <a class="adm-tab <?= $activeTab==='descuentos'?'active':'' ?>" href="?tab=descuentos">🏷️ Descuentos</a>
</div>

<div class="adm-content">

<?php if ($actionMsg): ?>
  <p class="ok-msg"><?= htmlspecialchars($actionMsg) ?></p>
<?php endif ?>

<!-- ============================================================
     TAB: CALENDARIO / BLOQUEOS
     ============================================================ -->
<?php if ($activeTab === 'calendario'): ?>

  <div class="block-form">
    <h2>Bloquear fechas</h2>
    <form method="POST">
      <input type="hidden" name="action" value="block" />
      <div class="form-row">
        <div class="field">
          <label>Cabaña</label>
          <select name="cabin">
            <option value="todas">Todas las cabañas</option>
            <?php foreach ($cabinNames as $k => $v): ?>
              <option value="<?= $k ?>"><?= htmlspecialchars($v) ?></option>
            <?php endforeach ?>
          </select>
        </div>
        <div class="field">
          <label>Desde (check-in)</label>
          <input type="date" name="block_start" required />
        </div>
        <div class="field">
          <label>Hasta (check-out)</label>
          <input type="date" name="block_end" required />
        </div>
        <div class="field">
          <label>Nota interna (opcional)</label>
          <input type="text" name="notes" placeholder="Ej: Mantenimiento, uso propio…" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:.5rem">Bloquear fechas</button>
    </form>
  </div>

  <!-- Todo lo que bloquea el calendario (bloqueos + reservas confirmadas) -->
  <?php
    $bloqueantes = array_filter($reservas, fn($r) => in_array($r['status'] ?? '', ['blocked','confirmed','pending']));
    uasort($bloqueantes, fn($a,$b) => strcmp($a['start']??'', $b['start']??''));
  ?>
  <h2 style="font-size:1rem;margin-bottom:.4rem;">Fechas bloqueadas en el calendario (<?= count($bloqueantes) ?>)</h2>
  <p style="font-size:.82rem;color:#6e6356;margin-bottom:1rem;">Incluye bloqueos manuales, reservas confirmadas y pendientes. Usa "Liberar" para eliminar cualquier entrada y abrir las fechas.</p>
  <?php if (empty($bloqueantes)): ?>
    <p style="color:#6e6356;font-size:.9rem;">No hay fechas bloqueadas.</p>
  <?php else: ?>
    <div class="adm-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Cabaña</th>
            <th>Desde</th>
            <th>Hasta</th>
            <th>Huésped / Nota</th>
            <th>ID</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($bloqueantes as $id => $r): ?>
          <?php
            $st = $r['status'] ?? '';
            $stColor = $st === 'confirmed' ? '#2e7d32' : ($st === 'pending' ? '#e65100' : '#555');
            $stLabel = $st === 'confirmed' ? 'Reserva ✓' : ($st === 'pending' ? 'Pendiente' : 'Bloqueo admin');
            $quien   = $r['name'] ?? ($r['notes'] ?? '—');
          ?>
          <tr>
            <td><span style="font-size:.78rem;font-weight:700;color:<?= $stColor ?>"><?= $stLabel ?></span></td>
            <td><?= htmlspecialchars($cabinNames[$r['cabin']] ?? $r['cabin']) ?></td>
            <td><?= fmtDate($r['start']) ?></td>
            <td><?= fmtDate($r['end']) ?></td>
            <td style="font-size:.82rem;color:#444;"><?= htmlspecialchars($quien) ?></td>
            <td style="font-family:monospace;font-size:.85rem;font-weight:700;color:#b6603a;"><?= htmlspecialchars($id) ?></td>
            <td>
              <form method="POST" onsubmit="return confirm('¿Liberar estas fechas? Si es una reserva confirmada, el pago ya fue recibido. Continuar?')">
                <input type="hidden" name="action" value="delete" />
                <input type="hidden" name="del_id" value="<?= htmlspecialchars($id) ?>" />
                <button type="submit" class="btn btn-danger" style="white-space:nowrap">Liberar fechas</button>
              </form>
            </td>
          </tr>
          <?php endforeach ?>
        </tbody>
      </table>
    </div>
  <?php endif ?>

<!-- ============================================================
     TAB: RESERVAS
     ============================================================ -->
<?php elseif ($activeTab === 'reservas'): ?>

  <?php
    $onlyReservas = array_filter($reservas, fn($r) => ($r['status'] ?? '') !== 'blocked');
    $confirmed = count(array_filter($onlyReservas, fn($r) => $r['status'] === 'confirmed'));
    $pending   = count(array_filter($onlyReservas, fn($r) => $r['status'] === 'pending'));
  ?>

  <div class="stats-row">
    <div class="stat-card"><div class="stat-num"><?= count($onlyReservas) ?></div><div class="stat-lbl">Total reservas</div></div>
    <div class="stat-card"><div class="stat-num"><?= $confirmed ?></div><div class="stat-lbl">Confirmadas</div></div>
    <div class="stat-card"><div class="stat-num"><?= $pending ?></div><div class="stat-lbl">Pendientes</div></div>
  </div>

  <?php if (empty($onlyReservas)): ?>
    <p style="color:#6e6356;">No hay reservas todavía.</p>
  <?php else: ?>
    <div class="adm-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Estado</th>
            <th>Cabaña</th>
            <th>Huésped</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Noches</th>
            <th>Adultos</th>
            <th>Total (COP)</th>
            <th>Fecha reserva</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($onlyReservas as $id => $r): ?>
          <tr>
            <td style="font-family:monospace;font-size:.85rem;font-weight:700;color:#b6603a;"><?= htmlspecialchars($id) ?></td>
            <td>
              <span class="status-pill" style="background:<?= statusColor($r['status']??'') ?>">
                <?= htmlspecialchars(statusLabel($r['status']??'')) ?>
              </span>
            </td>
            <td><?= htmlspecialchars($cabinNames[$r['cabin']??''] ?? ($r['cabin']??'')) ?></td>
            <td>
              <strong style="font-size:.82rem;"><?= htmlspecialchars($r['name']??'') ?></strong><br>
              <span style="font-size:.75rem;color:#6e6356;">CC <?= htmlspecialchars($r['cedula']??'') ?></span><br>
              <span style="font-size:.75rem;color:#6e6356;"><?= htmlspecialchars($r['phone']??'') ?></span><br>
              <span style="font-size:.75rem;color:#6e6356;"><?= htmlspecialchars($r['email']??'') ?></span>
            </td>
            <td><?= fmtDate($r['start']??'') ?></td>
            <td><?= fmtDate($r['end']??'') ?></td>
            <td><?= $r['nights']??'—' ?></td>
            <td><?= $r['adults']??'—' ?></td>
            <td style="font-family:monospace;font-size:.82rem;">
              <?= $r['amount'] ? '$ '.number_format($r['amount'],0,',','.') : '—' ?>
            </td>
            <td style="font-size:.75rem;color:#6e6356;"><?= substr($r['createdAt']??'',0,10) ?></td>
            <td>
              <form method="POST" onsubmit="return confirm('¿Eliminar esta reserva? Esta acción no se puede deshacer.')">
                <input type="hidden" name="action" value="delete" />
                <input type="hidden" name="del_id" value="<?= htmlspecialchars($id) ?>" />
                <button type="submit" class="btn btn-danger">Borrar</button>
              </form>
            </td>
          </tr>
          <?php endforeach ?>
        </tbody>
      </table>
    </div>
  <?php endif ?>

<?php endif ?>

<!-- ============================================================
     TAB: DESCUENTOS
     ============================================================ -->
<?php if ($activeTab === 'descuentos'): ?>

<style>
.disc-table { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; overflow:hidden; border:1px solid #e0d5c7; font-size:.84rem; table-layout:auto; }
.disc-table th { background:#1f1b16; color:#f3ece0; padding:.6rem .9rem; text-align:left; font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; }
.disc-table td { padding:.6rem .9rem; border-bottom:1px solid #f0e8db; vertical-align:middle; white-space:nowrap; }
.disc-table td.notes-col { white-space:normal; max-width:180px; color:#6e6356; font-size:.78rem; }
.disc-table tr:last-child td { border-bottom:none; }
.disc-table tr:hover td { background:#fbf7ef; }
.toggle-btn { padding:.3rem .85rem; border-radius:20px; font-size:.78rem; font-weight:700; border:none; cursor:pointer; transition:background .2s; white-space:nowrap; }
.toggle-on  { background:#2e7d32; color:#fff; }
.toggle-off { background:#999; color:#fff; }
.disc-actions { display:flex; gap:.4rem; align-items:center; }
.del-btn    { background:none; border:1px solid #e57373; color:#c62828; border-radius:6px; padding:.25rem .65rem; font-size:.75rem; cursor:pointer; white-space:nowrap; }
.del-btn:hover { background:#fdecea; }
.date-btn   { background:none; border:1px solid #b6603a; color:#b6603a; border-radius:6px; padding:.25rem .65rem; font-size:.75rem; cursor:pointer; white-space:nowrap; }
.date-btn:hover { background:#fdf3ee; }
.disc-form  { background:#fff; border:1px solid #e0d5c7; border-radius:10px; padding:1.25rem 1.5rem; margin-bottom:1.5rem; }
.disc-form h3 { font-size:.95rem; font-weight:700; margin-bottom:1rem; }
.disc-row   { display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:.8rem; margin-bottom:.8rem; }
.disc-row .field label { font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#6e6356; display:block; margin-bottom:.25rem; }
.disc-row .field input, .disc-row .field select { width:100%; padding:.45rem .7rem; border:1px solid #d5c9ba; border-radius:6px; font-size:.85rem; }
#disc-msg { font-size:.85rem; margin-top:.75rem; font-weight:600; }
.type-pct-only { display:none; }
</style>

<div class="disc-form">
  <h3>➕ Nuevo código de descuento</h3>
  <div class="disc-row">
    <div class="field"><label>Código *</label><input type="text" id="nc-code" placeholder="Ej: ISA15-CLC" style="text-transform:uppercase" /></div>
    <div class="field"><label>Tipo *</label>
      <select id="nc-type" onchange="document.getElementById('nc-pct-wrap').style.display=this.value==='pct'?'':'none'">
        <option value="pct">Porcentaje %</option>
        <option value="second_night">50% 2ª noche</option>
        <option value="weekday_2x1">2x1 en semana</option>
      </select>
    </div>
    <div class="field type-pct-only" id="nc-pct-wrap" style="display:block"><label>Descuento %</label><input type="number" id="nc-pct" min="1" max="100" placeholder="15" /></div>
    <div class="field"><label>Válido desde</label><input type="date" id="nc-from" /></div>
    <div class="field"><label>Válido hasta</label><input type="date" id="nc-until" /></div>
  </div>
  <div class="disc-row">
    <div class="field"><label>Notas internas</label><input type="text" id="nc-notes" placeholder="Ej: Influencer Jun 2026" /></div>
    <div class="field" style="display:flex;align-items:center;gap:.5rem;padding-top:1.3rem;">
      <input type="checkbox" id="nc-ref" style="width:16px;height:16px;" />
      <label for="nc-ref" style="font-size:.83rem;text-transform:none;letter-spacing:0;font-weight:500;">Requiere nombre de empresa</label>
    </div>
    <div class="field" style="display:flex;align-items:center;gap:.5rem;padding-top:1.3rem;">
      <input type="checkbox" id="nc-active" checked style="width:16px;height:16px;" />
      <label for="nc-active" style="font-size:.83rem;text-transform:none;letter-spacing:0;font-weight:500;">Activo al crear</label>
    </div>
  </div>
  <button class="btn btn-primary" onclick="createCode()">Crear código</button>
  <div id="disc-msg"></div>
</div>

<h2 style="font-size:1rem;margin-bottom:1rem;">Códigos activos</h2>
<div class="adm-table-wrap">
<table class="disc-table" id="disc-table">
  <thead><tr>
    <th>Código</th><th>Tipo</th><th>%</th><th>Estado</th><th>Fechas</th><th>Empresa req.</th><th>Notas</th><th></th>
  </tr></thead>
  <tbody id="disc-tbody"><tr><td colspan="8" style="text-align:center;color:#999;padding:2rem;">Cargando…</td></tr></tbody>
</table>
</div>

<script>
const API = '../api/discount-manager.php';
const TYPE_LABELS = { pct: 'Porcentaje', second_night: '50% 2ª noche', weekday_2x1: '2x1 semana' };

async function loadCodes() {
  const res = await fetch(API);
  const data = await res.json();
  if (!data.ok) { document.getElementById('disc-tbody').innerHTML = '<tr><td colspan="8" style="color:red">Error cargando códigos</td></tr>'; return; }
  const codes = data.codes;
  const keys = Object.keys(codes);
  if (!keys.length) { document.getElementById('disc-tbody').innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:1.5rem">No hay códigos</td></tr>'; return; }
  document.getElementById('disc-tbody').innerHTML = keys.map(k => {
    const c = codes[k];
    const active = c.active !== false;
    const from  = c.from  ? c.from  : '—';
    const until = c.until ? c.until : '—';
    return `<tr>
      <td style="font-family:monospace;font-weight:700;color:#b6603a">${k}</td>
      <td>${TYPE_LABELS[c.type] ?? c.type}</td>
      <td style="font-weight:600">${c.pct != null ? c.pct+'%' : '—'}</td>
      <td><button class="toggle-btn ${active?'toggle-on':'toggle-off'}" onclick="toggle('${k}',this)">${active?'✅ Activo':'⏸ Inactivo'}</button></td>
      <td style="font-size:.78rem;color:#6e6356">${from}<br>${until !== '—' ? '→ '+until : ''}</td>
      <td style="text-align:center">${c.requiresRef ? '<span style="color:#2e7d32;font-weight:700">✔</span>' : '<span style="color:#ccc">—</span>'}</td>
      <td class="notes-col">${c.notes ?? ''}</td>
      <td><div class="disc-actions">
        <button class="del-btn" onclick="delCode('${k}')">Borrar</button>
        ${c.until ? `<button class="date-btn" onclick="editUntil('${k}','${c.until}')">Fechas</button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
}

async function toggle(code, btn) {
  const res = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'toggle', code}) });
  const d = await res.json();
  if (d.ok) { btn.className = 'toggle-btn ' + (d.active?'toggle-on':'toggle-off'); btn.textContent = d.active?'✅ Activo':'⏸ Inactivo'; }
}

async function delCode(code) {
  if (!confirm('¿Eliminar el código ' + code + '? Esta acción no se puede deshacer.')) return;
  const res = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'delete', code}) });
  const d = await res.json();
  if (d.ok) loadCodes();
}

async function editUntil(code, current) {
  const newDate = prompt('Nueva fecha de vencimiento (AAAA-MM-DD):', current);
  if (!newDate) return;
  // Get current entry data, update until
  const res = await fetch(API);
  const data = await res.json();
  if (!data.ok) return;
  const entry = data.codes[code];
  entry.until = newDate;
  await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'save', code, data: entry}) });
  loadCodes();
}

async function createCode() {
  const code  = document.getElementById('nc-code').value.toUpperCase().trim();
  const type  = document.getElementById('nc-type').value;
  const pct   = parseInt(document.getElementById('nc-pct').value);
  const from  = document.getElementById('nc-from').value || null;
  const until = document.getElementById('nc-until').value || null;
  const notes = document.getElementById('nc-notes').value;
  const ref   = document.getElementById('nc-ref').checked;
  const active= document.getElementById('nc-active').checked;
  const msg   = document.getElementById('disc-msg');
  if (!code) { msg.textContent = '⚠️ El código es obligatorio'; msg.style.color='#c62828'; return; }
  if (type === 'pct' && (!pct || pct < 1 || pct > 100)) { msg.textContent = '⚠️ Porcentaje inválido (1-100)'; msg.style.color='#c62828'; return; }
  const data = { type, active, requiresRef: ref, notes };
  if (type === 'pct') data.pct = pct;
  if (from)  data.from  = from;
  if (until) data.until = until;
  const res = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'save', code, data}) });
  const d = await res.json();
  if (d.ok) {
    msg.textContent = '✅ Código ' + code + ' creado'; msg.style.color='#2e7d32';
    document.getElementById('nc-code').value = '';
    document.getElementById('nc-pct').value  = '';
    document.getElementById('nc-notes').value = '';
    document.getElementById('nc-from').value  = '';
    document.getElementById('nc-until').value = '';
    loadCodes();
  } else { msg.textContent = '⚠️ ' + d.error; msg.style.color='#c62828'; }
}

loadCodes();
</script>

<?php endif ?>

</div><!-- /.adm-content -->

<?php endif ?>

</body>
</html>
