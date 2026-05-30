const API = "http://localhost:3000";

// ── ESTADO GLOBAL ─────────────────────────────────────────────────────────────
let map, rotaControle, postosCamada, marcadorOrigem, marcadorDestino;
let precoCombustivelAtual = null;
let paradasExtras = []; // paradas opcionais adicionadas pelo usuário
let poiCamada = null;   // camada para restaurantes/hospedagens

// ── INIT ──────────────────────────────────────────────────────────────────────
window.onload = () => {
  carregarVeiculos();
  configurarAutocomplete("origem");
  configurarAutocomplete("destino");
  atualizarNavLogin();
  iniciarTema();
};

// ══════════════════════════════════════════════════════════════════════════════
//  TEMA CLARO / ESCURO
// ══════════════════════════════════════════════════════════════════════════════
function iniciarTema() {
  const salvo = localStorage.getItem("tema") || "dark";
  aplicarTema(salvo);
}

function aplicarTema(tema) {
  document.documentElement.setAttribute("data-tema", tema);
  localStorage.setItem("tema", tema);
  const btn = document.getElementById("btnTema");
  if (btn) btn.textContent = tema === "dark" ? "☀️" : "🌙";
}

function alternarTema() {
  const atual = document.documentElement.getAttribute("data-tema") || "dark";
  aplicarTema(atual === "dark" ? "light" : "dark");
}

// ══════════════════════════════════════════════════════════════════════════════
//  PREÇO DO COMBUSTÍVEL VIA API
// ══════════════════════════════════════════════════════════════════════════════
async function buscarPrecoCombustivel(tipoCombustivel) {
  const elStatus = document.getElementById("precoStatus");
  const elValor  = document.getElementById("precoValor");

  if (elStatus) elStatus.textContent = "Buscando preço...";

  const tipoParaNome = {
    "Gasolina": "gasolina",
    "Etanol":   "etanol",
    "Diesel":   "diesel",
    "Flex":     "gasolina"
  };

  const tipo = tipoParaNome[tipoCombustivel] || "gasolina";

  try {
    const url = `https://dadosabertos.anp.gov.br/api/3/action/datastore_search?resource_id=bf2e8443-f042-4c49-8d85-0c93bb38e9a8&limit=1&sort=DATA_INICIAL+desc&q=${encodeURIComponent(tipo === "gasolina" ? "GASOLINA COMUM" : tipo === "diesel" ? "ÓLEO DIESEL" : "ETANOL HIDRATADO")}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data = await r.json();
      const records = data?.result?.records;
      if (records?.length && records[0]["PREÇO MÉDIO REVENDA"]) {
        const preco = parseFloat(records[0]["PREÇO MÉDIO REVENDA"].toString().replace(",", "."));
        if (!isNaN(preco) && preco > 0) {
          precoCombustivelAtual = preco;
          atualizarExibicaoPreco(preco, tipoCombustivel, "ANP");
          return preco;
        }
      }
    }
  } catch (e) {
    console.warn("API ANP falhou, usando fallback:", e);
  }

  const precosFallback = {
    "Gasolina": 5.89,
    "Etanol":   3.94,
    "Diesel":   6.21,
    "Flex":     5.89
  };

  const preco = precosFallback[tipoCombustivel] || 5.89;
  precoCombustivelAtual = preco;
  atualizarExibicaoPreco(preco, tipoCombustivel, "média nacional");
  return preco;
}

function atualizarExibicaoPreco(preco, tipo, fonte) {
  const elStatus = document.getElementById("precoStatus");
  const elValor  = document.getElementById("precoValor");
  if (elValor)  elValor.textContent  = `R$ ${preco.toFixed(3)}`;
  if (elStatus) elStatus.textContent = `${tipo} · ${fonte}`;
}

async function aoSelecionarVeiculo() {
  const select    = document.getElementById("listaVeiculos");
  const veiculoId = select.value;
  if (!veiculoId) return;

  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const r    = await fetch(API + "/veiculos", { headers: { "Authorization": "Bearer " + token } });
    const lista = await r.json();
    const veiculo = lista.find(v => String(v.id) === String(veiculoId));
    if (veiculo?.combustivel) {
      await buscarPrecoCombustivel(veiculo.combustivel);
    }
  } catch (e) { console.error(e); }
}

// ── MOSTRAR MAPA ──────────────────────────────────────────────────────────────
function mostrarMapa() {
  const token = localStorage.getItem("token");
  if (!token) { abrirLogin(); return; }

  document.querySelector(".hero").style.display = "none";
  document.getElementById("app").style.display  = "block";

  if (!map) {
    map = L.map("map").setView([-15.78, -47.93], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap"
    }).addTo(map);
    postosCamada = L.layerGroup().addTo(map);
    poiCamada    = L.layerGroup().addTo(map);
  }

  setTimeout(() => map.invalidateSize(), 200);
}

// ── AUTOCOMPLETE ──────────────────────────────────────────────────────────────
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
      } catch (e) { console.error("Autocomplete erro:", e); }
    }, 400);
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !listEl.contains(e.target)) {
      listEl.style.display = "none";
    }
  });
}

// ── GEOCODE ───────────────────────────────────────────────────────────────────
async function geocodificar(texto) {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(texto)}&countrycodes=br&format=json&limit=1`,
    { headers: { "Accept-Language": "pt-BR" } }
  );
  const d = await r.json();
  if (!d.length) throw new Error(`Localização não encontrada no Brasil: "${texto}". Verifique se o destino está em território brasileiro.`);
  return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon), nome: d[0].display_name };
}

