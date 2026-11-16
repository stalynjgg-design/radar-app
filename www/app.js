// REEMPLAZA ESTOS DOS VALORES CON LOS DE TU SUPABASE
const SUPABASE_URL = 'https://uxhfmthzhlbbwrhvnkoa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nzyDY99GWkHAtrwsnCmB9A_IFqDXxW3';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let map;
let marcadores = {};
let miUsuario = null;
let watchId = null;

// Inicializar el mapa centrado por defecto
function iniciarMapa() {
  map = L.map('map', { zoomControl: false }).setView([11.69, -70.19], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);
  
  
}

// Actualizar o crear marcador en el mapa con la insignia personalizada
function actualizarMarcador(usuario) {
  if (!usuario.conectado) {
    if (marcadores[usuario.telefono]) {
      map.removeLayer(marcadores[usuario.telefono]);
      delete marcadores[usuario.telefono];
    }
    return;
  }

  const pos = [usuario.lat, usuario.lng];

  // Crear la insignia visual flotante con el nombre del usuario
  const insigniaHtml = L.divIcon({
    className: 'custom-badge-container',
    html: `
      <div class="user-badge">
        <span>📍</span>
        <div>${usuario.nombre || 'Usuario'}</div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });

  if (marcadores[usuario.telefono]) {
    // Si ya existe, actualizamos su posición y refrescamos el icono
    marcadores[usuario.telefono].setLatLng(pos);
    marcadores[usuario.telefono].setIcon(insigniaHtml);
  } else {
    // Si no existe, lo creamos con la insignia personalizada
    marcadores[usuario.telefono] = L.marker(pos, { icon: insigniaHtml })
      .addTo(map)
      .bindPopup(`<b>${usuario.nombre}</b><br>Teléfono: ${usuario.telefono}`);
  }
}

// Escuchar cambios en tiempo real de todos los usuarios
function escucharUbicaciones() {
  // 1. Cargar los que ya están conectados
  supabaseClient
    .from('ubicaciones')
    .select('*')
    .eq('conectado', true)
    .then(({ data }) => {
      if (data) data.forEach(actualizarMarcador);
    });

  // 2. Suscribirse a movimientos en vivo
  supabaseClient
    .channel('cambios-ubicacion')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ubicaciones' }, payload => {
      if (payload.new) actualizarMarcador(payload.new);
    })
    .subscribe();
}

// Enviar mi ubicación a Supabase
async function enviarPosicion(lat, lng) {
  if (!miUsuario) return;
  await supabaseClient.from('ubicaciones').upsert({
    telefono: miUsuario.telefono,
    nombre: miUsuario.nombre,
    lat: lat,
    lng: lng,
    conectado: true,
    actualizado_en: new Date().toISOString()
  });
}

// Iniciar rastreo (Usa plugin nativo en segundo plano si está en APK, o navegador si está en web)
function iniciarRastreoGPS() {
  if (window.Capacitor && window.Capacitor.Plugins.BackgroundGeolocation) {
    // MODO APP NATIVA (Funciona con pantalla bloqueada)
    const { BackgroundGeolocation } = window.Capacitor.Plugins;
    BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "Compartiendo ubicación en tiempo real...",
        backgroundTitle: "Radar Activo",
        requestPermissions: true,
        stale: false,
        distanceFilter: 5 // Actualiza cada 5 metros de movimiento
      },
      (location, error) => {
        if (error) return console.error(error);
        if (location) {
          enviarPosicion(location.latitude, location.longitude);
        }
      }
    ).then(id => { watchId = id; });
  } else {
    // MODO NAVEGADOR WEB (Fallback para pruebas)
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        enviarPosicion(latitude, longitude);
        map.setView([latitude, longitude], 16);
      },
      (err) => alert("Activa el GPS para conectarte"),
      { enableHighAccuracy: true }
    );
  }
}

// Evento del botón Conectar
document.getElementById('btn-conectar').addEventListener('click', () => {
  const nombre = document.getElementById('nombre').value.trim();
  const telefono = document.getElementById('telefono').value.trim();

  if (!nombre || !telefono) {
    alert("Debes ingresar tu nombre y teléfono para ver el mapa.");
    return;
  }

  miUsuario = { nombre, telefono };
  
  // Desbloquear interfaz
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('status-bar').classList.remove('hidden');
  document.getElementById('user-info').innerText = `🟢 ${nombre}`;

  // Iniciar GPS y empezar a ver a los demás
  iniciarRastreoGPS();
  escucharUbicaciones();
});

// Evento del botón Desconectar
document.getElementById('btn-desconectar').addEventListener('click', async () => {
  if (miUsuario) {
    await supabaseClient
      .from('ubicaciones')
      .update({ conectado: false })
      .eq('telefono', miUsuario.telefono);
  }
  location.reload();
});

iniciarMapa();
              
