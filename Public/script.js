const API = "http://localhost:3000";

//MAPA

let map;
let rotaControle;
let postosCamada;


//MOSTRAR MAPA

function mostrarMapa(){

document.querySelector(".hero").style.display = "none";
document.getElementById("app").style.display = "block";

if(!map){

map = L.map('map').setView([-27.63, -52.27], 6);

L.tileLayer(
'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
{ maxZoom: 19 }
).addTo(map);

postosCamada = L.layerGroup().addTo(map);

}

setTimeout(() => {
map.invalidateSize();
}, 200);

}


//LOGIN

function abrirLogin(){

document.getElementById("loginModal").style.display = "flex";

}

async function login(){

let loginValue = document.getElementById("loginEmail").value;

let senha = document.getElementById("loginSenha").value;

try{

const resposta = await fetch(API + "/login", {

method:"POST",

headers:{
"Content-Type":"application/json"
},

body: JSON.stringify({
login: loginValue,
senha
})

});

const dados = await resposta.json();

if(!resposta.ok){
alert(dados.mensagem);
return;
}

localStorage.setItem("token", dados.token);

alert("Login realizado!");

document.getElementById("loginModal").style.display = "none";

carregarVeiculos();

}catch(erro){

console.log(erro);

}

}


//CADASTRO

function abrirCadastro(){

document.getElementById("loginModal").style.display = "none";

document.getElementById("cadastroModal").style.display = "flex";

}

function voltarLogin(){

document.getElementById("cadastroModal").style.display = "none";

document.getElementById("loginModal").style.display = "flex";

}

async function cadastrar(){

try{

const resposta = await fetch(API + "/usuario", {

method:"POST",

headers:{
"Content-Type":"application/json"
},

body: JSON.stringify({

nome: document.getElementById("nome").value,

data_nascimento:
document.getElementById("nascimento").value,

cpf: document.getElementById("cpf").value,

telefone:
document.getElementById("telefone").value,

email:
document.getElementById("email").value,

endereco:
document.getElementById("endereco").value,

senha:
document.getElementById("senha").value

})

});

const dados = await resposta.json();

alert(dados.mensagem);

if(resposta.ok){

voltarLogin();

}

}catch(erro){

console.log(erro);

}

}


//VEÍCULO

function abrirCadastroVeiculo(){

document.getElementById("veiculoModal").style.display = "flex";

}

function fecharCadastroVeiculo(){

document.getElementById("veiculoModal").style.display = "none";

}

function mudarCampos(){

let tipo = document.getElementById("tipoVeiculo").value;

document.getElementById("camposCaminhao").style.display =
(tipo === "caminhao") ? "block" : "none";

}


async function salvarVeiculo(){

const token = localStorage.getItem("token");

if(!token){
alert("Faça login primeiro");
return;
}

let tipo = document.getElementById("tipoVeiculo").value;

try{

const resposta = await fetch(API + "/veiculo", {

method:"POST",

headers:{
"Content-Type":"application/json",
"Authorization":"Bearer " + token
},

body: JSON.stringify({

tipo,

placa:
document.getElementById("placa").value,

marca_modelo:
document.getElementById("marca").value +
" " +
document.getElementById("modelo").value,

cor:
document.getElementById("cor").value,

combustivel:
document.getElementById("combustivel").value,

numero_eixos:
tipo === "caminhao"
? document.getElementById("eixos").value
: null,

peso_total:
tipo === "caminhao"
? document.getElementById("peso").value
: null

})

});

const dados = await resposta.json();

alert(dados.mensagem);

if(resposta.ok){

carregarVeiculos();

fecharCadastroVeiculo();

}

}catch(erro){

console.log(erro);

}

}


//CARREGAR VEÍCULOS 

async function carregarVeiculos(){

const token = localStorage.getItem("token");

if(!token) return;

try{

const resposta = await fetch(API + "/veiculos", {

headers:{
"Authorization":"Bearer " + token
}

});

const lista = await resposta.json();

let select =
document.getElementById("listaVeiculos");

select.innerHTML = "";

lista.forEach((v)=>{

let op = document.createElement("option");

op.value = v.id;

op.text =
v.tipo + " - " + v.marca_modelo;

select.appendChild(op);

});

}catch(erro){

console.log(erro);

}

}

window.onload = carregarVeiculos;
