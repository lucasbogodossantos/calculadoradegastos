const API = "http://localhost:3000";

// ── ESTADO GLOBAL ─────────────────────────────────────────────────────────────
let map, postosCamada, poiCamada, pedagiosCamada;
let marcadorOrigem, marcadorDestino;
let polilinhaAtual = null;
let paradasCount   = 0;
let precoCombustivelAtual = null;
let coordsRota = []; // guarda coords da última rota calculada

// ── MARCAS POR TIPO ───────────────────────────────────────────────────────────
const MARCAS = {
  carro:   ["Chevrolet","Fiat","Volkswagen","Ford","Toyota","Honda","Hyundai","Jeep","Renault","Nissan","Peugeot","Citroën","Mitsubishi","Kia","BMW","Mercedes-Benz","Audi","Volvo","Land Rover","Subaru"],
  moto:    ["Honda","Yamaha","Kawasaki","Suzuki","BMW","Ducati","Harley-Davidson","Royal Enfield","Dafra","Haojue","Shineray"],
  caminhao:["Volkswagen","Mercedes-Benz","Scania","Volvo","Iveco","DAF","MAN","Ford","Agrale","Internacional"]
};

// ── INIT ──────────────────────────────────────────────────────────────────────
window.onload = () => {
  carregarVeiculos();
  configurarAutocomplete("origem");
  configurarAutocomplete("destino");
  atualizarNavLogin();
  iniciarTema();
};

// ── TEMA ──────────────────────────────────────────────────────────────────────
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

// ── MOSTRAR MAPA ──────────────────────────────────────────────────────────────
function mostrarMapa() {
  if (!localStorage.getItem("token")) { abrirLogin(); return; }
  document.querySelector(".hero").style.display = "none";
  document.getElementById("app").style.display  = "block";
  if (!map) {
    map = L.map("map").setView([-15.78, -47.93], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap"
    }).addTo(map);
    postosCamada   = L.layerGroup().addTo(map);
    poiCamada      = L.layerGroup().addTo(map);
    pedagiosCamada = L.layerGroup().addTo(map);
  }
  setTimeout(() => map.invalidateSize(), 200);
}

// ── AUTOCOMPLETE GENÉRICO ─────────────────────────────────────────────────────
function configurarAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let timer;
  const listEl = document.createElement("ul");
  listEl.className = "autocomplete-list";
  input.parentNode.style.position = "relative";
  input.parentNode.appendChild(listEl);

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { fecharAC(listEl); return; }
    timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=br&format=json&addressdetails=1&limit=5`,
          { headers: { "Accept-Language": "pt-BR" } }
        );
        const data = await r.json();
        listEl.innerHTML = "";
        if (!data.length) { fecharAC(listEl); return; }
        data.forEach(item => {
          const li = document.createElement("li");
          li.textContent = item.display_name;
          li.addEventListener("mousedown", (e) => {
            e.preventDefault();
            input.value = item.display_name;
            input.dataset.lat = item.lat;
            input.dataset.lon = item.lon;
            fecharAC(listEl);
          });
          listEl.appendChild(li);
        });
        listEl.style.display = "block";
      } catch (e) { console.warn("AC:", e); }
    }, 380);
  });
  input.addEventListener("blur", () => setTimeout(() => fecharAC(listEl), 200));
}

// autocomplete para campos de parada
function configurarAutocompleteEl(input) {
  let timer;
  const listEl = document.createElement("ul");
  listEl.className = "autocomplete-list";
  input.parentNode.style.position = "relative";
  input.parentNode.appendChild(listEl);

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { fecharAC(listEl); return; }
    timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=br&format=json&limit=5`,
          { headers: { "Accept-Language": "pt-BR" } }
        );
        const data = await r.json();
        listEl.innerHTML = "";
        if (!data.length) { fecharAC(listEl); return; }
        data.forEach(item => {
          const li = document.createElement("li");
          li.textContent = item.display_name;
          li.addEventListener("mousedown", (e) => {
            e.preventDefault();
            input.value = item.display_name;
            input.dataset.lat = item.lat;
            input.dataset.lon = item.lon;
            fecharAC(listEl);
          });
          listEl.appendChild(li);
        });
        listEl.style.display = "block";
      } catch (e) {}
    }, 380);
  });
  input.addEventListener("blur", () => setTimeout(() => fecharAC(listEl), 200));
}

