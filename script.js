const API = "http://localhost:3000";

// ─── MAPA ────────────────────────────────────────────────────────────────────
let map;
let rotaControle;
let postosCamada;
let marcadorOrigem;
let marcadorDestino;

// ─── INIT ────────────────────────────────────────────────────────────────────
window.onload = () => {
  carregarVeiculos();
  configurarAutocomplete("origem");
  configurarAutocomplete("destino");
};

// ─── MOSTRAR MAPA ─────────────────────────────────────────────────────────────
function mostrarMapa() {
  const token = localStorage.getItem("token");
  if (!token) {
    abrirLogin();
    return;
  }

  document.querySelector(".hero").style.display = "none";
  document.getElementById("app").style.display = "block";

  if (!map) {
    map = L.map("map").setView([-15.78, -47.93], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(map);
    postosCamada = L.layerGroup().addTo(map);
  }

  setTimeout(() => map.invalidateSize(), 200);
}

// ─── AUTOCOMPLETE ─────────────────────────────────────────────────────────────
function configurarAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  let debounceTimer;
  let listEl = document.getElementById(`autocomplete-${inputId}`);
  if (!listEl) {
    listEl = document.createElement("ul");
    listEl.id = `autocomplete-${inputId}`;
    listEl.className = "autocomplete-list";
    input.parentNode.style.position = "relative";
    input.parentNode.appendChild(listEl);
  }

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 3) { listEl.innerHTML = ""; listEl.style.display = "none"; return; }

    debounceTimer = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=br&format=json&addressdetails=1&limit=5`,
          { headers: { "Accept-Language": "pt-BR" } }
        );
        const data = await r.json();
        listEl.innerHTML = "";
        if (!data.length) { listEl.style.display = "none"; return; }

        data.forEach(item => {
          const li = document.createElement("li");
          li.textContent = item.display_name;
          li.dataset.lat = item.lat;
          li.dataset.lon = item.lon;
          li.addEventListener("click", () => {
            input.value = item.display_name;
            input.dataset.lat = item.lat;
            input.dataset.lon = item.lon;
            listEl.innerHTML = "";
            listEl.style.display = "none";
          });
          listEl.appendChild(li);
        });
        listEl.style.display = "block";
      } catch (e) {
        console.error("Autocomplete erro:", e);
      }
    }, 400);
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !listEl.contains(e.target)) {
      listEl.style.display = "none";
    }
  });
}

// ─── GEOCODE (fallback se usuário não escolheu da lista) ──────────────────────
async function geocodificar(texto) {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(texto)}&countrycodes=br&format=json&limit=1`,
    { headers: { "Accept-Language": "pt-BR" } }
  );
  const d = await r.json();
  if (!d.length) throw new Error(`Não encontrei: ${texto}`);
  return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon), nome: d[0].display_name };
}

