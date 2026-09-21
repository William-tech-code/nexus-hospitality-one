import React,{useEffect,useMemo,useState}from'react';import{api}from'./api.js';
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const num=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
export default function OperationalV03({mode,products=[],employees=[],onDone=()=>{}}){if(mode==='tables')return <Tables products={products} employees={employees} onDone={onDone}/>;if(mode==='orders')return <Orders products={products} employees={employees} onDone={onDone}/>;if(mode==='kds')return <KDS/>;if(mode==='beverages')return <Beverages products={products} onDone={onDone}/>;if(mode==='procurement')return <Procurement products={products}/>;return null}
function Head({eyebrow,title,text}){return <div className="page-head"><span>{eyebrow}</span><h2>{title}</h2>{text&&<p className="v03-lead">{text}</p>}</div>}
function Tables({products,employees,onDone}){const[tables,setTables]=useState([]),[summary,setSummary]=useState(null),[selected,setSelected]=useState(null),[customer,setCustomer]=useState(''),[employee,setEmployee]=useState('');const load=async()=>{setTables(await api.tables());setSummary(await api.opsSummary())};useEffect(()=>{load()},[]);async function open(t){if(t.order_id){setSelected(await api.orderV03(t.order_id));return}const o=await api.openTable(t.id,{customer_name:customer,employee_id:employee||null});setSelected(o);setCustomer('');await load();onDone()}return <section className="page"><Head eyebrow="FLOOR CONTROL" title="Mesas, salão e comandas em tempo real" text="Uma visão única do salão: livre, ocupada, consumo e responsável."/><div className="v03-kpis"><Mini label="Mesas" value={summary?.tables.total||0}/><Mini label="Ocupadas" value={summary?.tables.occupied||0}/><Mini label="Comandas abertas" value={summary?.orders.count||0}/><Mini label="Valor em aberto" value={money(summary?.orders.value||0)}/></div><div className="panel v03-toolbar"><input placeholder="Cliente opcional" value={customer} onChange={e=>setCustomer(e.target.value)}/><select value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">Atendente automático</option>{employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><span>Selecione uma mesa livre para abrir.</span></div><div className="v03-table-grid">{tables.map(t=><button className={`v03-table ${t.order_id?'occupied':'free'}`} key={t.id} onClick={()=>open(t)}><span>{t.area||'Salão'}</span><strong>{t.label}</strong><small>{t.order_id?`${t.customer_name||'Comanda aberta'} • ${money(t.subtotal)}`:`Livre • ${t.capacity} lugares`}</small><i>{t.order_id?'OCUPADA':'LIVRE'}</i></button>)}</div>{selected&&<OrderDrawer order={selected} products={products} tables={tables} onChanged={async o=>{setSelected(o);await load();onDone()}} onClose={()=>setSelected(null)}/>}</section>}
function Orders({products,employees,onDone}){
  const[orders,setOrders]=useState([]);
  const[tables,setTables]=useState([]);
  const[selected,setSelected]=useState(null);
  const[loading,setLoading]=useState(false);

  const load=async()=>{
    setLoading(true);
    try{
      const[o,t]=await Promise.all([api.ordersV03(),api.tables()]);
      setOrders(Array.isArray(o)?o:[]);
      setTables(Array.isArray(t)?t:[]);
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{load()},[]);

  async function open(id){
    setSelected(await api.orderV03(id));
  }

  return <section className="page nexus-orders-v45">
    <Head
      eyebrow="SMART TABS"
      title="Comandas online e consumo conectado"
      text="Clique em qualquer comanda para acessar, inserir produtos, acompanhar itens, transferir e fechar a conta."
    />

    <div className="v45-order-toolbar panel">
      <div>
        <b>COMANDAS ABERTAS</b>
        <small>{orders.length} atendimento(s) em andamento</small>
      </div>
      <button className="ghost" disabled={loading} onClick={load}>
        {loading?'ATUALIZANDO...':'ATUALIZAR'}
      </button>
    </div>

    <div className="v03-order-list">
      {orders.length
        ? orders.map(o=>
            <button
              key={o.id}
              className="v03-order-card v45-clickable-order"
              onClick={()=>open(o.id)}
            >
              <span>COMANDA #{o.id}</span>
              <strong>{o.table_name||o.label}</strong>
              <small>{o.customer_name||'Cliente nao identificado'}</small>
              <small>{o.item_count} item(ns) - {o.employee_name||'Equipe'}</small>
              <b>{money(o.subtotal)}</b>
              <em>CLIQUE PARA ACESSAR</em>
            </button>
          )
        : <div className="panel">Nenhuma comanda aberta.</div>
      }
    </div>

    {selected&&
      <OrderDrawer
        order={selected}
        products={products}
        tables={tables}
        onChanged={async o=>{
          setSelected(o);
          await load();
          onDone();
        }}
        onClose={()=>setSelected(null)}
      />
    }
  </section>
}
function OrderDrawer({order,products,tables,onChanged,onClose}){const[product,setProduct]=useState(''),[qty,setQty]=useState(1),[notes,setNotes]=useState(''),[payment,setPayment]=useState('PIX'),[tip,setTip]=useState(0),[target,setTarget]=useState(''),[busy,setBusy]=useState(false);async function add(){if(!product)return;setBusy(true);try{const o=await api.addOrderItem(order.id,{product_id:product,qty,notes});setProduct('');setQty(1);setNotes('');onChanged(o)}finally{setBusy(false)}}async function status(id,s){await api.setOrderItemStatus(id,s);onChanged(await api.orderV03(order.id))}async function del(id){await api.deleteOrderItem(id);onChanged(await api.orderV03(order.id))}async function transfer(){if(!target)return;onChanged(await api.transferOrder(order.id,target))}async function close(){setBusy(true);try{await api.closeOrder(order.id,{payment_method:payment,tip_amount:Number(tip||0)});onClose();location.reload()}catch(e){alert(e.message)}finally{setBusy(false)}}return <div className="v03-drawer-backdrop"><aside className="v03-drawer"><button className="v03-x" onClick={onClose}>×</button><span className="eyebrow">COMANDA #{order.id}</span><h2>{order.table_name||order.label}</h2><p>{order.customer_name||'Cliente não identificado'} • {order.employee_name||'Equipe'}</p><div className="v03-add-item"><select value={product} onChange={e=>setProduct(e.target.value)}><option value="">Selecionar produto</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}</select><input type="number" min="0.01" step="0.01" value={qty} onChange={e=>setQty(e.target.value)}/><input placeholder="Observação / ponto / sem gelo..." value={notes} onChange={e=>setNotes(e.target.value)}/><button className="primary" disabled={busy} onClick={add}>Adicionar</button></div><div className="v03-items">{order.items?.map(i=><div key={i.id}><div><strong>{num(i.qty)}× {i.product_name}</strong><small>{i.notes||i.category} • {i.status}</small></div><b>{money(i.qty*i.unit_price)}</b><select value={i.status} onChange={e=>status(i.id,e.target.value)}><option value="NEW">Novo</option><option value="PREPARING">Preparando</option><option value="READY">Pronto</option><option value="SERVED">Servido</option><option value="CANCELLED">Cancelado</option></select><button onClick={()=>del(i.id)}>×</button></div>)}</div><div className="v03-total"><span>Total da comanda</span><strong>{money(order.subtotal)}</strong></div>{tables.length>0&&<div className="v03-transfer"><select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Transferir para...</option>{tables.filter(t=>!t.order_id&&t.id!==order.table_id).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select><button onClick={transfer}>Transferir</button></div>}<div className="v03-close-order"><select value={payment} onChange={e=>setPayment(e.target.value)}><option>PIX</option><option>DINHEIRO</option><option>CARTAO</option></select><input type="number" step="0.01" placeholder="Gorjeta" value={tip} onChange={e=>setTip(e.target.value)}/><button className="primary" disabled={busy||!order.items?.length} onClick={close}>Fechar comanda</button></div></aside></div>}
/* NEXUS_KDS_V47_PREMIUM */
function KDS(){
  const[items,setItems]=useState([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[now,setNow]=useState(Date.now());
  const[actionId,setActionId]=useState(null);

  async function load(silent=false){
    if(!silent)setLoading(true);
    try{
      const data=await api.kitchen();
      setItems(Array.isArray(data)?data:[]);
      setError('');
    }catch(e){
      setError(e?.message||'Falha ao atualizar a cozinha.');
    }finally{
      if(!silent)setLoading(false);
    }
  }

  useEffect(()=>{
    load();
    const sync=setInterval(()=>load(true),5000);
    const clock=setInterval(()=>setNow(Date.now()),1000);
    return()=>{
      clearInterval(sync);
      clearInterval(clock);
    };
  },[]);

  async function advance(item,status){
    setActionId(item.id);
    try{
      await api.setOrderItemStatus(item.id,status);
      await load(true);
    }catch(e){
      setError(e?.message||'Nao foi possivel atualizar o pedido.');
    }finally{
      setActionId(null);
    }
  }

  function createdAt(item){
    const raw=String(item.created_at||'');
    if(!raw)return null;
    const normalized=/Z$|[+-]\d\d:\d\d$/.test(raw)
      ?raw
      :raw.replace(' ','T')+'Z';
    const d=new Date(normalized);
    return Number.isNaN(d.getTime())?null:d;
  }

  function minutes(item){
    const d=createdAt(item);
    if(!d)return 0;
    return Math.max(0,Math.floor((now-d.getTime())/60000));
  }

  function ageClass(item){
    const m=minutes(item);
    if(m>=25)return'critical';
    if(m>=15)return'warning';
    return'normal';
  }

  function timeLabel(item){
    const m=minutes(item);
    if(m<1)return'AGORA';
    if(m===1)return'1 MIN';
    return`${m} MIN`;
  }

  function clockLabel(item){
    const d=createdAt(item);
    if(!d)return'--:--';
    return d.toLocaleTimeString('pt-BR',{
      hour:'2-digit',
      minute:'2-digit'
    });
  }

  const columns=[
    {
      status:'NEW',
      label:'NOVOS PEDIDOS',
      short:'NOVOS',
      next:'PREPARING',
      action:'INICIAR PREPARO'
    },
    {
      status:'PREPARING',
      label:'EM PREPARO',
      short:'PREPARANDO',
      next:'READY',
      action:'MARCAR COMO PRONTO'
    },
    {
      status:'READY',
      label:'PRONTOS',
      short:'PRONTOS',
      next:'SERVED',
      action:'CONFIRMAR ENTREGA'
    }
  ];

  const count=status=>items.filter(x=>x.status===status).length;
  const oldest=items.length
    ?Math.max(...items.map(minutes))
    :0;

  const clock=new Date(now).toLocaleTimeString('pt-BR',{
    hour:'2-digit',
    minute:'2-digit',
    second:'2-digit'
  });

  return <section className="page nexus-kds-v47">
    <div className="kds47-hero">
      <div>
        <span className="kds47-eyebrow">KITCHEN DISPLAY SYSTEM / LIVE</span>
        <h2>Cozinha em operacao</h2>
        <p>Pedidos das comandas sincronizados automaticamente com a equipe de preparo.</p>
      </div>

      <div className="kds47-clock">
        <small>HORA LOCAL</small>
        <strong>{clock}</strong>
        <span>
          <i/>
          SINCRONIZACAO ATIVA
        </span>
      </div>
    </div>

    <div className="kds47-summary">
      <div>
        <span>NA FILA</span>
        <strong>{items.length}</strong>
        <small>itens ativos</small>
      </div>
      <div>
        <span>NOVOS</span>
        <strong>{count('NEW')}</strong>
        <small>aguardando inicio</small>
      </div>
      <div>
        <span>PREPARANDO</span>
        <strong>{count('PREPARING')}</strong>
        <small>em producao</small>
      </div>
      <div>
        <span>PRONTOS</span>
        <strong>{count('READY')}</strong>
        <small>aguardando entrega</small>
      </div>
      <div className={oldest>=25?'critical':oldest>=15?'warning':''}>
        <span>MAIOR ESPERA</span>
        <strong>{oldest} min</strong>
        <small>pedido mais antigo</small>
      </div>
    </div>

    <div className="kds47-toolbar">
      <div>
        <i className="kds47-live-dot"/>
        <span>Atualizacao automatica a cada 5 segundos</span>
      </div>
      <button
        className="ghost"
        disabled={loading}
        onClick={()=>load()}
      >
        {loading?'ATUALIZANDO...':'ATUALIZAR AGORA'}
      </button>
    </div>

    {error&&
      <div className="kds47-error">
        <b>ATENCAO</b>
        <span>{error}</span>
        <button onClick={()=>load()}>TENTAR NOVAMENTE</button>
      </div>
    }

    <div className="kds47-board">
      {columns.map(col=>{
        const list=items
          .filter(i=>i.status===col.status)
          .sort((a,b)=>{
            const da=createdAt(a)?.getTime()||0;
            const db=createdAt(b)?.getTime()||0;
            return da-db;
          });

        return <div
          className={`kds47-column status-${col.status.toLowerCase()}`}
          key={col.status}
        >
          <header>
            <div>
              <span>{col.short}</span>
              <strong>{col.label}</strong>
            </div>
            <b>{list.length}</b>
          </header>

          <div className="kds47-stack">
            {list.length===0&&
              <div className="kds47-empty">
                <span>✓</span>
                <strong>FILA LIMPA</strong>
                <small>Nenhum item nesta etapa.</small>
              </div>
            }

            {list.map(item=>
              <article
                className={`kds47-ticket ${ageClass(item)}`}
                key={item.id}
              >
                <div className="kds47-ticket-top">
                  <div>
                    <span className="kds47-table">
                      {item.table_name||item.order_label||`COMANDA #${item.order_id}`}
                    </span>
                    <small>COMANDA #{item.order_id}</small>
                  </div>

                  <div className="kds47-age">
                    <strong>{timeLabel(item)}</strong>
                    <small>{clockLabel(item)}</small>
                  </div>
                </div>

                <div className="kds47-product">
                  <span>{num(item.qty)}x</span>
                  <strong>{item.product_name}</strong>
                </div>

                <div className="kds47-meta">
                  <span>{item.category||'COZINHA'}</span>
                  {item.employee_name&&
                    <span>{item.employee_name}</span>
                  }
                </div>

                {item.notes
                  ?<div className="kds47-note">
                      <b>OBSERVACAO</b>
                      <p>{item.notes}</p>
                    </div>
                  :<div className="kds47-no-note">
                      SEM OBSERVACOES
                    </div>
                }

                <div className="kds47-wait">
                  <span>Tempo em fila</span>
                  <strong>{minutes(item)} min</strong>
                </div>

                <button
                  className="kds47-action"
                  disabled={actionId===item.id}
                  onClick={()=>advance(item,col.next)}
                >
                  {actionId===item.id
                    ?'ATUALIZANDO...'
                    :col.action
                  }
                </button>
              </article>
            )}
          </div>
        </div>
      })}
    </div>
  </section>
}
function Beverages({products,onDone}){const[data,setData]=useState([]),[selected,setSelected]=useState(''),[form,setForm]=useState({unit_type:'DOSE',package_ml:1000,dose_ml:50,stock_unit:'ML'}),[adjust,setAdjust]=useState('');const load=async()=>setData(await api.beverageControl());useEffect(()=>{load()},[]);async function configure(){if(!selected)return;await api.updateBeverage(selected,form);await load();onDone()}async function stock(){if(!selected||!adjust)return;await api.adjustStock(selected,{qty:Number(adjust),notes:'Entrada/ajuste pelo controle de bebidas'});setAdjust('');await load();onDone()}return <section className="page"><Head eyebrow="BEVERAGE INTELLIGENCE" title="Unidade, garrafa, mililitro e dose sob controle" text="Defina o tamanho real da dose e a NEXUS calcula rendimento teórico e baixa correta de estoque."/><div className="grid two"><div className="panel"><h3>Configurar bebida por dose</h3><div className="form-stack"><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Escolha um produto</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><label>Volume da embalagem (ml)<input type="number" value={form.package_ml} onChange={e=>setForm({...form,package_ml:e.target.value})}/></label><label>Dose padrão (ml)<input type="number" value={form.dose_ml} onChange={e=>setForm({...form,dose_ml:e.target.value})}/></label><button className="primary" onClick={configure}>Ativar controle por dose</button><div className="form-inline"><input type="number" placeholder="Entrada em ml (+) ou ajuste (-)" value={adjust} onChange={e=>setAdjust(e.target.value)}/><button onClick={stock}>Ajustar estoque</button></div></div></div><div className="panel"><h3>Como funciona</h3><p className="v03-lead">Ex.: garrafa 1.000 ml + dose 50 ml = 20 doses teóricas. Uma venda de 1 dose reduz 50 ml do saldo. Assim o sistema consegue comparar rendimento esperado e realizado.</p></div></div><div className="panel table-wrap"><table><thead><tr><th>Bebida</th><th>Estoque</th><th>Dose</th><th>Doses teóricas</th><th>Preço</th></tr></thead><tbody>{data.map(x=><tr key={x.id}><td><b>{x.name}</b><small>{x.category}</small></td><td>{num(x.stock)} {x.stock_unit}</td><td>{x.dose_ml?`${num(x.dose_ml)} ml`:'—'}</td><td>{num(x.theoretical_servings)}</td><td>{money(x.price)}</td></tr>)}</tbody></table></div></section>}
function Procurement({products}){const[suppliers,setSuppliers]=useState([]),[quotes,setQuotes]=useState([]),[supplier,setSupplier]=useState({name:'',phone:''}),[title,setTitle]=useState(''),[active,setActive]=useState(null),[offer,setOffer]=useState({supplier_id:'',product_id:'',description:'',qty:1,unit_price:'',freight:0,lead_days:''}),[best,setBest]=useState([]);const load=async()=>{setSuppliers(await api.suppliersV03());setQuotes(await api.quotesV03())};useEffect(()=>{load()},[]);async function addSupplier(){await api.createSupplierV03(supplier);setSupplier({name:'',phone:''});load()}async function addQuote(){const q=await api.createQuoteV03({title});setTitle('');setActive(await api.quoteV03(q.id));load()}async function select(id){setActive(await api.quoteV03(id));setBest(await api.bestQuoteV03(id))}async function addOffer(){await api.addQuoteItemV03(active.id,{...offer,description:offer.description||products.find(p=>String(p.id)===String(offer.product_id))?.name||''});setActive(await api.quoteV03(active.id));setBest(await api.bestQuoteV03(active.id));setOffer({...offer,unit_price:'',freight:0})}return <section className="page"><Head eyebrow="SMART PROCUREMENT" title="Central de fornecedores, cotações e melhor compra" text="Compare preço, frete e prazo antes de tirar dinheiro do caixa."/><div className="grid two"><div className="panel"><h3>Fornecedores</h3><div className="form-inline"><input placeholder="Fornecedor" value={supplier.name} onChange={e=>setSupplier({...supplier,name:e.target.value})}/><input placeholder="Telefone" value={supplier.phone} onChange={e=>setSupplier({...supplier,phone:e.target.value})}/><button className="primary" onClick={addSupplier}>Cadastrar</button></div>{suppliers.map(s=><div className="list-row" key={s.id}><b>{s.name}</b><small>{s.phone||s.email||'Sem contato'}</small></div>)}</div><div className="panel"><h3>Nova cotação</h3><div className="form-inline"><input placeholder="Ex.: Reposição de bebidas 15/09" value={title} onChange={e=>setTitle(e.target.value)}/><button className="primary" onClick={addQuote}>Abrir cotação</button></div>{quotes.map(q=><button className="v03-quote-row" key={q.id} onClick={()=>select(q.id)}><span>{q.title}</span><small>{q.offers} ofertas</small><b>{q.best_unit_price?money(q.best_unit_price):'—'}</b></button>)}</div></div>{active&&<div className="panel"><h3>{active.title}</h3><div className="v03-offer-form"><select value={offer.supplier_id} onChange={e=>setOffer({...offer,supplier_id:e.target.value})}><option value="">Fornecedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={offer.product_id} onChange={e=>{const p=products.find(x=>String(x.id)===e.target.value);setOffer({...offer,product_id:e.target.value,description:p?.name||''})}}><option value="">Produto</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input type="number" value={offer.qty} onChange={e=>setOffer({...offer,qty:e.target.value})} placeholder="Qtd"/><input type="number" step="0.01" value={offer.unit_price} onChange={e=>setOffer({...offer,unit_price:e.target.value})} placeholder="Preço unitário"/><input type="number" step="0.01" value={offer.freight} onChange={e=>setOffer({...offer,freight:e.target.value})} placeholder="Frete"/><input type="number" value={offer.lead_days} onChange={e=>setOffer({...offer,lead_days:e.target.value})} placeholder="Prazo dias"/><button className="primary" onClick={addOffer}>Adicionar oferta</button></div><div className="grid two"><div><h4>Todas as ofertas</h4>{active.items.map(x=><div className="list-row" key={x.id}><div><b>{x.description}</b><small>{x.supplier_name} • {x.lead_days ? x.lead_days : '\u2014'} dias</small></div><strong>{money(x.total_offer)}</strong></div>)}</div><div><h4>Melhor compra detectada</h4>{best.map(x=><div className="list-row best" key={x.id}><div><b>{x.description}</b><small>{x.supplier_name}</small></div><strong>{money(x.total_offer)}</strong></div>)}</div></div></div>}</section>}
function Mini({label,value}){return <div><span>{label}</span><strong>{value}</strong></div>}

/* NEXUS_MESAS_COMANDAS_V45_STYLE */
const NEXUS_MESAS_COMANDAS_V45_STYLE = `
.nexus-orders-v45 .v45-order-toolbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  margin-bottom:16px;
}
.nexus-orders-v45 .v45-order-toolbar>div{
  display:flex;
  flex-direction:column;
  gap:4px;
}
.nexus-orders-v45 .v45-order-toolbar small{
  opacity:.68;
}
.nexus-orders-v45 .v45-clickable-order{
  cursor:pointer;
  transition:border-color .18s ease,transform .18s ease,background .18s ease;
}
.nexus-orders-v45 .v45-clickable-order em{
  display:block;
  margin-top:10px;
  font-size:10px;
  font-style:normal;
  letter-spacing:.12em;
  opacity:.62;
}
@media (hover:hover) and (pointer:fine){
  .nexus-orders-v45 .v45-clickable-order:hover{
    transform:translateY(-2px);
  }
}
`;

if(typeof document!=='undefined'&&!document.getElementById('nexus-mesas-comandas-v45-style')){
  const style=document.createElement('style');
  style.id='nexus-mesas-comandas-v45-style';
  style.textContent=NEXUS_MESAS_COMANDAS_V45_STYLE;
  document.head.appendChild(style);
}
/* NEXUS_KDS_V47_PREMIUM_STYLE */
const NEXUS_KDS_V47_PREMIUM_STYLE = `
.nexus-kds-v47{
  min-height:calc(100vh - 110px);
}
.kds47-hero{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:24px;
  padding:24px 26px;
  margin-bottom:14px;
  border:1px solid rgba(255,255,255,.08);
  border-radius:20px;
  background:
    radial-gradient(circle at 85% 10%,rgba(212,175,55,.10),transparent 34%),
    linear-gradient(145deg,rgba(20,20,22,.98),rgba(8,8,10,.98));
}
.kds47-eyebrow{
  display:block;
  margin-bottom:8px;
  font-size:10px;
  font-weight:800;
  letter-spacing:.18em;
  color:#d9ba62;
}
.kds47-hero h2{
  margin:0;
  font-size:28px;
  line-height:1.05;
}
.kds47-hero p{
  max-width:680px;
  margin:9px 0 0;
  opacity:.68;
}
.kds47-clock{
  min-width:190px;
  text-align:right;
}
.kds47-clock small{
  display:block;
  font-size:9px;
  letter-spacing:.16em;
  opacity:.55;
}
.kds47-clock strong{
  display:block;
  margin:3px 0 6px;
  font-size:25px;
  font-variant-numeric:tabular-nums;
}
.kds47-clock span{
  display:flex;
  justify-content:flex-end;
  align-items:center;
  gap:7px;
  font-size:9px;
  font-weight:800;
  letter-spacing:.08em;
  opacity:.7;
}
.kds47-clock i,
.kds47-live-dot{
  width:8px;
  height:8px;
  border-radius:50%;
  background:#6bdc91;
  box-shadow:0 0 12px rgba(107,220,145,.7);
}
.kds47-summary{
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:10px;
  margin-bottom:12px;
}
.kds47-summary>div{
  padding:15px 16px;
  border:1px solid rgba(255,255,255,.07);
  border-radius:15px;
  background:rgba(16,16,18,.88);
}
.kds47-summary span{
  display:block;
  font-size:9px;
  font-weight:800;
  letter-spacing:.12em;
  opacity:.58;
}
.kds47-summary strong{
  display:block;
  margin:5px 0 2px;
  font-size:22px;
}
.kds47-summary small{
  font-size:10px;
  opacity:.5;
}
.kds47-summary .warning{
  border-color:rgba(238,181,73,.42);
}
.kds47-summary .critical{
  border-color:rgba(230,88,88,.52);
}
.kds47-toolbar{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:14px;
  margin-bottom:14px;
  padding:10px 4px;
}
.kds47-toolbar>div{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:11px;
  opacity:.65;
}
.kds47-error{
  display:flex;
  align-items:center;
  gap:12px;
  padding:12px 15px;
  margin-bottom:14px;
  border:1px solid rgba(230,88,88,.45);
  border-radius:13px;
  background:rgba(130,25,25,.14);
}
.kds47-error span{
  flex:1;
}
.kds47-board{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:14px;
  align-items:start;
}
.kds47-column{
  min-width:0;
  padding:10px;
  border:1px solid rgba(255,255,255,.07);
  border-radius:19px;
  background:rgba(9,9,11,.72);
}
.kds47-column>header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:9px 8px 15px;
}
.kds47-column>header div{
  display:flex;
  flex-direction:column;
  gap:2px;
}
.kds47-column>header span{
  font-size:9px;
  font-weight:800;
  letter-spacing:.14em;
  opacity:.48;
}
.kds47-column>header strong{
  font-size:13px;
  letter-spacing:.04em;
}
.kds47-column>header>b{
  display:grid;
  place-items:center;
  min-width:34px;
  height:34px;
  padding:0 8px;
  border-radius:11px;
  background:rgba(255,255,255,.07);
  font-size:16px;
}
.kds47-stack{
  display:flex;
  flex-direction:column;
  gap:10px;
}
.kds47-ticket{
  position:relative;
  overflow:hidden;
  padding:15px;
  border:1px solid rgba(255,255,255,.09);
  border-radius:16px;
  background:
    linear-gradient(145deg,rgba(27,27,30,.98),rgba(15,15,17,.98));
}
.kds47-ticket:before{
  content:'';
  position:absolute;
  left:0;
  top:0;
  bottom:0;
  width:3px;
  background:rgba(212,175,55,.75);
}
.kds47-ticket.warning{
  border-color:rgba(238,181,73,.38);
}
.kds47-ticket.warning:before{
  background:#eeb549;
}
.kds47-ticket.critical{
  border-color:rgba(230,88,88,.48);
  box-shadow:0 0 24px rgba(170,35,35,.08);
}
.kds47-ticket.critical:before{
  background:#e65858;
}
.kds47-ticket-top{
  display:flex;
  justify-content:space-between;
  gap:12px;
}
.kds47-ticket-top>div:first-child{
  display:flex;
  flex-direction:column;
  gap:3px;
}
.kds47-table{
  font-size:14px;
  font-weight:900;
}
.kds47-ticket-top small{
  font-size:9px;
  letter-spacing:.09em;
  opacity:.48;
}
.kds47-age{
  text-align:right;
}
.kds47-age strong{
  display:block;
  font-size:12px;
}
.kds47-age small{
  display:block;
  margin-top:3px;
}
.kds47-product{
  display:grid;
  grid-template-columns:auto 1fr;
  align-items:center;
  gap:10px;
  margin:16px 0 10px;
}
.kds47-product span{
  display:grid;
  place-items:center;
  min-width:42px;
  height:42px;
  padding:0 8px;
  border-radius:12px;
  background:rgba(212,175,55,.10);
  border:1px solid rgba(212,175,55,.22);
  font-size:15px;
  font-weight:900;
  color:#e3c66f;
}
.kds47-product strong{
  font-size:17px;
  line-height:1.15;
}
.kds47-meta{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  margin-bottom:11px;
}
.kds47-meta span{
  padding:5px 7px;
  border-radius:7px;
  background:rgba(255,255,255,.05);
  font-size:8px;
  font-weight:800;
  letter-spacing:.08em;
  opacity:.68;
}
.kds47-note{
  padding:10px 11px;
  margin-bottom:11px;
  border-radius:10px;
  border:1px solid rgba(238,181,73,.24);
  background:rgba(238,181,73,.07);
}
.kds47-note b{
  display:block;
  margin-bottom:4px;
  font-size:8px;
  letter-spacing:.14em;
  color:#e6c46a;
}
.kds47-note p{
  margin:0;
  font-size:13px;
  font-weight:700;
  line-height:1.35;
}
.kds47-no-note{
  padding:8px 0 10px;
  font-size:9px;
  letter-spacing:.08em;
  opacity:.35;
}
.kds47-wait{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:8px 0 11px;
  border-top:1px solid rgba(255,255,255,.06);
  font-size:10px;
}
.kds47-wait span{
  opacity:.5;
}
.kds47-wait strong{
  font-size:11px;
}
.kds47-ticket.warning .kds47-wait strong{
  color:#eeb549;
}
.kds47-ticket.critical .kds47-wait strong{
  color:#ef7777;
}
.kds47-action{
  width:100%;
  min-height:44px;
  border:1px solid rgba(212,175,55,.32);
  border-radius:11px;
  background:linear-gradient(135deg,rgba(212,175,55,.18),rgba(212,175,55,.08));
  font-size:10px;
  font-weight:900;
  letter-spacing:.08em;
  cursor:pointer;
}
.kds47-action:disabled{
  cursor:wait;
  opacity:.45;
}
.status-ready .kds47-action{
  border-color:rgba(107,220,145,.32);
  background:rgba(107,220,145,.10);
}
.kds47-empty{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  min-height:145px;
  border:1px dashed rgba(255,255,255,.08);
  border-radius:14px;
  text-align:center;
}
.kds47-empty span{
  display:grid;
  place-items:center;
  width:34px;
  height:34px;
  margin-bottom:8px;
  border-radius:50%;
  background:rgba(107,220,145,.08);
  font-size:16px;
  opacity:.7;
}
.kds47-empty strong{
  font-size:10px;
  letter-spacing:.12em;
  opacity:.52;
}
.kds47-empty small{
  margin-top:4px;
  opacity:.32;
}
@media(max-width:1180px){
  .kds47-summary{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
  .kds47-board{
    grid-template-columns:1fr;
  }
}
@media(max-width:720px){
  .kds47-hero{
    flex-direction:column;
  }
  .kds47-clock{
    min-width:0;
    text-align:left;
  }
  .kds47-clock span{
    justify-content:flex-start;
  }
  .kds47-summary{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .kds47-toolbar{
    align-items:stretch;
    flex-direction:column;
  }
}
`;

if(typeof document!=='undefined'&&!document.getElementById('nexus-kds-v47-premium-style')){
  const style=document.createElement('style');
  style.id='nexus-kds-v47-premium-style';
  style.textContent=NEXUS_KDS_V47_PREMIUM_STYLE;
  document.head.appendChild(style);
}