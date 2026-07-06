<?php
/* =====================================================================
   Casa Los Curazaos — configuración central de la API
   ---------------------------------------------------------------------
   INSTRUCCIONES:
   1. Copia este archivo como _config.php en el servidor (Hostinger)
   2. Reemplaza todos los valores [PLACEHOLDER] con los reales
   3. NUNCA subas _config.php a git — está en .gitignore
   ===================================================================== */

return [

  'bold' => [
    'public_key'     => '[BOLD_PUBLIC_KEY]',
    'secret_key'     => '[BOLD_SECRET_KEY]',
    'webhook_secret' => '[BOLD_WEBHOOK_SECRET]',
    'redirect_url'   => 'https://casaloscurazaos.com/gracias.html',
    'currency'       => 'COP',
  ],

  'tarifas' => [
    'luxe'           => ['semana' => 340000, 'finde' => 430000, 'temporada' => 500000],
    'comfort'        => ['semana' => 340000, 'finde' => 430000, 'temporada' => 500000],
    'prestige'       => ['semana' => 340000, 'finde' => 430000, 'temporada' => 500000],
    'casa-completa'  => ['semana' => 990000, 'finde' => 1250000, 'temporada' => 1500000],
  ],

  'airbnb_ical' => [
    'luxe'          => '[AIRBNB_ICAL_LUXE_URL]',
    'comfort'       => '[AIRBNB_ICAL_COMFORT_URL]',
    'prestige'      => '[AIRBNB_ICAL_PRESTIGE_URL]',
    'casa-completa' => '[AIRBNB_ICAL_CASA_COMPLETA_URL]',
  ],

  'expedia_ical' => [
    'comfort' => '[EXPEDIA_ICAL_COMFORT_URL]',
  ],

  'paths' => [
    'reservas' => __DIR__ . '/data/reservas.json',
    'log'      => __DIR__ . '/data/log.txt',
  ],

  'discount_codes' => [
    'BAYRON10'    => 15,
    'CORPORATIVO' => ['pct' => 25, 'until' => '2026-12-31'],
    'SEGUNDA50'   => ['type' => 'second_night',  'active' => false],
    'SEMANA2X1'   => ['type' => 'weekday_2x1',   'active' => false],
    'TEST1000'    => 99.0,
  ],

  'admin' => [
    'password' => '[ADMIN_PASSWORD]',
  ],

  'op' => [
    'cabin_names' => [
      'luxe'          => 'Cabaña Luxe',
      'comfort'       => 'Cabaña Comfort',
      'prestige'      => 'Cabaña Prestige',
      'casa-completa' => 'Deluxe House (las 3 cabañas)',
    ],
  ],
];
