<?php
/* =====================================================================
   Casa Los Curazaos — subida de documento de identidad
   POST multipart/form-data: document (file) + orderId (string)
   Guarda en api/data/docs/{orderId}_{timestamp}.{ext}
   ===================================================================== */

require __DIR__ . '/_lib.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  clc_json_response(['ok' => false, 'error' => 'Método no permitido'], 405);
}

$orderId = preg_replace('/[^A-Za-z0-9\-]/', '', $_POST['orderId'] ?? '');
if (!$orderId) {
  clc_json_response(['ok' => false, 'error' => 'orderId requerido'], 400);
}

if (empty($_FILES['document']) || $_FILES['document']['error'] !== UPLOAD_ERR_OK) {
  clc_json_response(['ok' => false, 'error' => 'No se recibió el archivo o hubo un error en la subida'], 400);
}

$file     = $_FILES['document'];
$maxSize  = 5 * 1024 * 1024; // 5 MB
$allowed  = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'application/pdf' => 'pdf'];
$mime     = mime_content_type($file['tmp_name']);

if ($file['size'] > $maxSize) {
  clc_json_response(['ok' => false, 'error' => 'El archivo supera los 5 MB'], 413);
}
if (!isset($allowed[$mime])) {
  clc_json_response(['ok' => false, 'error' => 'Solo se aceptan JPG, PNG o PDF'], 415);
}

$ext     = $allowed[$mime];
$docsDir = __DIR__ . '/data/docs';
if (!is_dir($docsDir)) @mkdir($docsDir, 0775, true);

$destName = $orderId . '_' . time() . '.' . $ext;
$destPath = $docsDir . '/' . $destName;

if (!move_uploaded_file($file['tmp_name'], $destPath)) {
  clc_json_response(['ok' => false, 'error' => 'Error al guardar el archivo en el servidor'], 500);
}

// Proteger el directorio docs de listado
$htaccess = $docsDir . '/.htaccess';
if (!file_exists($htaccess)) {
  file_put_contents($htaccess, "Options -Indexes\nRequire all denied\n");
}

clc_log("upload-document: $destName orderId=$orderId size={$file['size']}");

clc_json_response(['ok' => true, 'file' => $destName]);