// ══════════════════════════════════════════════════════════════════════════════
//  PARADAS OPCIONAIS
// ══════════════════════════════════════════════════════════════════════════════
function adicionarParada() {
  const container = document.getElementById("paradasContainer");
  const idx = paradasExtras.length;
  paradasExtras.push({ lat: null, lon: null, valor: "" });

  const wrapper = document.createElement("div");
  wrapper.className = "field-group parada-item";
  wrapper.id = `parada-wrapper-${idx}`;
  wrapper.style.position = "relative";

  const label = document.createElement("label");
  label.textContent = `Parada ${idx + 1}`;

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:6px;align-items:center;";

  const input = document.createElement("input");
  input.id = `parada-${idx}`;
  input.placeholder = "Ex: Campinas, SP";
  input.autocomplete = "off";
  input.style.flex = "1";

  const btnRemover = document.createElement("button");
  btnRemover.textContent = "✕";
  btnRemover.style.cssText = "width:34px;min-width:34px;padding:0;height:36px;margin:0;flex-shrink:0;";
  btnRemover.title = "Remover parada";
  btnRemover.onclick = () => removerParada(idx, wrapper);

  row.appendChild(input);
  row.appendChild(btnRemover);
  wrapper.appendChild(label);
  wrapper.appendChild(row);
  container.appendChild(wrapper);

  // autocomplete para a parada
  configurarAutocompleteGenerico(input);
}

function configurarAutocompleteGenerico(input) {
  let debounceTimer;
  const listEl = document.createElement("ul");
  listEl.className = "autocomplete-list";
  input.parentNode.parentNode.appendChild(listEl);

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
      } catch (e) {}
    }, 400);
  });
  document.addEventListener("click", (e) => {
    if (!input.contains(e.target)) { listEl.style.display = "none"; }
  });
}

function removerParada(idx, wrapper) {
  wrapper.remove();
  paradasExtras.splice(idx, 1);
  // re-numerar labels
  document.querySelectorAll(".parada-item label").forEach((lbl, i) => {
    lbl.textContent = `Parada ${i + 1}`;
  });
}