function fecharAC(listEl) { listEl.innerHTML = ""; listEl.style.display = "none"; }

// ── MARCAS DO VEÍCULO ─────────────────────────────────────────────────────────
function filtrarMarcas() {
  const tipo  = document.getElementById("tipoVeiculo").value;
  const input = document.getElementById("marca");
  const lista = document.getElementById("marcasSugestoes");
  const q     = input.value.trim().toLowerCase();
  lista.innerHTML = "";

  if (!q) { lista.style.display = "none"; return; }

  const sugestoes = (MARCAS[tipo] || MARCAS.carro)
    .filter(m => m.toLowerCase().includes(q))
    .slice(0, 6);

  if (!sugestoes.length) { lista.style.display = "none"; return; }

  sugestoes.forEach(m => {
    const li = document.createElement("li");
    li.textContent = m;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = m;
      lista.style.display = "none";
    });
    lista.appendChild(li);
  });
  lista.style.display = "block";
}

// ── PARADAS INTERMEDIÁRIAS ────────────────────────────────────────────────────
function adicionarParada() {
  const container = document.getElementById("paradasContainer");
  paradasCount++;
  const id  = `parada${paradasCount}`;
  const div = document.createElement("div");
  div.className = "field-group parada-item";
  div.id        = `wrap-${id}`;
  div.innerHTML = `
    <label>Parada ${paradasCount}</label>
    <div style="display:flex;gap:6px;align-items:center">
      <input id="${id}" placeholder="Ex: Curitiba, PR" autocomplete="off" style="flex:1">
      <button class="btn-remover-parada" onclick="removerParada('wrap-${id}')" title="Remover">✕</button>
    </div>
  `;
  container.appendChild(div);
  configurarAutocompleteEl(div.querySelector("input"));
}

function removerParada(wrapId) {
  const el = document.getElementById(wrapId);
  if (el) el.remove();
  // Re-numerar labels
  document.querySelectorAll(".parada-item label").forEach((lbl, i) => {
    lbl.textContent = `Parada ${i + 1}`;
  });
  paradasCount = document.querySelectorAll(".parada-item").length;
}

function getParadas() {
  const inputs = document.querySelectorAll(".parada-item input");
  return Array.from(inputs).map(inp => ({
    texto: inp.value.trim(),
    lat:   parseFloat(inp.dataset.lat) || null,
    lon:   parseFloat(inp.dataset.lon) || null
  })).filter(p => p.texto);
}

// ── GEOCODE fallback ──────────────────────────────────────────────────────────
async function geocodificar(texto) {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(texto)}&countrycodes=br&format=json&limit=1`,
    { headers: { "Accept-Language": "pt-BR" } }
  );
  const d = await r.json();
  if (!d.length) throw new Error(`Localização fora do Brasil ou não encontrada: "${texto}"`);
  return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) };
}

// ── PREÇO AUTOMÁTICO ──────────────────────────────────────────────────────────
async function buscarPrecoCombustivel(tipoCombustivel) {
  const elStatus = document.getElementById("precoStatus");
  const elValor  = document.getElementById("precoValor");
  if (elStatus) elStatus.textContent = "Buscando preço...";

  const tipoParaNome = { "Gasolina":"gasolina","Etanol":"etanol","Diesel":"diesel","Flex":"gasolina" };
  const tipo = tipoParaNome[tipoCombustivel] || "gasolina";

  try {
    const qmap = { "gasolina":"GASOLINA COMUM","diesel":"ÓLEO DIESEL","etanol":"ETANOL HIDRATADO" };
    const url = `https://dadosabertos.anp.gov.br/api/3/action/datastore_search?resource_id=bf2e8443-f042-4c49-8d85-0c93bb38e9a8&limit=1&sort=DATA_INICIAL+desc&q=${encodeURIComponent(qmap[tipo]||"GASOLINA COMUM")}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data = await r.json();
      const rec  = data?.result?.records?.[0];
      if (rec?.["PREÇO MÉDIO REVENDA"]) {
        const preco = parseFloat(String(rec["PREÇO MÉDIO REVENDA"]).replace(",", "."));
        if (!isNaN(preco) && preco > 0) {
          precoCombustivelAtual = preco;
          if (elValor)  elValor.textContent  = `R$ ${preco.toFixed(3)}`;
          if (elStatus) elStatus.textContent = `${tipoCombustivel} · ANP`;
          return preco;
        }
      }
    }
  } catch (e) { console.warn("API ANP:", e); }

  const fallback = { "Gasolina":5.89,"Etanol":3.94,"Diesel":6.21,"Flex":5.89 };
  const preco = fallback[tipoCombustivel] || 5.89;
  precoCombustivelAtual = preco;
  if (elValor)  elValor.textContent  = `R$ ${preco.toFixed(3)}`;
  if (elStatus) elStatus.textContent = `${tipoCombustivel} · média nacional`;
  return preco;
}

