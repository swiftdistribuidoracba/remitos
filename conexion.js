// ===== Conexión con la planilla de Google (reemplaza el almacenamiento de Claude) =====
// Misma interfaz que usaba la app (claude.use('db') / 'downloads'), así el resto del código no cambia.
(function(){
  const API='https://script.google.com/macros/s/AKfycbxtk5PNEniHdvozU1Ncz2S_r6fBe-uF5J1sQjS4x73WuBzUc2ln7t45Y_eLzfz3KAnU/exec';
  const ls={get:k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}}};

  // ---- clave de acceso: se escribe una vez por celular y queda guardada (no está en el código publicado)
  const clave=()=>ls.get('swift_clave')||'';
  function pedirClave(mal){
    if(document.getElementById('acceso'))return;
    const d=document.createElement('div');d.id='acceso';
    d.innerHTML=`<div class="acc-box"><img src="icon-192.png" alt="" width="72" height="72"><h2>Remitos Swift</h2>
      <p>${mal&&clave()?'La clave no es correcta.':'Escribí la clave de acceso.'} Se pide una sola vez en este equipo.</p>
      <input id="acc-in" type="password" autocomplete="current-password" placeholder="Clave de acceso"><button id="acc-ok">Entrar</button><p id="acc-msg"></p></div>`;
    document.body.appendChild(d);
    const ir=async()=>{const v=document.getElementById('acc-in').value.trim();if(!v)return;document.getElementById('acc-msg').textContent='Verificando…';
      ls.set('swift_clave',v);
      try{await bajar();d.remove();subir()}catch(e){document.getElementById('acc-msg').textContent=e&&e.message==='clave incorrecta'?'Clave incorrecta.':'No se pudo verificar (¿hay señal?).'}};
    document.getElementById('acc-ok').onclick=ir;document.getElementById('acc-in').onkeydown=e=>{if(e.key==='Enter')ir()};setTimeout(()=>document.getElementById('acc-in').focus(),100)}
  const st=document.createElement('style');st.textContent=`#acceso{position:fixed;inset:0;z-index:100;background:var(--bg,#f7f6f6);display:flex;align-items:center;justify-content:center;padding:20px}
  #acceso .acc-box{max-width:340px;width:100%;text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center}
  #acceso h2{margin:0;font:700 26px "Barlow Condensed",Arial,sans-serif;color:var(--brand,#c8102e);text-transform:uppercase}
  #acceso p{margin:0;color:var(--muted,#6f6566)}#acceso img{border-radius:16px}
  #acceso input{width:100%;font-size:18px;padding:12px;border-radius:8px;border:1px solid var(--line,#ddd);background:var(--card,#fff);color:var(--ink,#222)}
  #acceso button{width:100%;font-size:18px;padding:12px;border:0;border-radius:8px;background:var(--brand,#c8102e);color:#fff;font-weight:700}`;document.head.appendChild(st);

  async function api(accion,extra){
    if(!clave()){pedirClave(false);throw {code:'sin_clave',message:'falta la clave'}}
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({clave:clave(),accion},extra||{})),redirect:'follow'});
    if(!r.ok)throw {code:'red',message:'HTTP '+r.status};
    const j=await r.json(); if(!j.ok){if(j.error==='clave incorrecta'){pedirClave(true)}throw {code:'servidor',message:j.error||'error'}} return j;
  }

  // ---- datos en memoria (con copia en el teléfono para abrir sin señal)
  let S=ls.get('swift_cache')||{clientes:{},productos:{},costos:{},remitos:{},pedidos:{},meta:{contador:{n:0},lista:{precios:{}},pedidoClientes:{mapa:{}}}};
  S.pedidos=S.pedidos||{};S.meta.pedidoClientes=S.meta.pedidoClientes||{mapa:{}};
  let cola=ls.get('swift_cola')||[];            // cambios pendientes de subir
  const guardarCache=()=>ls.set('swift_cache',S), guardarCola=()=>{ls.set('swift_cola',cola);estado()};
  const subs=[];                                // {tipo:'col'|'doc', ruta, fn}
  const snapDoc=(col,id)=>({id,exists:!!(S[col]&&S[col][id]),data:()=>S[col]&&S[col][id],metadata:{}});
  function avisar(){subs.forEach(s=>{try{
    if(s.tipo==='col'){let ids=Object.keys(S[s.ruta]||{});if(s.ruta==='remitos')ids.sort((a,b)=>String(S.remitos[b].creado||'').localeCompare(String(S.remitos[a].creado||'')));
      s.fn({docs:ids.map(id=>snapDoc(s.ruta,id)),size:ids.length,empty:!ids.length,docChanges:()=>[],metadata:{}})}
    else{const [c,id]=s.ruta.split('/');s.fn(snapDoc(c,id))}}catch(e){console.error(e)}})}

  // ---- bajar todo de la planilla
  let cargado=false;
  async function bajar(){
    const j=await api('todo');
    // lo que todavía está en la cola manda sobre lo que vino de la planilla
    const pend={};cola.forEach(op=>{pend[op.col+'/'+op.id]=op});
    const mezcla=(col,nuevo)=>{const out=Object.assign({},nuevo);Object.keys(pend).forEach(k=>{const [c,id]=k.split('/');if(c!==col)return;const op=pend[k];if(op.tipo==='borrar')delete out[id];else out[id]=op.datos});return out};
    S={clientes:mezcla('clientes',j.clientes),productos:mezcla('productos',j.productos),costos:j.costos,remitos:mezcla('remitos',j.remitos),pedidos:mezcla('pedidos',j.pedidos||{}),
       meta:{contador:j.contador,lista:{precios:j.lista},pedidoClientes:(pend['meta/pedidoClientes']&&pend['meta/pedidoClientes'].datos)||{mapa:j.pedidoClientes||{}}}};
    S.prefijo=j.prefijo||'D';cargado=true;guardarCache();avisar();estado();
  }
  // ---- subir cambios pendientes, en orden
  let subiendo=false;
  async function subir(){
    if(subiendo||!cola.length)return;subiendo=true;
    try{while(cola.length){const op=cola[0];
        if(op.col==='remitos')await (op.tipo==='borrar'?api('borrarRemito',{id:op.id}):api('guardarRemito',{datos:op.datos}));
        else if(op.col==='clientes')await api('guardarCliente',{id:op.id,datos:op.datos});
        else if(op.col==='productos')await api('guardarProducto',{id:op.id,datos:op.datos});
        else if(op.col==='pedidos')await api('guardarPedido',{id:op.id,datos:op.datos});
        else if(op.col==='meta')await api('guardarMeta',{id:op.id,datos:op.datos});
        cola.shift();guardarCola()}}
    catch(e){console.warn('sin conexión, reintento después',e)}
    finally{subiendo=false;estado()}
  }
  function encolar(op){cola=cola.filter(o=>!(o.col===op.col&&o.id===op.id));cola.push(op);guardarCola();subir()}

  // ---- indicador de conexión (arriba a la derecha)
  function estado(){const el=document.getElementById('sync');if(!el)return;
    const n=cola.length;el.className='sync '+(n?'pend':(navigator.onLine&&cargado?'ok':'off'));
    el.textContent=n?`⏳ ${n} sin subir`:(navigator.onLine?(cargado?'✓ Sincronizado':'Conectando…'):'Sin señal')}
  window.addEventListener('online',()=>{subir();bajar().catch(()=>{});estado()});window.addEventListener('offline',estado);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){subir();bajar().catch(()=>{})}});
  setInterval(()=>{subir();if(!document.hidden)bajar().catch(()=>{})},60000);

  // ---- la "base de datos" con la misma forma que usaba la app
  const db={
    collection(col){const q={
        onSnapshot(fn,err){subs.push({tipo:'col',ruta:col,fn});setTimeout(()=>{if(S[col])avisar()},0);return()=>{}},
        orderBy(){return q},limit(){return q},doc:id=>db.doc(col+'/'+id)};return q},
    doc(ruta){const [col,id]=ruta.split('/');return{
      async get(){return snapDoc(col,id)},
      onSnapshot(fn){subs.push({tipo:'doc',ruta,fn});setTimeout(()=>fn(snapDoc(col,id)),0);return()=>{}},
      async set(datos){
        if(col==='meta'&&id!=='pedidoClientes')return;            // contador y lista los maneja la planilla
        S[col]=S[col]||{};S[col][id]=JSON.parse(JSON.stringify(datos));guardarCache();avisar();
        encolar({col,id,tipo:'guardar',datos:S[col][id]})},
      async update(cambios){const base=(S[col]&&S[col][id])||{};return this.set(Object.assign(JSON.parse(JSON.stringify(base)),cambios))},
      async delete(){if(S[col])delete S[col][id];guardarCache();avisar();encolar({col,id,tipo:'borrar'})}
    }}
  };
  // número de remito: lo da la planilla, así nunca se repite entre equipos
  window.nuevoNumeroRemito=async()=>{if(!navigator.onLine)throw {code:'sin_senal',message:'Sin señal: el número de remito lo da la planilla. Guardalo cuando vuelva la señal (lo cargado no se pierde).'};
    await subir();const j=await api('nuevoNumero');S.meta.contador={n:j.n};guardarCache();return j.numero};

  // descargar archivos (PDF / JPG) directo en el teléfono
  const downloads={async save({filename,data}){const u=URL.createObjectURL(data);const a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000)}};

  window.claude={use:async n=>n==='db'?db:n==='downloads'?downloads:null};
  window.addEventListener('DOMContentLoaded',()=>{estado();bajar().then(subir).catch(e=>{console.warn(e);estado()})});
})();