// ─── CALCULAR ROTA ────────────────────────────────────────────────────────────
async function calcularRota() {
  const origemInput  = document.getElementById("origem");
  const destinoInput = document.getElementById("destino");
  const consumo      = parseFloat(document.getElementById("consumo").value);
  const preco        = parseFloat(document.getElementById("preco").value);

  if (!origemInput.value || !destinoInput.value) {
    mostrarToast("Preencha origem e destino", "erro"); return;
  }
  if (!consumo || !preco) {
    mostrarToast("Informe consumo (km/l) e preço do combustível", "erro"); return;
  }

  const btnCalc = document.querySelector(".btn-calcular");
  btnCalc.textContent = "Calculando...";
  btnCalc.disabled = true;

  try {
    // Coordenadas
    let latO = parseFloat(origemInput.dataset.lat);
    let lonO = parseFloat(origemInput.dataset.lon);
    let latD = parseFloat(destinoInput.dataset.lat);
    let lonD = parseFloat(destinoInput.dataset.lon);

    if (!latO || !lonO) {
      const g = await geocodificar(origemInput.value);
      latO = g.lat; lonO = g.lon;
    }
    if (!latD || !lonD) {
      const g = await geocodificar(destinoInput.value);
      latD = g.lat; lonD = g.lon;
    }

    // Remover rota anterior
    if (rotaControle) { map.removeControl(rotaControle); rotaControle = null; }
    if (marcadorOrigem)  { map.removeLayer(marcadorOrigem);  marcadorOrigem  = null; }
    if (marcadorDestino) { map.removeLayer(marcadorDestino); marcadorDestino = null; }
    postosCamada.clearLayers();

    // Rota via OSRM
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${lonO},${latO};${lonD},${latD}?overview=full&geometries=geojson&steps=true`;
    const osrmRes = await fetch(osrmUrl);
    const osrmData = await osrmRes.json();

    if (!osrmData.routes || !osrmData.routes.length) {
      mostrarToast("Não foi possível traçar a rota", "erro"); return;
    }

    const rota      = osrmData.routes[0];
    const distanciaKm = rota.distance / 1000;
    const duracaoMin  = rota.duration / 60;
    const litros      = distanciaKm / consumo;
    const custoTotal  = litros * preco;

    // Paradas sugeridas (a cada ~300km)
    const paradas = Math.max(0, Math.floor(distanciaKm / 300));

    // Atualizar cards
    document.getElementById("cardDistancia").textContent  = distanciaKm.toFixed(1) + " km";
    document.getElementById("cardTempo").textContent      = formatarTempo(duracaoMin);
    document.getElementById("cardCombustivel").textContent = litros.toFixed(1) + " L";
    document.getElementById("cardParadas").textContent    = paradas > 0 ? paradas + " parada(s)" : "Sem paradas";
    document.getElementById("cardCusto").textContent      = "R$ " + custoTotal.toFixed(2);

    // Desenhar rota no mapa
    const coords = rota.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const polilinha = L.polyline(coords, { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(map);
    map.fitBounds(polilinha.getBounds(), { padding: [60, 60] });

    // Ícones personalizados
    const iconOrigem = L.divIcon({
      html: `<div class="marker-pin origem"><span>A</span></div>`,
      className: "", iconSize: [36, 36], iconAnchor: [18, 36]
    });
    const iconDestino = L.divIcon({
      html: `<div class="marker-pin destino"><span>B</span></div>`,
      className: "", iconSize: [36, 36], iconAnchor: [18, 36]
    });

    marcadorOrigem  = L.marker([latO, lonO], { icon: iconOrigem  }).addTo(map)
      .bindPopup(`<b>Origem</b><br>${origemInput.value.split(",")[0]}`).openPopup();
    marcadorDestino = L.marker([latD, lonD], { icon: iconDestino }).addTo(map)
      .bindPopup(`<b>Destino</b><br>${destinoInput.value.split(",")[0]}`);

    // Buscar postos no meio do trajeto
    buscarPostosNoTrajeto(coords, distanciaKm);

    mostrarToast("Rota calculada com sucesso!", "ok");

  } catch (e) {
    console.error(e);
    mostrarToast(e.message || "Erro ao calcular rota", "erro");
  } finally {
    btnCalc.textContent = "Calcular custo";
    btnCalc.disabled = false;
  }
}

// ─── FORMATAR TEMPO ────────────────────────────────────────────────────────────
function formatarTempo(minutos) {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

// ─── POSTOS NO TRAJETO ────────────────────────────────────────────────────────
async function buscarPostosNoTrajeto(coords, distanciaKm) {
  // Pega ponto médio da rota
  const meio = coords[Math.floor(coords.length / 2)];
  const [lat, lon] = meio;

  // Raio baseado na distância
  const raio = Math.min(Math.max(distanciaKm * 15, 5000), 50000);

  try {
    const url = `https://overpass-api.de/api/interpreter?data=[out:json][timeout:25];node["amenity"="fuel"](around:${raio},${lat},${lon});out body 20;`;
    const r = await fetch(url);
    const d = await r.json();

    if (!d.elements || !d.elements.length) return;

    const iconPosto = L.divIcon({
      html: `<div class="marker-posto">⛽</div>`,
      className: "", iconSize: [30, 30], iconAnchor: [15, 15]
    });

    d.elements.slice(0, 15).forEach(posto => {
      const nome = posto.tags?.name || posto.tags?.brand || "Posto de Combustível";
      L.marker([posto.lat, posto.lon], { icon: iconPosto })
        .addTo(postosCamada)
        .bindPopup(`<b>⛽ ${nome}</b>`);
    });

  } catch (e) {
    console.warn("Não carregou postos:", e);
  }
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function mostrarToast(msg, tipo = "ok") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = "toast " + (tipo === "erro" ? "toast-erro" : "toast-ok");
  toast.style.display = "block";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = "none"; }, 3500);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function abrirLogin() {
  document.getElementById("loginModal").style.display = "flex";
}