async function aoSelecionarVeiculo() {
  const veiculoId = document.getElementById("listaVeiculos").value;
  if (!veiculoId) return;
  const token = localStorage.getItem("token");
  if (!token) return;
  try {
    const r    = await fetch(API + "/veiculos", { headers: { "Authorization": "Bearer " + token } });
    const lista = await r.json();
    const v = lista.find(v => String(v.id) === String(veiculoId));
    if (v?.combustivel) await buscarPrecoCombustivel(v.combustivel);
  } catch (e) { console.error(e); }
}

async function atualizarPrecoManual() {
  const btn = document.querySelector(".btn-atualizar-preco");
  if (btn) btn.style.transform = "rotate(360deg)";
  const veiculoId = document.getElementById("listaVeiculos").value;
  if (veiculoId) await aoSelecionarVeiculo();
  else await buscarPrecoCombustivel("Gasolina");
  setTimeout(() => { if (btn) btn.style.transform = ""; }, 400);
}

// ── CALCULAR ROTA ─────────────────────────────────────────────────────────────
async function calcularRota() {
  const origemEl  = document.getElementById("origem");
  const destinoEl = document.getElementById("destino");
  const consumo   = parseFloat(document.getElementById("consumo").value);

  if (!origemEl.value || !destinoEl.value) {
    mostrarToast("Preencha origem e destino", "erro"); return;
  }
  if (!consumo || consumo <= 0) {
    mostrarToast("Informe o consumo (km/L)", "erro"); return;
  }

  let preco = precoCombustivelAtual;
  if (!preco) preco = await buscarPrecoCombustivel("Gasolina");

  const btn = document.querySelector(".btn-calcular");
  btn.textContent = "Calculando..."; btn.disabled = true;

  try {
    // ── 1. Resolver coordenadas de todos os pontos ──
    let latO = parseFloat(origemEl.dataset.lat),  lonO = parseFloat(origemEl.dataset.lon);
    let latD = parseFloat(destinoEl.dataset.lat), lonD = parseFloat(destinoEl.dataset.lon);

    if (!latO) { const g = await geocodificar(origemEl.value);  latO = g.lat; lonO = g.lon; }
    if (!latD) { const g = await geocodificar(destinoEl.value); latD = g.lat; lonD = g.lon; }

    // Resolver paradas intermediárias
    const paradas = getParadas();
    for (const p of paradas) {
      if (!p.lat) {
        const g = await geocodificar(p.texto);
        p.lat = g.lat; p.lon = g.lon;
      }
    }

    // ── 2. Montar waypoints para OSRM ──
    const waypoints = [
      `${lonO},${latO}`,
      ...paradas.map(p => `${p.lon},${p.lat}`),
      `${lonD},${latD}`
    ].join(";");

    // ── 3. Limpar camadas ──
    if (polilinhaAtual)  { map.removeLayer(polilinhaAtual);  polilinhaAtual  = null; }
    if (marcadorOrigem)  { map.removeLayer(marcadorOrigem);  marcadorOrigem  = null; }
    if (marcadorDestino) { map.removeLayer(marcadorDestino); marcadorDestino = null; }
    postosCamada.clearLayers();
    poiCamada.clearLayers();
    pedagiosCamada.clearLayers();

    // ── 4. OSRM ──
    const osrmRes  = await fetch(`https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`);
    const osrmData = await osrmRes.json();

    if (!osrmData.routes?.length || osrmData.code !== "Ok") {
      mostrarToast("Não foi possível traçar a rota. Verifique se os locais estão no Brasil.", "erro");
      return;
    }

    const rota        = osrmData.routes[0];
    const distanciaKm = rota.distance / 1000;
    const duracaoMin  = rota.duration / 60;
    const litros      = distanciaKm / consumo;
    const custoTotal  = litros * preco;
    const nParadas    = paradas.length;

    // ── 5. Cards ──
    document.getElementById("cardDistancia").textContent   = distanciaKm.toFixed(1) + " km";
    document.getElementById("cardTempo").textContent       = formatarTempo(duracaoMin);
    document.getElementById("cardCombustivel").textContent = litros.toFixed(1) + " L";
    document.getElementById("cardParadas").textContent     = nParadas ? nParadas + " parada(s)" : "Direto";
    document.getElementById("cardPedagios").textContent    = "Buscando...";
    document.getElementById("cardCusto").textContent       = "R$ " + custoTotal.toFixed(2);

    // ── 6. Rota no mapa ──
    coordsRota = rota.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    polilinhaAtual = L.polyline(coordsRota, { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(map);
    map.fitBounds(polilinhaAtual.getBounds(), { padding: [70, 70] });

    // Marcadores
    marcadorOrigem = L.marker([latO, lonO], {
      icon: L.divIcon({ html: `<div class="marker-pin origem"><span>A</span></div>`, className: "", iconSize:[36,36], iconAnchor:[18,36] })
    }).addTo(map).bindPopup(`<b>Origem</b><br>${origemEl.value.split(",")[0]}`).openPopup();

    // Marcadores de parada
    paradas.forEach((p, i) => {
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({ html: `<div class="marker-pin parada-marker"><span>${i+1}</span></div>`, className:"", iconSize:[36,36], iconAnchor:[18,36] })
      }).addTo(map).bindPopup(`<b>Parada ${i+1}</b><br>${p.texto.split(",")[0]}`);
    });

    marcadorDestino = L.marker([latD, lonD], {
      icon: L.divIcon({ html: `<div class="marker-pin destino"><span>B</span></div>`, className:"", iconSize:[36,36], iconAnchor:[18,36] })
    }).addTo(map).bindPopup(`<b>Destino</b><br>${destinoEl.value.split(",")[0]}`);

    // ── 7. Postos em todo o trajeto ──
    buscarPostosTodoTrajeto(coordsRota, distanciaKm);

    // ── 8. Pedágios ──
    buscarPedagios(coordsRota);

    mostrarToast("Rota calculada com sucesso!", "ok");

  } catch (e) {
    console.error(e);
    // Erro amigável para locais fora do Brasil
    if (e.message?.includes("fora do Brasil") || e.message?.includes("não encontrada")) {
      mostrarToast("⚠️ " + e.message, "erro");
    } else {
      mostrarToast("Não foi possível encontrar o trajeto. Verifique se os locais estão no Brasil.", "erro");
    }
  } finally {
    btn.textContent = "Calcular custo"; btn.disabled = false;
  }
}