function coletarParadas() {
  const paradas = [];
  document.querySelectorAll(".parada-item input").forEach(input => {
    if (input.value.trim()) {
      paradas.push({
        valor: input.value.trim(),
        lat: parseFloat(input.dataset.lat) || null,
        lon: parseFloat(input.dataset.lon) || null
      });
    }
  });
  return paradas;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PEDÁGIOS (estimativa via waypoints da rota)
// ══════════════════════════════════════════════════════════════════════════════
async function buscarPedagiosNoTrajeto(coords) {
  // Consulta a Overpass API por portais de pedágio próximos ao trajeto
  // Amostramos pontos da rota a cada ~30km para cobrir todo o trajeto
  const step = Math.max(1, Math.floor(coords.length / 20));
  const amostras = [];
  for (let i = 0; i < coords.length; i += step) amostras.push(coords[i]);
  if (amostras[amostras.length - 1] !== coords[coords.length - 1])
    amostras.push(coords[coords.length - 1]);

  const pedagios = [];
  try {
    // Busca pedagios ao longo do trajeto em grupos de pontos
    for (let i = 0; i < amostras.length; i++) {
      const [lat, lon] = amostras[i];
      const url = `https://overpass-api.de/api/interpreter?data=[out:json][timeout:10];node["barrier"="toll_booth"](around:800,${lat},${lon});out body 5;`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      if (d.elements) {
        d.elements.forEach(el => {
          // evitar duplicatas por proximidade
          const jaExiste = pedagios.some(p => Math.abs(p.lat - el.lat) < 0.01 && Math.abs(p.lon - el.lon) < 0.01);
          if (!jaExiste) pedagios.push(el);
        });
      }
    }
  } catch (e) { console.warn("Erro ao buscar pedágios:", e); }
  return pedagios;
}

// Estimativa de valor de pedágio por faixa (dados médios brasileiros 2024)
function estimarValorPedagio(pedagio) {
  const nome = (pedagio.tags?.name || pedagio.tags?.operator || "").toLowerCase();
  // Valores médios por categoria de rodovia
  if (nome.includes("br-") || nome.includes("federal")) return 12.50;
  if (nome.includes("sp") || nome.includes("rio") || nome.includes("mg")) return 9.80;
  return 8.50; // valor médio geral
}

// ══════════════════════════════════════════════════════════════════════════════
//  CALCULAR ROTA
// ══════════════════════════════════════════════════════════════════════════════
async function calcularRota() {
  const origemInput  = document.getElementById("origem");
  const destinoInput = document.getElementById("destino");
  const consumo      = parseFloat(document.getElementById("consumo").value);

  if (!origemInput.value || !destinoInput.value) {
    mostrarToast("Preencha origem e destino", "erro"); return;
  }
  if (!consumo || consumo <= 0) {
    mostrarToast("Informe o consumo (km/L)", "erro"); return;
  }

  let preco = precoCombustivelAtual;
  if (!preco) {
    mostrarToast("Buscando preço do combustível...", "ok");
    preco = await buscarPrecoCombustivel("Gasolina");
  }

  const btnCalc = document.querySelector(".btn-calcular");
  btnCalc.textContent = "Calculando...";
  btnCalc.disabled = true;

  try {
    let latO = parseFloat(origemInput.dataset.lat);
    let lonO = parseFloat(origemInput.dataset.lon);
    let latD = parseFloat(destinoInput.dataset.lat);
    let lonD = parseFloat(destinoInput.dataset.lon);

    if (!latO || !lonO) { const g = await geocodificar(origemInput.value);  latO = g.lat; lonO = g.lon; }
    if (!latD || !lonD) { const g = await geocodificar(destinoInput.value); latD = g.lat; lonD = g.lon; }

    // Coletar paradas opcionais
    const paradasColetadas = coletarParadas();
    const waypointsIntermedios = [];
    for (const p of paradasColetadas) {
      let lat = p.lat, lon = p.lon;
      if (!lat || !lon) {
        const g = await geocodificar(p.valor);
        lat = g.lat; lon = g.lon;
      }
      waypointsIntermedios.push({ lat, lon, nome: p.valor });
    }

    if (rotaControle)   { map.removeControl(rotaControle); rotaControle = null; }
    if (marcadorOrigem) { map.removeLayer(marcadorOrigem);  marcadorOrigem  = null; }
    if (marcadorDestino){ map.removeLayer(marcadorDestino); marcadorDestino = null; }
    postosCamada.clearLayers();
    poiCamada.clearLayers();

    // Montar waypoints para OSRM
    let wpts = `${lonO},${latO}`;
    waypointsIntermedios.forEach(wp => { wpts += `;${wp.lon},${wp.lat}`; });
    wpts += `;${lonD},${latD}`;

    const osrmUrl  = `https://router.project-osrm.org/route/v1/driving/${wpts}?overview=full&geometries=geojson&steps=true`;
    const osrmRes  = await fetch(osrmUrl);
    const osrmData = await osrmRes.json();

    if (!osrmData.routes || !osrmData.routes.length) {
      mostrarToast("Não foi possível traçar a rota. Verifique se as localidades estão no Brasil.", "erro");
      return;
    }

    const rota        = osrmData.routes[0];
    const distanciaKm = rota.distance / 1000;
    const duracaoMin  = rota.duration / 60;
    const litros      = distanciaKm / consumo;
    const custoCombus = litros * preco;
    const paradas     = Math.max(0, Math.floor(distanciaKm / 300)) + waypointsIntermedios.length;

    document.getElementById("cardDistancia").textContent   = distanciaKm.toFixed(1) + " km";
    document.getElementById("cardTempo").textContent       = formatarTempo(duracaoMin);
    document.getElementById("cardCombustivel").textContent = litros.toFixed(1) + " L";
    document.getElementById("cardParadas").textContent     = paradas > 0 ? paradas + " parada(s)" : "Sem paradas";
    document.getElementById("cardCusto").textContent       = "R$ " + custoCombus.toFixed(2);

    const coords = rota.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const polilinha = L.polyline(coords, { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(map);
    map.fitBounds(polilinha.getBounds(), { padding: [60, 60] });

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

    // Marcadores de paradas opcionais
    waypointsIntermedios.forEach((wp, i) => {
      const iconParada = L.divIcon({
        html: `<div class="marker-pin parada-wp"><span>${i+1}</span></div>`,
        className: "", iconSize: [32, 32], iconAnchor: [16, 32]
      });
      L.marker([wp.lat, wp.lon], { icon: iconParada }).addTo(map)
        .bindPopup(`<b>Parada ${i+1}</b><br>${wp.nome.split(",")[0]}`);
    });

    // Buscar postos em todo o trajeto
    buscarPostosNoTrajeto(coords, distanciaKm);

    // Buscar e exibir pedágios
    btnCalc.textContent = "Buscando pedágios...";
    const pedagios = await buscarPedagiosNoTrajeto(coords);
    exibirPedagios(pedagios);

    mostrarToast("Rota calculada com sucesso!", "ok");

  } catch (e) {
    console.error(e);
    const msg = e.message || "Erro ao calcular rota";
    mostrarToast(msg, "erro");
  } finally {
    btnCalc.textContent = "Calcular custo";
    btnCalc.disabled = false;
  }
}

// ── EXIBIR PEDÁGIOS ───────────────────────────────────────────────────────────
function exibirPedagios(pedagios) {
  const iconPedagio = L.divIcon({
    html: `<div class="marker-pedagio">🛣️</div>`,
    className: "", iconSize: [30, 30], iconAnchor: [15, 15]
  });

  let totalPedagios = 0;

  pedagios.forEach(p => {
    const nome  = p.tags?.name || p.tags?.operator || "Pedágio";
    const valor = estimarValorPedagio(p);
    totalPedagios += valor;

    L.marker([p.lat, p.lon], { icon: iconPedagio })
      .addTo(postosCamada)
      .bindPopup(`<b>🛣️ ${nome}</b><br><small>Valor estimado: <b>R$ ${valor.toFixed(2)}</b></small>`);
  });

  // Atualizar card de pedágios
  const cardEl = document.getElementById("cardPedagios");
  if (cardEl) {
    cardEl.textContent = pedagios.length > 0
      ? `R$ ${totalPedagios.toFixed(2)} (${pedagios.length})`
      : "Nenhum";
  }
}

// ── FORMATAR TEMPO ────────────────────────────────────────────────────────────
function formatarTempo(minutos) {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

// ── POSTOS NO TRAJETO ─────────────────────────────────────────────────────────
async function buscarPostosNoTrajeto(coords, distanciaKm) {
  // Amostrar pontos ao longo de todo o trajeto para cobertura completa
  const numAmostras = Math.min(8, Math.max(3, Math.floor(distanciaKm / 80)));
  const step = Math.floor(coords.length / numAmostras);
  const amostras = [];
  for (let i = 0; i < coords.length; i += step) amostras.push(coords[i]);

  const raio = Math.min(Math.max(distanciaKm * 5, 4000), 25000);
  const postosEncontrados = [];

  const iconPosto = L.divIcon({
    html: `<div class="marker-posto">⛽</div>`,
    className: "", iconSize: [30, 30], iconAnchor: [15, 15]
  });

  for (const [lat, lon] of amostras) {
    try {
      const url = `https://overpass-api.de/api/interpreter?data=[out:json][timeout:15];node["amenity"="fuel"](around:${raio},${lat},${lon});out body 8;`;
      const r   = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const d   = await r.json();
      if (!d.elements) continue;
      d.elements.forEach(posto => {
        const jaExiste = postosEncontrados.some(p => Math.abs(p.lat - posto.lat) < 0.008 && Math.abs(p.lon - posto.lon) < 0.008);
        if (!jaExiste) {
          postosEncontrados.push(posto);
          const nome = posto.tags?.name || posto.tags?.brand || "Posto de Combustível";
          L.marker([posto.lat, posto.lon], { icon: iconPosto })
            .addTo(postosCamada)
            .bindPopup(`<b>⛽ ${nome}</b>`);
        }
      });
    } catch (e) { console.warn("Erro ponto posto:", e); }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MINI-ÍCONES POI (Alimentação & Hospedagem)
// ══════════════════════════════════════════════════════════════════════════════
async function buscarPOI(tipo) {
  const destinoInput = document.getElementById("destino");
  if (!destinoInput.dataset.lat && !destinoInput.value) {
    mostrarToast("Calcule uma rota primeiro", "erro"); return;
  }

  const btnAlim  = document.getElementById("btnAlimentacao");
  const btnHosp  = document.getElementById("btnHospedagem");
  const btnAtivo = tipo === "restaurant" ? btnAlim : btnHosp;

  // Toggle: se já está ativo, desligar
  if (btnAtivo.classList.contains("poi-ativo")) {
    btnAtivo.classList.remove("poi-ativo");
    // Remover apenas marcadores desse tipo
    poiCamada.eachLayer(l => {
      if (l._poiTipo === tipo) poiCamada.removeLayer(l);
    });
    return;
  }
  btnAtivo.classList.add("poi-ativo");

  // Buscar no destino e ao longo do trajeto
  const latD = parseFloat(destinoInput.dataset.lat);
  const lonD = parseFloat(destinoInput.dataset.lon);
  if (!latD || !lonD) { mostrarToast("Calcule uma rota primeiro", "erro"); return; }

  mostrarToast(tipo === "restaurant" ? "Buscando restaurantes..." : "Buscando hospedagens...", "ok");

  const amenityQuery = tipo === "restaurant"
    ? `"amenity"~"restaurant|cafe|fast_food|bar|food_court"`
    : `"tourism"~"hotel|hostel|motel|guest_house"`;

  const icone = tipo === "restaurant" ? "🍽️" : "🏨";
  const iconPOI = L.divIcon({
    html: `<div class="marker-poi">${icone}</div>`,
    className: "", iconSize: [30, 30], iconAnchor: [15, 15]
  });

  // Pontos de busca: destino + pontos intermediários do trajeto
  const pontosBusca = [[latD, lonD]];
  const origemInput = document.getElementById("origem");
  if (origemInput.dataset.lat && origemInput.dataset.lon) {
    const latO = parseFloat(origemInput.dataset.lat);
    const lonO = parseFloat(origemInput.dataset.lon);
    // ponto médio
    pontosBusca.push([(latO + latD) / 2, (lonO + lonD) / 2]);
  }

  for (const [lat, lon] of pontosBusca) {
    try {
      const url = `https://overpass-api.de/api/interpreter?data=[out:json][timeout:15];node[${amenityQuery}](around:5000,${lat},${lon});out body 10;`;
      const r   = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const d   = await r.json();
      if (!d.elements) continue;
      d.elements.slice(0, 10).forEach(el => {
        const nome = el.tags?.name || (tipo === "restaurant" ? "Restaurante" : "Hospedagem");
        const marker = L.marker([el.lat, el.lon], { icon: iconPOI })
          .addTo(poiCamada)
          .bindPopup(`<b>${icone} ${nome}</b><br><small>${tipo === "restaurant" ? "Alimentação" : "Hospedagem"}</small>`);
        marker._poiTipo = tipo;
      });
    } catch (e) { console.warn("Erro POI:", e); }
  }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function mostrarToast(msg, tipo = "ok") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className   = "toast " + (tipo === "erro" ? "toast-erro" : "toast-ok");
  toast.style.display = "block";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = "none"; }, 3500);
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function abrirLogin()  { document.getElementById("loginModal").style.display = "flex"; }
function fecharLogin() { document.getElementById("loginModal").style.display = "none"; }

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
  document.getElementById("app").style.display  = "none";
}

function atualizarNavLogin() {
  const token     = localStorage.getItem("token");
  const btnEntrar = document.getElementById("btnEntrar");
  const btnSair   = document.getElementById("btnSair");
  if (btnEntrar) btnEntrar.style.display = token ? "none"   : "inline";
  if (btnSair)   btnSair.style.display   = token ? "inline" : "none";
}

// ── CADASTRO ──────────────────────────────────────────────────────────────────
function abrirCadastro() {
  document.getElementById("loginModal").style.display    = "none";
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

// ══════════════════════════════════════════════════════════════════════════════
//  VEÍCULO — com marcas sugeridas por tipo
// ══════════════════════════════════════════════════════════════════════════════
const MARCAS_POR_TIPO = {
  carro: [
    "Toyota","Volkswagen","Chevrolet","Hyundai","Fiat","Jeep","Renault",
    "Honda","Ford","Nissan","Mitsubishi","Peugeot","Citroën","BMW","Mercedes-Benz",
    "Audi","Kia","Suzuki","Volvo","Outra"
  ],
  moto: [
    "Honda","Yamaha","Suzuki","Kawasaki","BMW","Harley-Davidson","Royal Enfield",
    "Triumph","Ducati","KTM","Dafra","Shineray","Outra"
  ],
  caminhao: [
    "Volkswagen","Mercedes-Benz","Scania","Volvo","DAF","MAN","Iveco",
    "Ford","Hyundai","Toyota","Outra"
  ]
};

function abrirCadastroVeiculo() {
  const token = localStorage.getItem("token");
  if (!token) { mostrarToast("Faça login primeiro", "erro"); return; }
  document.getElementById("veiculoModal").style.display = "flex";
  atualizarMarcasSugeridas();
}

function fecharCadastroVeiculo() {
  document.getElementById("veiculoModal").style.display = "none";
}

function mudarCampos() {
  const tipo = document.getElementById("tipoVeiculo").value;
  document.getElementById("camposCaminhao").style.display =
    tipo === "caminhao" ? "block" : "none";
  atualizarMarcasSugeridas();
}

function atualizarMarcasSugeridas() {
  const tipo   = document.getElementById("tipoVeiculo").value;
  const marcas = MARCAS_POR_TIPO[tipo] || MARCAS_POR_TIPO.carro;

  let container = document.getElementById("marcasSugeridas");
  if (!container) {
    container = document.createElement("div");
    container.id = "marcasSugeridas";
    container.className = "marcas-sugeridas";
    const marcaInput = document.getElementById("marca");
    marcaInput.parentNode.insertBefore(container, marcaInput.nextSibling);
  }

  container.innerHTML = `<p class="marcas-label">Marcas populares:</p><div class="marcas-chips">` +
    marcas.map(m => `<button type="button" class="chip-marca" onclick="selecionarMarca('${m}')">${m}</button>`).join("") +
    `</div>`;
}

function selecionarMarca(marca) {
  const input = document.getElementById("marca");
  if (marca === "Outra") {
    input.value = "";
    input.focus();
  } else {
    input.value = marca;
  }
  // highlight chip selecionado
  document.querySelectorAll(".chip-marca").forEach(c => {
    c.classList.toggle("chip-selecionado", c.textContent === marca);
  });
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

async function atualizarPrecoManual() {
  const select    = document.getElementById("listaVeiculos");
  const veiculoId = select.value;

  const btn = document.querySelector(".btn-atualizar-preco");
  if (btn) btn.style.transform = "rotate(360deg)";

  if (!veiculoId) {
    await buscarPrecoCombustivel("Gasolina");
  } else {
    await aoSelecionarVeiculo();
  }

  setTimeout(() => { if (btn) btn.style.transform = ""; }, 400);
}
