/* Casa Los Curazaos — datos de marca y contenido editable.
   Edita aquí tarifas, llaves Bold, URLs iCal Airbnb e Instagram cuando los tengas. */
(function () {
  "use strict";

  window.__BRAND__ = {
    name: "Casa Los Curazaos",
    tagline: "Tres cabañas privadas para descansar en Llanogrande",
    location: "Vereda Cabeceras · Llanogrande, Rionegro · Antioquia",
    airport: "15 minutos del Aeropuerto JMC",

    /* === Contacto === */
    whatsapp: {
      number: "+57 312 273 8001",
      link: "https://wa.me/573122738001"
    },
    instagram: {
      handle: "@casaloscurazaos",                // [INSTAGRAM_HANDLE]
      link: "https://instagram.com/casaloscurazaos"
    },

    /* === Datos legales === */
    legal: {
      razon: "LEMONT GROUP S.A.S.",
      nit: "901463296-8",
      rnt: "201944",
      direccion: "Vereda Cabeceras, Sector Gilberto Echeverri, Finca 35 — Rionegro, Antioquia"
    },

    /* === Pagos (Bold) === */
    /* Llaves pública+secreta y URL del checkout las define el servidor en
       site/api/bold-checkout.php — aquí solo nombre amigable */
    pago: {
      proveedor: "Bold",
      moneda: "COP",
      redirectThanks: "gracias.html"
    },

    /* === Tarifas por noche en COP ===
       Diferenciadas entre semana (lun–jue) y fin de semana (vie–dom).
       El motor calcula automáticamente las noches de cada tipo. */
    tarifas: {
      luxe:           { semana: 340000, finde: 430000, temporada: 500000,  currency: "COP" },
      comfort:        { semana: 340000, finde: 430000, temporada: 500000,  currency: "COP" },
      prestige:       { semana: 340000, finde: 430000, temporada: 500000,  currency: "COP" },
      "casa-completa":{ semana: 990000, finde: 1250000, temporada: 1500000, currency: "COP" }
    },

    /* === Cabañas ===
       Capacidad oficial publicada (publicada) y capacidad real (real).
       En la web mostramos la publicada y aclaramos la real en descripción. */
    cabanas: [
      {
        id: "luxe",
        nombre: "Luxe",
        title: "Cabaña Luxe",
        airbnbName: "Luxe Cabin for rest in Llano Grande",
        pretitle: "Cabaña 01",
        tagline: "Escapadas en pareja y reposo cuidado",
        descripcion: "Una cabaña pensada para detener el ritmo. Deck amplio con mobiliario premium, jacuzzi privado al aire libre y una habitación principal con cama King. Ideal para escapadas románticas y teletrabajo en silencio.",
        capacidadPublicada: 3,
        capacidadReal: 3,
        capacidadCopy: "3 huéspedes (hasta 3 adultos o 2 adultos + 2 niños pequeños usando el sofá-cama).",
        camas: "Cama King + sofá-cama pequeño",
        banos: 1,
        cover: "assets/img/luxe/luxe-dec-1.jpg",
        gallery: [
          "assets/img/luxe/luxe-dec-1.jpg",
          "assets/img/luxe/luxe-hab-1.jpg",
          "assets/img/luxe/luxe-jac-1.jpg",
          "assets/img/luxe/luxe-sala-1.jpg",
          "assets/img/luxe/luxe-k-1.jpg",
          "assets/img/luxe/luxe-jar-1.jpg",
          "assets/img/luxe/luxe-dec-2.jpg",
          "assets/img/luxe/luxe-hab-2.jpg",
          "assets/img/luxe/luxe-jac-2.jpg",
          "assets/img/luxe/luxe-ba-1.jpg"
        ],
        amenidades: [
          "Jacuzzi privado al aire libre",
          "Deck con mobiliario premium",
          "Asador a gas y carbón",
          "Cocina equipada (nevera, estufa, microondas, cafetera, sanduchera, licuadora, tostadora)",
          "Cama King con sábanas 300 hilos y almohadas tela fría",
          "Sofá-cama pequeño para huésped adicional",
          "Smart TV (sin suscripciones)",
          "Wi-Fi por cabaña",
          "Zona de trabajo con escritorio",
          "Parqueadero privado en finca"
        ]
      },
      {
        id: "comfort",
        nombre: "Comfort",
        title: "Cabaña Comfort",
        airbnbName: "Cozy Cabin for rest in Llano Grande",
        pretitle: "Cabaña 02",
        tagline: "Para familia o grupo pequeño con dos camas",
        descripcion: "Dos camas en un solo dormitorio amplio: una King y una doble. La cabaña pensada para familias o grupos pequeños. Cocina completa, deck con BBQ y jacuzzi privado. Opción de lavandería disponible.",
        capacidadPublicada: 5,
        capacidadReal: 5,
        capacidadCopy: "5 huéspedes (hasta 5 adultos o 4 adultos + 2 niños pequeños usando el sofá-cama).",
        camas: "Cama King + cama doble + sofá-cama pequeño",
        banos: 1,
        cover: "assets/img/comfort/comfort-dec-1.jpg",
        gallery: [
          "assets/img/comfort/comfort-dec-1.jpg",
          "assets/img/comfort/comfort-dormitorio-1.jpg",
          "assets/img/comfort/comfort-jac-1.jpg",
          "assets/img/comfort/comfort-sal-1.jpg",
          "assets/img/comfort/comfort-k-1.jpg",
          "assets/img/comfort/comfort-dormitorio-2.jpg",
          "assets/img/comfort/comfort-dec-2.jpg",
          "assets/img/comfort/comfort-sal-2.jpg",
          "assets/img/comfort/comfort-jac-2.jpg",
          "assets/img/comfort/comfort-ba-1.jpg"
        ],
        amenidades: [
          "Jacuzzi privado",
          "Deck con mobiliario de alto estándar",
          "Asador a gas y carbón",
          "Cocina equipada (nevera, estufa, microondas, cafetera, sanduchera, licuadora, tostadora)",
          "Cama King + cama doble en dormitorio amplio (sábanas 300 hilos)",
          "Sofá-cama pequeño para huésped o niños adicionales",
          "Lavandería disponible (cuando aplique)",
          "Smart TV · Wi-Fi por cabaña",
          "Zona de trabajo silenciosa",
          "Parqueadero privado en finca"
        ]
      },
      {
        id: "prestige",
        nombre: "Prestige",
        title: "Cabaña Prestige",
        airbnbName: "Best Cabin for rest in Llano Grande",
        pretitle: "Cabaña 03",
        tagline: "Desconexión real entre árboles",
        descripcion: "La cabaña más generosa en naturaleza. Deck rodeado de un pequeño bosque propio, una habitación luminosa y refinada, y un jacuzzi privado donde el verde es el único paisaje.",
        capacidadPublicada: 3,
        capacidadReal: 3,
        capacidadCopy: "3 huéspedes (hasta 3 adultos o 2 adultos + 2 niños pequeños usando el sofá-cama).",
        camas: "Cama King + sofá-cama pequeño",
        banos: 1,
        cover: "assets/img/prestige/prestige-dec-2.jpg",
        gallery: [
          "assets/img/prestige/prestige-dec-2.jpg",
          "assets/img/prestige/prestige-hab-1.jpg",
          "assets/img/prestige/prestige-jac-1.jpg",
          "assets/img/prestige/prestige-sal-1.jpg",
          "assets/img/prestige/prestige-k-1.jpg",
          "assets/img/prestige/prestige-gar-1.jpg",
          "assets/img/prestige/prestige-dec-2.jpg",
          "assets/img/prestige/prestige-gar-2.jpg",
          "assets/img/prestige/prestige-hab-2.jpg",
          "assets/img/prestige/prestige-jac-2.jpg"
        ],
        amenidades: [
          "Jacuzzi privado entre árboles",
          "Deck generoso con vista a bosque privado",
          "Asador a gas y carbón",
          "Cocina equipada (nevera, estufa, microondas, cafetera, sanduchera, licuadora, tostadora)",
          "Cama King con sábanas 300 hilos",
          "Sofá-cama pequeño para huésped adicional",
          "Smart TV · Wi-Fi por cabaña",
          "Zona de trabajo con escritorio",
          "Pequeño bosque propio para caminar",
          "Parqueadero privado en finca"
        ]
      }
    ],

    casaCompleta: {
      id: "casa-completa",
      nombre: "Casa Completa",
      title: "Deluxe House",
      airbnbName: "Deluxe House for friends and family",
      tagline: "Las tres cabañas para tu grupo",
      descripcion: "La finca entera para ti: las tres cabañas con sus tres jacuzzis, tres cocinas y tres terrazas privadas. Capacidad publicada de 8 huéspedes; bajo solicitud admite hasta 11 adultos (3 camas King + 1 doble + 3 sofás-cama) o 8 adultos + 6 niños pequeños.",
      capacidadPublicada: 8,
      capacidadReal: 11,
      capacidadCopy: "8 huéspedes (hasta 11 adultos, o 8 adultos + 6 niños).",
      camas: "3 King + 1 doble + 3 sofás-cama",
      banos: 3,
      cover: "assets/img/luxe/luxe-z1.jpg",
      gallery: [
        "assets/img/luxe/luxe-z1.jpg",
        "assets/img/luxe/luxe-jac-1.jpg",
        "assets/img/comfort/comfort-dec-1.jpg",
        "assets/img/prestige/prestige-gar-1.jpg",
        "assets/img/comfort/comfort-dormitorio-1.jpg",
        "assets/img/prestige/prestige-jac-1.jpg",
        "assets/img/luxe/luxe-dec-1.jpg",
        "assets/img/prestige/prestige-dec-1.jpg",
        "assets/img/luxe/luxe-hab-1.jpg",
        "assets/img/comfort/comfort-sal-1.jpg"
      ]
    },

    /* === Esquema operativo === */
    operacion: {
      checkin: "Desde las 3:00 p. m.",
      checkout: "Hasta las 12:00 m.",
      mascotas: "Bienvenidas sin costo (traer su camita)",
      eventos: "No fiestas ni música alta · pequeños encuentros familiares con autorización previa",
      fumadores: "Espacio 100 % libre de humo",
      pago: "Pago en línea seguro con Bold al confirmar la reserva",
      aseo: "Limpieza adicional disponible bajo solicitud (COP $80.000 por cabaña)"
    },

    entorno: [
      { tiempo: "5 min", lugar: "Club Campestre Llanogrande" },
      { tiempo: "10 min", lugar: "Mall Jardines y el Complex" },
      { tiempo: "5–10 min", lugar: "Carulla, cafés y restaurantes" },
      { tiempo: "15 min", lugar: "Aeropuerto Internacional JMC (Rionegro)" }
    ],

    galeriaDestacada: [
      "assets/img/luxe/luxe-jac-1.jpg",
      "assets/img/prestige/prestige-dec-1.jpg",
      "assets/img/comfort/comfort-dormitorio-1.jpg",
      "assets/img/luxe/luxe-dec-2.jpg",
      "assets/img/prestige/prestige-gar-2.jpg",
      "assets/img/comfort/comfort-jac-1.jpg",
      "assets/img/luxe/luxe-sala-1.jpg",
      "assets/img/prestige/prestige-hab-1.jpg",
      "assets/img/comfort/comfort-dormitorio-2.jpg",
      "assets/img/luxe/luxe-hab-1.jpg",
      "assets/img/prestige/prestige-jac-1.jpg",
      "assets/img/comfort/comfort-k-1.jpg"
    ]
  };
})();