// ── POSTOS EM TODO O TRAJETO ──────────────────────────────────────────────────
// Estratégia: monta UMA ÚNICA query Overpass com várias cláusulas around:,
// uma para cada ponto amostrado ao longo da rota — igual aos pedágios.
// Evita o limite de requisições concorrentes da Overpass pública (que fazia
// a maioria dos lotes paralelos falharem silenciosamente).
async function buscarPostosTodoTrajeto(coords, distanciaKm) {
  const iconPosto = L.divIcon({
    html: `<div class="marker-posto">⛽</div>`,
    className: "", iconSize:[28,28], iconAnchor:[14,14]
  });

  // 1 ponto a cada ~40km, mínimo 5, máximo 20
  const numPontos = Math.min(20, Math.max(5, Math.ceil(distanciaKm / 40)));
  const step      = Math.floor(coords.length / numPontos);
  const pontos    = [];
  for (let i = 0; i < numPontos; i++) {
    pontos.push(coords[Math.min(i * step, coords.length - 1)]);
  }
  // Garante que o ponto final está incluído
  pontos.push(coords[coords.length - 1]);

  const raio  = 3000; // 3km por ponto — mantém próximo à via
  const visto = new Set();

  // Monta uma única query com uma cláusula around: por ponto amostrado
  const clausulas = pontos.map(([lat, lon]) =>
    `node["amenity"="fuel"](around:${raio},${lat.toFixed(5)},${lon.toFixed(5)});` +
    `way["amenity"="fuel"](around:${raio},${lat.toFixed(5)},${lon.toFixed(5)});`
  ).join("");

  const query = `[out:json][timeout:30];(${clausulas});out center;`;

  try {
    const r    = await fetch("https://overpass-api.de/api/interpreter", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    "data=" + encodeURIComponent(query)
    });
    const data = await r.json();
    if (!data.elements?.length) return;

    data.elements.forEach(p => {
      const plat = p.lat ?? p.center?.lat;
      const plon = p.lon ?? p.center?.lon;
      if (!plat || !plon) return;

      const key = plat.toFixed(4) + "," + plon.toFixed(4);
      if (visto.has(key)) return;
      visto.add(key);

      const nome   = p.tags?.name || p.tags?.brand || "Posto de Combustível";
      const cidade = p.tags?.["addr:city"] ? "<br><small>" + p.tags["addr:city"] + "</small>" : "";
      L.marker([plat, plon], { icon: iconPosto })
        .addTo(postosCamada)
        .bindPopup("<b>⛽ " + nome + "</b>" + cidade);
    });
  } catch (e) { console.warn("Postos:", e); }
}