function fecharLogin() {
  document.getElementById("loginModal").style.display = "none";
}

async function login() {
  const loginValue = document.getElementById("loginEmail").value;
  const senha      = document.getElementById("loginSenha").value;

  try {
    const resposta = await fetch(API + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: loginValue, senha })
    });
    const dados = await resposta.json();

    if (!resposta.ok) { mostrarToast(dados.mensagem, "erro"); return; }

    localStorage.setItem("token", dados.token);
    mostrarToast("Login realizado!", "ok");
    fecharLogin();
    atualizarNavLogin();
    carregarVeiculos();

  } catch (e) { console.error(e); }
}

function logout() {
  localStorage.removeItem("token");
  atualizarNavLogin();
  document.querySelector(".hero").style.display = "flex";
  document.getElementById("app").style.display = "none";
}

function atualizarNavLogin() {
  const token = localStorage.getItem("token");
  const btnEntrar = document.getElementById("btnEntrar");
  const btnSair   = document.getElementById("btnSair");
  if (btnEntrar) btnEntrar.style.display = token ? "none"  : "inline";
  if (btnSair)   btnSair.style.display   = token ? "inline" : "none";
}

// ─── CADASTRO ─────────────────────────────────────────────────────────────────
function abrirCadastro() {
  document.getElementById("loginModal").style.display   = "none";
  document.getElementById("cadastroModal").style.display = "flex";
}

function voltarLogin() {
  document.getElementById("cadastroModal").style.display = "none";
  document.getElementById("loginModal").style.display    = "flex";
}

async function cadastrar() {
  try {
    const resposta = await fetch(API + "/usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome:            document.getElementById("nome").value,
        data_nascimento: document.getElementById("nascimento").value,
        cpf:             document.getElementById("cpf").value,
        telefone:        document.getElementById("telefone").value,
        email:           document.getElementById("email").value,
        endereco:        document.getElementById("endereco").value,
        senha:           document.getElementById("senha").value
      })
    });
    const dados = await resposta.json();
    mostrarToast(dados.mensagem, resposta.ok ? "ok" : "erro");
    if (resposta.ok) voltarLogin();
  } catch (e) { console.error(e); }
}

// ─── VEÍCULO ──────────────────────────────────────────────────────────────────
function abrirCadastroVeiculo() {
  const token = localStorage.getItem("token");
  if (!token) { mostrarToast("Faça login primeiro", "erro"); return; }
  document.getElementById("veiculoModal").style.display = "flex";
}

function fecharCadastroVeiculo() {
  document.getElementById("veiculoModal").style.display = "none";
}

function mudarCampos() {
  const tipo = document.getElementById("tipoVeiculo").value;
  document.getElementById("camposCaminhao").style.display =
    tipo === "caminhao" ? "block" : "none";
}

async function salvarVeiculo() {
  const token = localStorage.getItem("token");
  if (!token) { mostrarToast("Faça login primeiro", "erro"); return; }

  const tipo = document.getElementById("tipoVeiculo").value;

  try {
    const resposta = await fetch(API + "/veiculo", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({
        tipo,
        placa:        document.getElementById("placa").value,
        marca_modelo: document.getElementById("marca").value + " " + document.getElementById("modelo").value,
        cor:          document.getElementById("cor").value,
        combustivel:  document.getElementById("combustivel").value,
        numero_eixos: tipo === "caminhao" ? document.getElementById("eixos").value : null,
        peso_total:   tipo === "caminhao" ? document.getElementById("peso").value  : null
      })
    });
    const dados = await resposta.json();
    mostrarToast(dados.mensagem, resposta.ok ? "ok" : "erro");
    if (resposta.ok) { carregarVeiculos(); fecharCadastroVeiculo(); }
  } catch (e) { console.error(e); }
}

async function carregarVeiculos() {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const resposta = await fetch(API + "/veiculos", {
      headers: { "Authorization": "Bearer " + token }
    });
    const lista = await resposta.json();
    const select = document.getElementById("listaVeiculos");
    select.innerHTML = `<option value="">Selecione um veículo</option>`;
    lista.forEach(v => {
      const op = document.createElement("option");
      op.value = v.id;
      op.text  = `${v.tipo} — ${v.marca_modelo} (${v.placa})`;
      select.appendChild(op);
    });
  } catch (e) { console.error(e); }
}
