import React,{useEffect,useMemo,useRef,useState}from'react';
import{api}from'./api.js';
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=v=>`${Number(v||0).toFixed(0)}%`;
const num=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});

async function compressImage(file){
  if(!file)return null;
  const data=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)});
  const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=data});
  const max=900,scale=Math.min(1,max/Math.max(img.width,img.height));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',.8);
}

export function AIPulse({onNavigate}){const[data,setData]=useState(null);useEffect(()=>{api.aiBrief().then(setData).catch(()=>{})},[]);if(!data)return null;return <div className="v05-ai-pulse"><div className="v05-ai-score"><span>NEXUS AI</span><strong>{data.score}</strong><small>OPERATION SCORE</small></div><div className="v05-ai-actions">{data.actions.slice(0,3).map((a,i)=><button key={i} className={`v05-ai-action ${a.level}`} onClick={()=>onNavigate?.(a.action)}><i>✦</i><span><b>{a.title}</b><small>{a.text}</small></span><em>→</em></button>)}</div></div>}

function Modal({open,onClose,title,eyebrow,children,wide=false}){if(!open)return null;return <div className="v05-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}><section className={`v05-modal ${wide?'wide':''}`}><header><div><span>{eyebrow}</span><h2>{title}</h2></div><button className="v05-icon-btn" onClick={onClose}>×</button></header><div className="v05-modal-body">{children}</div></section></div>}
function Empty({text}){return <div className="v05-empty"><b>◌</b><span>{text}</span></div>}

export function CashierV05({products,employees,cash,onDone}){
 const[cart,setCart]=useState([]),[payment,setPayment]=useState('PIX'),[employee,setEmployee]=useState(''),[tip,setTip]=useState('0'),[search,setSearch]=useState(''),[category,setCategory]=useState('TODOS'),[msg,setMsg]=useState(''),[session,setSession]=useState(null),[opening,setOpening]=useState('0'),[closingAmount,setClosingAmount]=useState('0'),[busy,setBusy]=useState(false);
 const cats=useMemo(()=>['TODOS',...Array.from(new Set(products.map(p=>p.category).filter(Boolean)))],[products]);
 const filtered=useMemo(()=>products.filter(p=>(category==='TODOS'||p.category===category)&&(!search||`${p.name} ${p.category} ${p.barcode||''}`.toLowerCase().includes(search.toLowerCase()))),[products,search,category]);
 const total=useMemo(()=>cart.reduce((s,x)=>s+Number(x.price)*x.qty,0),[cart]);
 const items=cart.reduce((s,x)=>s+x.qty,0);
 function add(p){if(Number(p.stock)<=0)return setMsg(`${p.name}: sem estoque.`);setCart(c=>{const e=c.find(x=>x.id===p.id);return e?c.map(x=>x.id===p.id?{...x,qty:x.qty+1}:x):[...c,{...p,qty:1}]})}
 function qty(id,d){setCart(c=>c.map(x=>x.id===id?{...x,qty:Math.max(0,x.qty+d)}:x).filter(x=>x.qty>0))}
 async function open(){setBusy(true);try{await api.openCash({opening_amount:Number(opening)});setSession(null);setMsg('Caixa aberto e pronto para operar.');await onDone()}catch(e){setMsg(e.message)}finally{setBusy(false)}}
 async function close(){setBusy(true);try{const r=await api.closeCash(cash.id,{closing_amount:Number(closingAmount)});setSession(null);setMsg(`Fechamento concluído. Diferença: ${money(r.difference)}`);await onDone()}catch(e){setMsg(e.message)}finally{setBusy(false)}}
 async function finish(){if(!cash)return setSession('open');if(!cart.length)return;setBusy(true);try{await api.createSale({payment_method:payment,employee_id:employee||null,tip_amount:Number(tip||0),items:cart.map(x=>({product_id:x.id,qty:x.qty}))});setCart([]);setTip('0');setMsg('Venda concluída. Estoque, caixa, performance e inteligência foram atualizados.');await onDone()}catch(e){setMsg(e.message)}finally{setBusy(false)}}
 return <section className="page v05-page"><div className="v05-page-head"><div><span>SMART POS • AUTOMATION CORE</span><h2>Caixa Inteligente</h2><p>Venda rápida, visual e assistida. Cada operação alimenta estoque, margem, performance e fechamento.</p></div><div className={`v05-session-pill ${cash?'online':'offline'}`}><i/>{cash?`CAIXA #${cash.id} ABERTO`:'CAIXA FECHADO'}</div></div>
 {msg&&<div className="v05-notice">✦ {msg}</div>}
 <div className="v05-pos-layout"><div className="v05-pos-products"><div className="v05-pos-toolbar"><div className="v05-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar produto, categoria ou código..."/></div><button className="v05-btn secondary" onClick={()=>setSession(cash?'close':'open')}>{cash?'Fechar caixa':'Abrir caixa'}</button></div><div className="v05-chips">{cats.map(c=><button key={c} className={c===category?'active':''} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="v05-product-grid">{filtered.map(p=><button className="v05-product-card" key={p.id} onClick={()=>add(p)} disabled={!cash||Number(p.stock)<=0}><div className="v05-product-image">{p.image_url?<img src={p.image_url} alt=""/>:<span>{(p.name||'?').slice(0,1)}</span>}<em className={Number(p.stock)<=Number(p.minimum_stock)?'low':''}>{num(p.stock)} {p.stock_unit||''}</em></div><div><small>{p.category}</small><b>{p.name}</b><strong>{money(p.price)}</strong></div></button>)}</div></div>
 <aside className="v05-cart"><div className="v05-cart-head"><div><span>VENDA ATUAL</span><h3>{items} item(ns)</h3></div><b>{money(total+Number(tip||0))}</b></div><div className="v05-cart-items">{cart.length?cart.map(x=><div className="v05-cart-row" key={x.id}><div className="v05-cart-thumb">{x.image_url?<img src={x.image_url} alt=""/>:x.name[0]}</div><div><b>{x.name}</b><small>{money(x.price)} cada</small></div><div className="v05-stepper"><button onClick={()=>qty(x.id,-1)}>−</button><span>{x.qty}</span><button onClick={()=>qty(x.id,1)}>+</button></div><strong>{money(x.qty*x.price)}</strong></div>):<Empty text="Toque em um produto para iniciar a venda."/>}</div><div className="v05-cart-controls"><label>Atendente<select value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">Usuário atual</option>{employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><div className="v05-form-grid two"><label>Pagamento<select value={payment} onChange={e=>setPayment(e.target.value)}><option>PIX</option><option>DINHEIRO</option><option>CARTAO</option><option>COMANDA</option></select></label><label>Gorjeta<input type="number" step="0.01" value={tip} onChange={e=>setTip(e.target.value)}/></label></div><div className="v05-total"><span>Total a receber</span><strong>{money(total+Number(tip||0))}</strong></div><button className="v05-btn primary giant" disabled={busy||!cart.length} onClick={finish}>{busy?'PROCESSANDO...':'FINALIZAR VENDA →'}</button></div></aside></div>
 <Modal open={session==='open'} onClose={()=>setSession(null)} eyebrow="SMART CASH SESSION" title="Abrir caixa"><div className="v05-form-stack"><p className="v05-help">Informe o fundo inicial. A NEXUS passa a rastrear todas as vendas da sessão para o fechamento.</p><label>Fundo de caixa<input autoFocus type="number" step="0.01" value={opening} onChange={e=>setOpening(e.target.value)}/></label><button className="v05-btn primary" disabled={busy} onClick={open}>ABRIR SESSÃO</button></div></Modal>
 <Modal open={session==='close'} onClose={()=>setSession(null)} eyebrow="SMART CLOSING" title="Conferência de caixa"><div className="v05-form-stack"><p className="v05-help">Digite o valor físico contado. A diferença será calculada automaticamente.</p><label>Valor contado<input autoFocus type="number" step="0.01" value={closingAmount} onChange={e=>setClosingAmount(e.target.value)}/></label><button className="v05-btn primary" disabled={busy} onClick={close}>CONCLUIR FECHAMENTO</button></div></Modal></section>
}

export function InventoryV05({products,onDone}){
 const[search,setSearch]=useState(''),[filter,setFilter]=useState('ALL'),[modal,setModal]=useState(null),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const blank={name:'',category:'Bebidas',barcode:'',description:'',unit_type:'UNIT',package_ml:'',dose_ml:'',price:'',cost:'',stock:'',minimum_stock:'',image_url:null};
 const[form,setForm]=useState(blank),[adjust,setAdjust]=useState('');
 const[smart,setSmart]=useState(null);
 const[intelligence,setIntelligence]=useState(null);
 const fileRef=useRef(null);
 const rows=useMemo(()=>products.filter(p=>{const q=`${p.name} ${p.category} ${p.barcode||''}`.toLowerCase().includes(search.toLowerCase());const f=filter==='ALL'||(filter==='LOW'&&Number(p.stock)<=Number(p.minimum_stock))||(filter==='ZERO'&&Number(p.stock)<=0)||(filter==='MARGIN'&&Number(p.price)>0&&((p.price-p.cost)/p.price*100)<30);return q&&f}),[products,search,filter]);
 const stats=useMemo(()=>({items:products.length,low:products.filter(p=>Number(p.stock)<=Number(p.minimum_stock)).length,zero:products.filter(p=>Number(p.stock)<=0).length,value:products.reduce((s,p)=>s+Number(p.stock)*Number(p.cost),0)}),[products]);
 function aiSuggest(name){const t=String(name||'').toLowerCase();let category=form.category,unit=form.unit_type;if(/gin|vodka|whisky|rum|licor|cacha|tequila/.test(t)){category='Destilados';unit='BOTTLE'}else if(/cerve|litr|long neck|chopp|chope/.test(t)){category='Cervejas & Chopp';unit='UNIT'}else if(/refriger|suco|agua|energ/.test(t)){category='Bebidas';unit='UNIT'}else if(/carne|frango|lingui|camar|queijo/.test(t)){category='Ingredientes';unit='KG'}setForm(f=>({...f,name,category,unit_type:unit}))}
 async function photo(e){const f=e.target.files?.[0];if(!f)return;setBusy(true);try{const url=await compressImage(f);setForm(x=>({...x,image_url:url}));setMsg('Imagem otimizada e pronta para o cadastro.')}finally{setBusy(false)}}
 function openNew(){setForm(blank);setAdjust('');setModal('new')}
 async function openEdit(p){
  setForm({...p,package_ml:p.package_ml??'',dose_ml:p.dose_ml??'',stock:p.stock??'',minimum_stock:p.minimum_stock??''});
  setAdjust('');
  setIntelligence(null);

  const fractional=Number(p.package_ml)>0&&Number(p.dose_ml)>0;

  const fallback={
   product_id:p.id,
   purchase_unit:fractional?'GARRAFA':'UNIDADE',
   base_unit:fractional?'ML':'UNIT',
   content_base:fractional?Number(p.package_ml):1,
   purchase_qty:0,
   purchase_total:0,
   closed_units:fractional?Math.max(0,Math.floor(Number(p.stock)||0)):Math.max(0,Number(p.stock)||0),
   open_base:0,
   dose_size:fractional?Number(p.dose_ml):0,
   sale_dose_price:fractional?Number(p.price||0):0,
   sale_package_price:fractional?0:Number(p.price||0),
   sell_dose:fractional?1:0,
   sell_package:fractional?0:1
  };

  setSmart(fallback);
  setModal('stock');
  setBusy(true);

  try{
   const response=await api.inventoryProfile(p.id);
   const profile=response?.profile||response?.data||response;

   if(profile&&profile.product_id){
    setSmart({
     ...fallback,
     ...profile,
     sell_dose:Number(profile.sell_dose)?1:0,
     sell_package:Number(profile.sell_package)?1:0
    });
   }

   if(response?.intelligence){
    setIntelligence(response.intelligence);
   }
  }catch(e){
   // Produto existente sem perfil Smart:
   // o backend cria o perfil no primeiro salvamento.
  }finally{
   setBusy(false);
  }
 }

 function setStockMode(mode){
  if(!smart)return;

  if(mode==='UNIT'){
   setSmart(s=>({
    ...s,
    purchase_unit:'UNIDADE',
    base_unit:'UNIT',
    content_base:1,
    open_base:0,
    dose_size:0,
    sale_dose_price:0,
    sale_package_price:Number(form.price||0),
    sell_dose:0,
    sell_package:1
   }));
  }else{
   setSmart(s=>({
    ...s,
    purchase_unit:'GARRAFA',
    base_unit:'ML',
    content_base:Number(s.content_base)>1?Number(s.content_base):(Number(form.package_ml)||1000),
    dose_size:Number(s.dose_size)>0?Number(s.dose_size):(Number(form.dose_ml)||50),
    sale_dose_price:Number(s.sale_dose_price)>0?Number(s.sale_dose_price):Number(form.price||0),
    sell_dose:1
   }));
  }
 }

 async function saveSmartStock(){
  if(!form.id||!smart)return;

  const fraction=String(smart.base_unit).toUpperCase()==='ML'&&Number(smart.sell_dose)===1;
  const content=Math.max(0,Number(smart.content_base)||0);
  const dose=Math.max(0,Number(smart.dose_size)||0);
  const open=Math.max(0,Number(smart.open_base)||0);

  if(fraction&&content<=0){
   return setMsg('Informe o volume da embalagem.');
  }

  if(fraction&&dose<=0){
   return setMsg('Informe o tamanho da dose.');
  }

  if(fraction&&dose>content){
   return setMsg('A dose nao pode ser maior que a embalagem.');
  }

  if(fraction&&open>content){
   return setMsg('O saldo da garrafa aberta nao pode superar o volume da embalagem.');
  }

  setBusy(true);

  try{
   const payload={
    purchase_unit:fraction?'GARRAFA':'UNIDADE',
    base_unit:fraction?'ML':'UNIT',
    content_base:fraction?content:1,
    purchase_qty:Math.max(0,Number(smart.purchase_qty)||0),
    purchase_total:Math.max(0,Number(smart.purchase_total)||0),
    closed_units:Math.max(0,Number(smart.closed_units)||0),
    open_base:fraction?open:0,
    dose_size:fraction?dose:0,
    sale_dose_price:fraction?Math.max(0,Number(smart.sale_dose_price)||0):0,
    sale_package_price:fraction?Math.max(0,Number(smart.sale_package_price)||0):Number(form.price||0),
    sell_dose:fraction?1:0,
    sell_package:fraction?(Number(smart.sell_package)?1:0):1
   };

   const response=await api.updateInventoryProfile(form.id,payload);

   if(response?.intelligence){
    setIntelligence(response.intelligence);
   }

   setMsg(
    fraction
     ? 'Estoque fracionado configurado com sucesso.'
     : 'Estoque unitario configurado com sucesso.'
   );

   setModal(null);
   await onDone();

  }catch(e){
   setMsg(e.message);
  }finally{
   setBusy(false);
  }
 }
 async function save(){if(!form.name.trim())return setMsg('Informe o nome do produto.');setBusy(true);try{if(modal==='new')await api.createProduct({...form,price:Number(form.price||0),cost:Number(form.cost||0),stock:Number(form.stock||0),minimum_stock:Number(form.minimum_stock||0)});else await api.updateProduct(form.id,{...form,price:Number(form.price||0),cost:Number(form.cost||0),minimum_stock:Number(form.minimum_stock||0)});setModal(null);setMsg('Produto salvo. Estoque e inteligência atualizados.');await onDone()}catch(e){setMsg(e.message)}finally{setBusy(false)}}
 async function doAdjust(){if(!adjust||!form.id)return;setBusy(true);try{await api.adjustStock(form.id,{qty:Number(adjust),notes:'Ajuste pelo Estoque Vision V0.5'});setAdjust('');setModal(null);setMsg('Movimentação registrada na trilha de estoque.');await onDone()}catch(e){setMsg(e.message)}finally{setBusy(false)}}
 return <section className="page v05-page"><div className="v05-page-head"><div><span>VISION STOCK • SMART CAPTURE</span><h2>Estoque Inteligente</h2><p>Cadastre por imagem, acompanhe ruptura, margem, valor imobilizado e movimentações com leitura operacional.</p></div><button className="v05-btn primary" onClick={openNew}>ï¼‹ NOVO PRODUTO</button></div>
 {msg&&<div className="v05-notice">✦ {msg}</div>}
 <div className="v05-stat-grid"><button onClick={()=>setFilter('ALL')} className={filter==='ALL'?'active':''}><span>Produtos ativos</span><strong>{stats.items}</strong><small>catálogo total</small></button><button onClick={()=>setFilter('LOW')} className={filter==='LOW'?'active warn':''}><span>Reposição</span><strong>{stats.low}</strong><small>no mínimo ou abaixo</small></button><button onClick={()=>setFilter('ZERO')} className={filter==='ZERO'?'active danger':''}><span>Rupturas</span><strong>{stats.zero}</strong><small>sem saldo</small></button><button><span>Capital em estoque</span><strong>{money(stats.value)}</strong><small>pelo custo atual</small></button></div>
 <div className="v05-stock-toolbar"><div className="v05-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar produto, código ou categoria..."/></div><button className={filter==='MARGIN'?'active':''} onClick={()=>setFilter(filter==='MARGIN'?'ALL':'MARGIN')}>Margem &lt; 30%</button></div>
 <div className="v05-stock-grid">{rows.map(p=>{const margin=p.price?((p.price-p.cost)/p.price*100):0;const low=Number(p.stock)<=Number(p.minimum_stock);return <article className={`v05-stock-card ${low?'low':''}`} key={p.id}><button className="v05-stock-click" onClick={()=>openEdit(p)}><div className="v05-stock-image">{p.image_url?<img src={p.image_url} alt=""/>:<span>{p.name.slice(0,1)}</span>}<i className={low?'warn':'ok'}>{low?'REPOR':'OK'}</i></div><div className="v05-stock-info"><small>{p.category}</small><h3>{p.name}</h3><div className="v05-stock-numbers"><div><span>Saldo</span><b>{num(p.stock)} {p.stock_unit||p.unit_type}</b></div><div><span>Mínimo</span><b>{num(p.minimum_stock)}</b></div><div><span>Margem</span><b>{pct(margin)}</b></div></div><footer><span>Custo {money(p.cost)}</span><strong>{money(p.price)}</strong></footer></div></button></article>})}</div>{!rows.length&&<Empty text="Nenhum produto encontrado para este filtro."/>}
 {modal==='new'&&
 <Modal
  open={true}
  onClose={()=>setModal(null)}
  wide
  eyebrow="SMART PRODUCT CAPTURE"
  title="Cadastrar produto"
 >
  <div className="v05-product-editor">

   <div
    className="v05-photo-capture"
    onClick={()=>fileRef.current?.click()}
   >
    {form.image_url
     ? <img src={form.image_url} alt="Previa"/>
     : <div>
        <b>+</b>
        <span>Adicionar foto</span>
        <small>Camera ou arquivo</small>
       </div>
    }

    <input
     ref={fileRef}
     hidden
     type="file"
     accept="image/*"
     capture="environment"
     onChange={photo}
    />
   </div>

   <div className="v05-editor-fields">

    <div className="v05-form-grid two">
     <label>
      Nome
      <input
       value={form.name}
       onChange={e=>aiSuggest(e.target.value)}
       placeholder="Ex.: Gin London Dry 1L"
      />
     </label>

     <label>
      Categoria
      <input
       value={form.category}
       onChange={e=>setForm({...form,category:e.target.value})}
      />
     </label>
    </div>

    <div className="v05-form-grid three">
     <label>
      Codigo / EAN
      <input
       value={form.barcode||''}
       onChange={e=>setForm({...form,barcode:e.target.value})}
      />
     </label>

     <label>
      Unidade
      <select
       value={form.unit_type}
       onChange={e=>setForm({...form,unit_type:e.target.value})}
      >
       <option>UNIT</option>
       <option>BOTTLE</option>
       <option>ML</option>
       <option>L</option>
       <option>G</option>
       <option>KG</option>
       <option>DOSE</option>
       <option>KEG</option>
      </select>
     </label>

     <label>
      Estoque minimo
      <input
       type="number"
       value={form.minimum_stock}
       onChange={e=>setForm({...form,minimum_stock:e.target.value})}
      />
     </label>
    </div>

    <div className="v05-form-grid three">
     <label>
      Custo
      <input
       type="number"
       step="0.01"
       value={form.cost}
       onChange={e=>setForm({...form,cost:e.target.value})}
      />
     </label>

     <label>
      Preco de venda
      <input
       type="number"
       step="0.01"
       value={form.price}
       onChange={e=>setForm({...form,price:e.target.value})}
      />
     </label>

     <label>
      Estoque inicial
      <input
       type="number"
       step="0.01"
       value={form.stock}
       onChange={e=>setForm({...form,stock:e.target.value})}
      />
     </label>
    </div>

    {['BOTTLE','DOSE','ML','KEG'].includes(form.unit_type)&&
     <div className="v05-form-grid two">
      <label>
       Volume da embalagem (ml)
       <input
        type="number"
        value={form.package_ml||''}
        onChange={e=>setForm({...form,package_ml:e.target.value})}
       />
      </label>

      <label>
       Dose padrao (ml)
       <input
        type="number"
        value={form.dose_ml||''}
        onChange={e=>setForm({...form,dose_ml:e.target.value})}
       />
      </label>
     </div>
    }

    <label>
     Descricao
     <textarea
      rows="3"
      value={form.description||''}
      onChange={e=>setForm({...form,description:e.target.value})}
      placeholder="Observacoes, marca, apresentacao..."
     />
    </label>

    <div className="v05-ai-hint">
     <i>+</i>
     <div>
      <b>NEXUS AI Assist</b>
      <span>
       O sistema sugere categoria e unidade conforme o nome.
       A imagem e comprimida automaticamente antes de salvar.
      </span>
     </div>
    </div>

    <div className="v05-editor-actions">
     <button
      className="v05-btn primary"
      disabled={busy}
      onClick={save}
     >
      {busy?'SALVANDO...':'SALVAR PRODUTO'}
     </button>
    </div>

   </div>
  </div>
 </Modal>
}

{modal==='stock'&&smart&&
 <Modal
  open={true}
  onClose={()=>setModal(null)}
  wide
  eyebrow="NEXUS SMART INVENTORY"
  title={`Gerenciar estoque - ${form.name}`}
 >
  <div className="v05-form-stack">

   <div className="v05-ai-hint">
    <i>+</i>
    <div>
     <b>Gerenciamento operacional do produto</b>
     <span>
      Defina como este item existe fisicamente no estoque.
      O preco de venda nao sera alterado automaticamente.
     </span>
    </div>
   </div>

   <div className="v05-form-grid two">
    <button
     type="button"
     className={
      String(smart.base_unit).toUpperCase()!=='ML'||Number(smart.sell_dose)!==1
       ? 'v05-btn primary'
       : 'v05-btn secondary'
     }
     onClick={()=>setStockMode('UNIT')}
    >
     PRODUTO UNITARIO
    </button>

    <button
     type="button"
     className={
      String(smart.base_unit).toUpperCase()==='ML'&&Number(smart.sell_dose)===1
       ? 'v05-btn primary'
       : 'v05-btn secondary'
     }
     onClick={()=>setStockMode('FRACTION')}
    >
     VENDA FRACIONADA / DOSE
    </button>
   </div>

   {(
     String(smart.base_unit).toUpperCase()!=='ML'||
     Number(smart.sell_dose)!==1
    )&&
    <div className="v05-form-grid three">
     <label>
      Quantidade atual
      <input
       type="number"
       step="0.01"
       min="0"
       value={smart.closed_units??''}
       onChange={e=>setSmart({...smart,closed_units:e.target.value})}
      />
     </label>

     <label>
      Estoque minimo
      <input
       disabled
       value={num(form.minimum_stock)}
      />
     </label>

     <label>
      Custo unitario
      <input
       disabled
       value={money(form.cost)}
      />
     </label>
    </div>
   }

   {(
     String(smart.base_unit).toUpperCase()==='ML'&&
     Number(smart.sell_dose)===1
    )&&
    <div className="v05-form-stack">

     <div className="v05-form-grid three">
      <label>
       Garrafas fechadas
       <input
        type="number"
        step="1"
        min="0"
        value={smart.closed_units??''}
        onChange={e=>setSmart({...smart,closed_units:e.target.value})}
       />
      </label>

      <label>
       Volume da embalagem (ml)
       <input
        type="number"
        step="1"
        min="1"
        value={smart.content_base??''}
        onChange={e=>setSmart({...smart,content_base:e.target.value})}
       />
      </label>

      <label>
       Dose padrao (ml)
       <input
        type="number"
        step="1"
        min="1"
        value={smart.dose_size??''}
        onChange={e=>setSmart({...smart,dose_size:e.target.value})}
       />
      </label>
     </div>

     <div className="v05-form-grid three">
      <label>
       Garrafa aberta - saldo (ml)
       <input
        type="number"
        step="1"
        min="0"
        value={smart.open_base??''}
        onChange={e=>setSmart({...smart,open_base:e.target.value})}
       />
      </label>

      <label>
       Custo da garrafa
       <input
        disabled
        value={money(
         Number(smart.purchase_qty)>0
          ? Number(smart.purchase_total)/Number(smart.purchase_qty)
          : Number(form.cost||0)
        )}
       />
      </label>

      <label>
       Preco atual da dose
       <input
        type="number"
        step="0.01"
        min="0"
        value={smart.sale_dose_price??''}
        onChange={e=>setSmart({...smart,sale_dose_price:e.target.value})}
       />
      </label>
     </div>

     <div className="v05-stat-grid">
      <button type="button">
       <span>Rendimento</span>
       <strong>
        {num(
         Number(smart.dose_size)>0
          ? Number(smart.content_base)/Number(smart.dose_size)
          : 0
        )}
       </strong>
       <small>doses por embalagem</small>
      </button>

      <button type="button">
       <span>Doses disponiveis</span>
       <strong>
        {num(
         Number(smart.dose_size)>0
          ? (
             Number(smart.closed_units||0)*Number(smart.content_base||0)+
             Number(smart.open_base||0)
            )/Number(smart.dose_size)
          : 0
        )}
       </strong>
       <small>estimativa operacional</small>
      </button>

      <button type="button">
       <span>Custo por dose</span>
       <strong>
        {money(
         Number(smart.dose_size)>0&&Number(smart.content_base)>0
          ? (
             Number(smart.purchase_qty)>0
              ? Number(smart.purchase_total)/Number(smart.purchase_qty)
              : Number(form.cost||0)
            )/
            (
             Number(smart.content_base)/
             Number(smart.dose_size)
            )
          : 0
        )}
       </strong>
       <small>custo efetivo</small>
      </button>

      <button type="button">
       <span>Margem real</span>
       <strong>
        {pct(
         Number(smart.sale_dose_price)>0&&
         Number(smart.dose_size)>0&&
         Number(smart.content_base)>0
          ? (
             (
              Number(smart.sale_dose_price)-
              (
               (
                Number(smart.purchase_qty)>0
                 ? Number(smart.purchase_total)/Number(smart.purchase_qty)
                 : Number(form.cost||0)
               )/
               (
                Number(smart.content_base)/
                Number(smart.dose_size)
               )
              )
             )/
             Number(smart.sale_dose_price)
            )*100
          : 0
        )}
       </strong>
       <small>preco atual</small>
      </button>
     </div>

     <div className="v05-ai-hint">
      <i>+</i>
      <div>
       <b>NEXUS Pricing Intelligence</b>
       <span>
        Preco sugerido para margem de 55%:
        {' '}
        <strong>
         {money(
          Number(smart.dose_size)>0&&Number(smart.content_base)>0
           ? Math.ceil(
              (
               (
                (
                 Number(smart.purchase_qty)>0
                  ? Number(smart.purchase_total)/Number(smart.purchase_qty)
                  : Number(form.cost||0)
                )/
                (
                 Number(smart.content_base)/
                 Number(smart.dose_size)
                )
               )/
               0.45
              )*2
             )/2
           : 0
         )}
        </strong>
        . Sugestao apenas informativa.
       </span>
      </div>
     </div>

    </div>
   }

   <div className="v05-editor-actions">

    <div className="v05-adjust">
     <input
      type="number"
      step="0.01"
      value={adjust}
      onChange={e=>setAdjust(e.target.value)}
      placeholder="+ entrada / - saida"
     />
     <button
      type="button"
      disabled={busy||!adjust}
      onClick={doAdjust}
     >
      Registrar ajuste
     </button>
    </div>

    <button
     type="button"
     className="v05-btn primary"
     disabled={busy}
     onClick={saveSmartStock}
    >
     {busy?'SALVANDO...':'SALVAR CONFIGURACAO'}
    </button>

   </div>

   {intelligence&&
    <div className="v05-ai-hint">
     <i>+</i>
     <div>
      <b>Leitura do motor</b>
      <span>
       Modo: {intelligence.mode||'-'}
       {' | '}
       Custo/dose: {money(intelligence.cost_per_dose||0)}
       {' | '}
       Margem: {pct(intelligence.current_margin||0)}
      </span>
     </div>
    </div>
   }

  </div>
 </Modal>
}</section>
}