// ── PEDÁGIOS ──────────────────────────────────────────────────────────────────
// Estratégia: usa a polyline real da rota via Overpass `poly:` para buscar
// toll_booth e barrier=toll somente dentro do corredor da via, sem depender
// de raio por ponto que erra facilmente.
async function buscarPedagios(coords) {
  const cardPedagio = document.getElementById("cardPedagios");

  // Simplifica a polyline para no máximo 200 pontos (limite da Overpass poly:)
  // — pega pontos igualmente espaçados
  const MAX_POLY = 180;
  let pontosPoly = coords;
  if (coords.length > MAX_POLY) {
    const step = Math.floor(coords.length / MAX_POLY);
    pontosPoly = [];
    for (let i = 0; i < coords.length; i += step) pontosPoly.push(coords[i]);
    // garante que o último ponto está incluído
    if (pontosPoly[pontosPoly.length - 1] !== coords[coords.length - 1]) {
      pontosPoly.push(coords[coords.length - 1]);
    }
  }

  // Formata como string "lat lon lat lon ..." exigido pela Overpass poly:
  const polyStr = pontosPoly.map(([lat, lon]) => `${lat.toFixed(5)} ${lon.toFixed(5)}`).join(" ");

  const iconPedagio = L.divIcon({
    html: `<div class="marker-pedagio">🛣️</div>`,
    className: "", iconSize:[32,32], iconAnchor:[16,16]
  });

  let totalPedagios = 0;
  let totalValor    = 0;
  const pedVisto    = new Set();
  const valorPadrao = 8.50; // R$ estimativa média Brasil por praça

  // Uma única query cobrindo TODA a polyline da rota
  // Busca tanto toll_booth quanto highway=toll_gantry (praças eletrônicas)
  const query = `[out:json][timeout:30];
(
  node["barrier"="toll_booth"](poly:"${polyStr}");
  node["highway"="toll_gantry"](poly:"${polyStr}");
  node["barrier"="toll"](poly:"${polyStr}");
);
out body;`;

  try {
    const r    = await fetch(`https://overpass-api.de/api/interpreter`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`
    });
    const data = await r.json();

    if (data.elements?.length) {
      data.elements.forEach(p => {
        const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
        if (pedVisto.has(key)) return;
        pedVisto.add(key);
        totalPedagios++;

        // fee pode estar em tags como "fee", "charge", "toll" ou "toll:hgv"
        const feeRaw = p.tags?.fee || p.tags?.charge || p.tags?.toll || "";
        const feeNum = parseFloat(String(feeRaw).replace(",", "."));
        const valor  = !isNaN(feeNum) && feeNum > 0 ? feeNum : valorPadrao;
        totalValor  += valor;

        const nome = p.tags?.name || p.tags?.operator || p.tags?.ref || "Pedágio";
        L.marker([p.lat, p.lon], { icon: iconPedagio })
          .addTo(pedagiosCamada)
          .bindPopup(`<b>🛣️ ${nome}</b><br><small>Estimativa: R$ ${valor.toFixed(2)}</small>`);
      });
    }
  } catch (e) {
    console.warn("Pedágios query:", e);
  }

  // Atualizar card
  if (totalPedagios === 0) {
    cardPedagio.textContent = "Nenhum";
  } else {
    cardPedagio.textContent =
      `${totalPedagios} praça(s) · R$ ${totalValor.toFixed(2)}`;
  }
}

// ── ALIMENTAÇÃO E HOSPEDAGEM (FAB) ────────────────────────────────────────────
// Usa around: em pontos amostrados da rota (sem poly: que não funciona em linha aberta).
// Processa em lotes paralelos. Aparece direto no mapa, sem modal.
async function buscarPOI(tipo) {
  if (!coordsRota.length) {
    mostrarToast("Calcule uma rota primeiro", "erro"); return;
  }

  // Configurações por tipo — amenities separadas para não misturar
  const config = {
    alimentacao: {
      label: "restaurantes",
      icon:  "🍽️",
      fabId: "fabAlimentacao",
      // amenity= comida — regex ~"..." para pegar todos em uma query
      queryFn: (lat, lon, raio) =>
        `[out:json][timeout:20];(node["amenity"~"^(restaurant|fast_food|cafe|food_court|bar|bakery|snack_bar)$"](around:${raio},${lat},${lon});way["amenity"~"^(restaurant|fast_food|cafe|food_court|bar|bakery|snack_bar)$"](around:${raio},${lat},${lon}););out center 40;`,
      labelMap: { restaurant:"Restaurante", fast_food:"Fast Food", cafe:"Café", food_court:"Praça Alim.", bar:"Bar", bakery:"Padaria", snack_bar:"Lanchonete" }
    },
    hospedagem: {
      label: "hospedagens",
      icon:  "🏨",
      fabId: "fabHospedagem",
      // No OSM Brasil: tourism=hotel é mais comum que amenity=hotel
      // Inclui AMBOS amenity= e tourism= para máxima cobertura
      queryFn: (lat, lon, raio) =>
        `[out:json][timeout:20];(node["amenity"~"^(hotel|motel|hostel)$"](around:${raio},${lat},${lon});way["amenity"~"^(hotel|motel|hostel)$"](around:${raio},${lat},${lon});node["tourism"~"^(hotel|motel|hostel|guest_house)$"](around:${raio},${lat},${lon});way["tourism"~"^(hotel|motel|hostel|guest_house)$"](around:${raio},${lat},${lon});node["tourism"="pousada"](around:${raio},${lat},${lon});way["tourism"="pousada"](around:${raio},${lat},${lon}););out center 40;`,
      labelMap: { hotel:"Hotel", motel:"Motel", hostel:"Hostel", guest_house:"Pousada", pousada:"Pousada" }
    }
  }[tipo];

  if (!config) return;

  const fab = document.getElementById(config.fabId);
  if (fab) { fab.disabled = true; fab.style.opacity = "0.5"; }
  mostrarToast("Buscando " + config.label + "...", "ok");

  // Camada própria por tipo — não interfere com a do outro tipo
  if (!window._poiCamadas) window._poiCamadas = {};
  if (window._poiCamadas[tipo]) {
    window._poiCamadas[tipo].clearLayers();
  } else {
    window._poiCamadas[tipo] = L.layerGroup().addTo(map);
  }
  const camada = window._poiCamadas[tipo];

  const iconPOI = L.divIcon({
    html: "<div class=\"marker-poi\">" + config.icon + "</div>",
    className: "", iconSize:[28,28], iconAnchor:[14,14]
  });

  // Amostrar pontos — 1 a cada ~50km, mínimo 6, máximo 20
  // Inclui obrigatoriamente início, meio e fim para rotas curtas
  const distKm    = coordsRota.length; // aproximação
  const numPontos = Math.min(20, Math.max(6, Math.ceil(coordsRota.length / 50)));
  const step      = Math.floor(coordsRota.length / numPontos);
  const pontos    = [];
  for (let i = 0; i < numPontos; i++) {
    pontos.push(coordsRota[Math.min(i * step, coordsRota.length - 1)]);
  }
  pontos.push(coordsRota[coordsRota.length - 1]); // garante o destino

  const raio  = 5000; // 5km — cobre a cidade mais próxima da via
  const visto = new Set();
  let   total = 0;

  // Lotes de 3 em paralelo
  const LOTE = 3;
  for (let i = 0; i < pontos.length; i += LOTE) {
    const lote = pontos.slice(i, i + LOTE);
    await Promise.all(lote.map(async ([lat, lon]) => {
      const query = config.queryFn(lat, lon, raio);
      try {
        const r    = await fetch("https://overpass-api.de/api/interpreter", {
          method:  "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body:    "data=" + encodeURIComponent(query)
        });
        const data = await r.json();
        if (!data.elements?.length) return;

        data.elements.forEach(el => {
          const elat = el.lat ?? el.center?.lat;
          const elon = el.lon ?? el.center?.lon;
          if (!elat || !elon) return;

          const key = elat.toFixed(3) + "," + elon.toFixed(3);
          if (visto.has(key)) return;
          visto.add(key);
          total++;

          const tag   = el.tags?.amenity || el.tags?.tourism || "";
          const nome  = el.tags?.name || config.labelMap[tag] || "Local";
          const label = config.labelMap[tag] || tag;
          const cid   = el.tags?.["addr:city"] || el.tags?.["addr:suburb"] || "";

          L.marker([elat, elon], { icon: iconPOI })
            .addTo(camada)
            .bindPopup("<b>" + config.icon + " " + nome + "</b>" +
              (label ? "<br><small>" + label + (cid ? " · " + cid : "") + "</small>" : ""));
        });
      } catch (e) { console.warn("POI:", e); }
    }));
  }

  if (fab) { fab.disabled = false; fab.style.opacity = ""; }
  mostrarToast(
    total > 0 ? total + " " + config.label + " encontrada(s) no mapa" : "Nenhuma " + config.label + " encontrada no trajeto",
    total > 0 ? "ok" : "erro"
  );
}

// ── FORMATAR TEMPO ────────────────────────────────────────────────────────────
function formatarTempo(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h === 0 ? `${m} min` : `${h}h ${m}min`;
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function mostrarToast(msg, tipo = "ok") {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.textContent  = msg;
  el.className    = "toast " + (tipo === "erro" ? "toast-erro" : "toast-ok");
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, 4000);
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function abrirLogin()  { document.getElementById("loginModal").style.display = "flex"; }
function fecharLogin() { document.getElementById("loginModal").style.display = "none"; }

async function login() {
  const loginValue = document.getElementById("loginEmail").value;
  const senha      = document.getElementById("loginSenha").value;
  try {
    const r = await fetch(API + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: loginValue, senha })
    });
    const d = await r.json();
    if (!r.ok) { mostrarToast(d.mensagem, "erro"); return; }
    localStorage.setItem("token", d.token);
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
  const token = localStorage.getItem("token");
  const be = document.getElementById("btnEntrar");
  const bs = document.getElementById("btnSair");
  if (be) be.style.display = token ? "none"   : "inline";
  if (bs) bs.style.display = token ? "inline" : "none";
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
    const r = await fetch(API + "/usuario", {
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
    const d = await r.json();
    mostrarToast(d.mensagem, r.ok ? "ok" : "erro");
    if (r.ok) voltarLogin();
  } catch (e) { console.error(e); }
}

// ── VEÍCULO ───────────────────────────────────────────────────────────────────
function abrirCadastroVeiculo() {
  if (!localStorage.getItem("token")) { mostrarToast("Faça login primeiro", "erro"); return; }
  document.getElementById("veiculoModal").style.display = "flex";
}
function fecharCadastroVeiculo() {
  document.getElementById("veiculoModal").style.display = "none";
}
function mudarCampos() {
  const tipo = document.getElementById("tipoVeiculo").value;
  document.getElementById("camposCaminhao").style.display = tipo === "caminhao" ? "block" : "none";
  // Limpar marca ao trocar tipo
  document.getElementById("marca").value = "";
  document.getElementById("marcasSugestoes").innerHTML = "";
  document.getElementById("marcasSugestoes").style.display = "none";
}

async function salvarVeiculo() {
  const token = localStorage.getItem("token");
  if (!token) { mostrarToast("Faça login primeiro", "erro"); return; }
  const tipo = document.getElementById("tipoVeiculo").value;
  try {
    const r = await fetch(API + "/veiculo", {
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
    const d = await r.json();
    mostrarToast(d.mensagem, r.ok ? "ok" : "erro");
    if (r.ok) { carregarVeiculos(); fecharCadastroVeiculo(); }
  } catch (e) { console.error(e); }
}

async function carregarVeiculos() {
  const token = localStorage.getItem("token");
  if (!token) return;
  try {
    const r    = await fetch(API + "/veiculos", { headers: { "Authorization": "Bearer " + token } });
    const lista = await r.json();
    const sel  = document.getElementById("listaVeiculos");
    sel.innerHTML = `<option value="">Selecione um Veículo</option>`;
    lista.forEach(v => {
      const op = document.createElement("option");
      op.value = v.id;
      op.text  = `${v.tipo} — ${v.marca_modelo} (${v.placa})`;
      sel.appendChild(op);
    });
  } catch (e) { console.error(e); }
}
