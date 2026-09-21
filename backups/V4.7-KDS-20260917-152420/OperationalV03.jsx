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
function KDS(){const[items,setItems]=useState([]);const load=async()=>setItems(await api.kitchen());useEffect(()=>{load();const t=setInterval(load,5000);return()=>clearInterval(t)},[]);async function set(id,status){await api.setOrderItemStatus(id,status);await load()}const cols=[['NEW','NOVOS'],['PREPARING','PREPARANDO'],['READY','PRONTOS']];return <section className="page"><Head eyebrow="KITCHEN DISPLAY SYSTEM" title="Cozinha em fluxo ao vivo" text="Pedidos lançados nas comandas chegam aqui automaticamente."/><div className="v03-kds">{cols.map(([status,label])=><div className="v03-kds-col" key={status}><h3>{label}<b>{items.filter(i=>i.status===status).length}</b></h3>{items.filter(i=>i.status===status).map(i=><article key={i.id}><span>{i.table_name||i.order_label}</span><strong>{num(i.qty)}× {i.product_name}</strong><p>{i.notes||'Sem observações'}</p><small>{new Date(i.created_at+'Z').toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small>{status==='NEW'&&<button onClick={()=>set(i.id,'PREPARING')}>Iniciar</button>}{status==='PREPARING'&&<button onClick={()=>set(i.id,'READY')}>Marcar pronto</button>}{status==='READY'&&<button onClick={()=>set(i.id,'SERVED')}>Entregue</button>}</article>)}</div>)}</div></section>}
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