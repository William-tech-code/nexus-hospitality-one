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
/* NEXUS_BEVERAGE_V48A */
function Beverages({products,onDone}){
  const[data,setData]=useState([]);
  const[selected,setSelected]=useState('');
  const[form,setForm]=useState({
    unit_type:'DOSE',
    package_ml:1000,
    dose_ml:50,
    stock_unit:'ML'
  });
  const[adjust,setAdjust]=useState('');
  const[adjustMode,setAdjustMode]=useState('ML');
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const[success,setSuccess]=useState('');

  async function load(){
    try{
      const rows=await api.beverageControl();
      setData(Array.isArray(rows)?rows:[]);
      setError('');
    }catch(e){
      setError(e?.message||'Falha ao carregar bebidas.');
    }
  }

  useEffect(()=>{
    load();
  },[]);

  const currentProduct=products.find(
    p=>String(p.id)===String(selected)
  );

  const currentData=data.find(
    p=>String(p.id)===String(selected)
  );

  function selectProduct(id){
    setSelected(id);
    setError('');
    setSuccess('');
    setAdjust('');

    const p=products.find(x=>String(x.id)===String(id));

    if(!p){
      setForm({
        unit_type:'DOSE',
        package_ml:1000,
        dose_ml:50,
        stock_unit:'ML'
      });
      return;
    }

    setForm({
      unit_type:p.unit_type||'DOSE',
      package_ml:Number(p.package_ml)||1000,
      dose_ml:Number(p.dose_ml)||50,
      stock_unit:p.stock_unit||'ML'
    });

    setAdjustMode(
      String(p.stock_unit||'').toUpperCase()==='ML'
        ?'ML'
        :'PACKAGE'
    );
  }

  const packageMl=Math.max(0,Number(form.package_ml)||0);
  const doseMl=Math.max(0,Number(form.dose_ml)||0);

  const dosesPerPackage=
    packageMl>0&&doseMl>0
      ?packageMl/doseMl
      :0;

  const configuredStockUnit=
    String(currentData?.stock_unit||currentProduct?.stock_unit||'UN')
      .toUpperCase();

  const currentStock=
    Number(currentData?.stock??currentProduct?.stock??0)||0;

  const stockMl=
    configuredStockUnit==='ML'
      ?currentStock
      :0;

  const theoreticalDoses=
    configuredStockUnit==='ML'&&doseMl>0
      ?stockMl/doseMl
      :Number(currentData?.theoretical_servings)||0;

  const equivalentBottles=
    configuredStockUnit==='ML'&&packageMl>0
      ?stockMl/packageMl
      :0;

  const projectedRevenue=
    theoreticalDoses*
    (Number(currentData?.price??currentProduct?.price??0)||0);

  const configuredCorrectly=
    String(currentData?.stock_unit||'').toUpperCase()==='ML' &&
    Number(currentData?.dose_ml)>0 &&
    Number(currentData?.stock_factor)===Number(currentData?.dose_ml);

  async function configure(){
    if(!selected){
      setError('Selecione uma bebida.');
      return;
    }

    if(packageMl<=0){
      setError('Informe o volume correto da embalagem.');
      return;
    }

    if(doseMl<=0){
      setError('Informe o tamanho correto da dose.');
      return;
    }

    if(doseMl>packageMl){
      setError('A dose nao pode ser maior que a embalagem.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try{
      await api.updateBeverage(selected,{
        unit_type:'DOSE',
        package_ml:packageMl,
        dose_ml:doseMl,
        stock_unit:'ML'
      });

      await load();

      setSuccess(
        'Controle por dose ativado. Cada venda de 1 dose consumira '+
        doseMl+
        ' ml do estoque.'
      );

      if(onDone)await onDone();
    }catch(e){
      setError(e?.message||'Nao foi possivel configurar a bebida.');
    }finally{
      setBusy(false);
    }
  }

  function adjustmentQty(){
    const value=Number(adjust)||0;

    if(adjustMode==='PACKAGE'){
      return value*packageMl;
    }

    return value;
  }

  async function stock(){
    if(!selected){
      setError('Selecione uma bebida.');
      return;
    }

    const qty=adjustmentQty();

    if(!qty){
      setError('Informe uma quantidade para o ajuste.');
      return;
    }

    if(
      String(currentData?.stock_unit||currentProduct?.stock_unit||'')
        .toUpperCase()!=='ML'
    ){
      setError(
        'Ative primeiro o controle em ML antes de movimentar estoque por garrafa ou mililitro.'
      );
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try{
      await api.adjustStock(selected,{
        qty,
        notes:
          adjustMode==='PACKAGE'
            ?`Ajuste de ${adjust} embalagem(ns) x ${packageMl} ml pelo Beverage Intelligence`
            :`Ajuste manual de ${qty} ml pelo Beverage Intelligence`
      });

      setAdjust('');
      await load();

      setSuccess(
        qty>0
          ?`Entrada registrada: ${qty} ml.`
          :`Saida registrada: ${Math.abs(qty)} ml.`
      );

      if(onDone)await onDone();
    }catch(e){
      setError(e?.message||'Nao foi possivel ajustar o estoque.');
    }finally{
      setBusy(false);
    }
  }

  const totalMl=data.reduce(
    (a,x)=>
      a+(
        String(x.stock_unit||'').toUpperCase()==='ML'
          ?Number(x.stock)||0
          :0
      ),
    0
  );

  const totalDoses=data.reduce(
    (a,x)=>a+(Number(x.theoretical_servings)||0),
    0
  );

  const lowStock=data.filter(x=>
    Number(x.minimum_stock)>0 &&
    Number(x.stock)<=Number(x.minimum_stock)
  ).length;

  return <section className="page nexus-beverage-v48a">

    <div className="bev48-hero">
      <div>
        <span className="bev48-eyebrow">
          BEVERAGE INTELLIGENCE / STOCK ENGINE
        </span>
        <h2>Bebidas, garrafas e doses sob controle</h2>
        <p>
          Transforme garrafas em mililitros, mililitros em doses
          e acompanhe o rendimento teorico do bar.
        </p>
      </div>

      <div className="bev48-badge">
        <small>MOTOR</small>
        <strong>DOSE + ML</strong>
        <span>BAIXA AUTOMATICA</span>
      </div>
    </div>

    <div className="bev48-kpis">
      <div>
        <span>BEBIDAS CONTROLADAS</span>
        <strong>{data.length}</strong>
        <small>produtos configurados</small>
      </div>

      <div>
        <span>ESTOQUE CONTROLADO</span>
        <strong>{num(totalMl)} ml</strong>
        <small>saldo em mililitros</small>
      </div>

      <div>
        <span>DOSES DISPONIVEIS</span>
        <strong>{num(totalDoses)}</strong>
        <small>rendimento teorico</small>
      </div>

      <div className={lowStock?'warning':''}>
        <span>ESTOQUE BAIXO</span>
        <strong>{lowStock}</strong>
        <small>alertas ativos</small>
      </div>
    </div>

    {error&&
      <div className="bev48-message error">
        <strong>ATENCAO</strong>
        <span>{error}</span>
      </div>
    }

    {success&&
      <div className="bev48-message success">
        <strong>CONCLUIDO</strong>
        <span>{success}</span>
      </div>
    }

    <div className="bev48-layout">

      <div className="panel bev48-config">
        <div className="bev48-section-title">
          <div>
            <span>CONFIGURACAO</span>
            <h3>Controle por dose</h3>
          </div>
          <b>01</b>
        </div>

        <label className="bev48-field">
          <span>Produto</span>
          <select
            value={selected}
            onChange={e=>selectProduct(e.target.value)}
          >
            <option value="">Selecione uma bebida</option>
            {products.map(p=>
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            )}
          </select>
        </label>

        <div className="bev48-form-grid">
          <label className="bev48-field">
            <span>Volume da garrafa</span>
            <div className="bev48-input-unit">
              <input
                type="number"
                min="1"
                value={form.package_ml}
                onChange={e=>setForm({
                  ...form,
                  package_ml:e.target.value
                })}
              />
              <b>ML</b>
            </div>
          </label>

          <label className="bev48-field">
            <span>Dose padrao</span>
            <div className="bev48-input-unit">
              <input
                type="number"
                min="1"
                value={form.dose_ml}
                onChange={e=>setForm({
                  ...form,
                  dose_ml:e.target.value
                })}
              />
              <b>ML</b>
            </div>
          </label>
        </div>

        <div className="bev48-preview">
          <div>
            <span>1 GARRAFA</span>
            <strong>{num(packageMl)} ml</strong>
          </div>

          <div className="bev48-arrow">/</div>

          <div>
            <span>1 DOSE</span>
            <strong>{num(doseMl)} ml</strong>
          </div>

          <div className="bev48-equals">=</div>

          <div className="highlight">
            <span>RENDIMENTO</span>
            <strong>{num(dosesPerPackage)} doses</strong>
          </div>
        </div>

        <button
          className="primary bev48-main-action"
          disabled={busy||!selected}
          onClick={configure}
        >
          {busy
            ?'PROCESSANDO...'
            :'ATIVAR CONTROLE POR DOSE'
          }
        </button>

        <div className="bev48-rule">
          <strong>REGRA DE BAIXA</strong>
          <p>
            Com estoque em ML, cada venda de uma dose desconta
            exatamente o volume definido acima.
          </p>
        </div>
      </div>

      <div className="panel bev48-stock">
        <div className="bev48-section-title">
          <div>
            <span>ESTOQUE</span>
            <h3>Entrada e ajuste</h3>
          </div>
          <b>02</b>
        </div>

        {!selected
          ?<div className="bev48-empty-select">
              <strong>SELECIONE UMA BEBIDA</strong>
              <span>
                O saldo, rendimento e movimentacao aparecerao aqui.
              </span>
            </div>
          :<>
            <div className="bev48-product-name">
              <span>PRODUTO SELECIONADO</span>
              <strong>{currentProduct?.name||currentData?.name}</strong>
              <small>{currentProduct?.category||currentData?.category}</small>
            </div>

            <div className="bev48-stock-cards">
              <div>
                <span>SALDO</span>
                <strong>
                  {num(currentStock)} {configuredStockUnit}
                </strong>
              </div>

              <div>
                <span>GARRAFAS EQUIVALENTES</span>
                <strong>{num(equivalentBottles)}</strong>
              </div>

              <div>
                <span>DOSES TEORICAS</span>
                <strong>{num(theoreticalDoses)}</strong>
              </div>

              <div>
                <span>RECEITA POTENCIAL</span>
                <strong>{money(projectedRevenue)}</strong>
              </div>
            </div>

            <div className={
              `bev48-integrity ${
                configuredCorrectly?'ok':'attention'
              }`
            }>
              <strong>
                {configuredCorrectly
                  ?'CONFIGURACAO CONSISTENTE'
                  :'CONFIGURACAO REQUER ATENCAO'
                }
              </strong>

              <span>
                {configuredCorrectly
                  ?`1 dose = ${num(currentData?.stock_factor)} ml de baixa automatica.`
                  :'Para baixa exata por dose, configure este produto com estoque em ML.'
                }
              </span>
            </div>

            <div className="bev48-adjust">
              <div className="bev48-adjust-tabs">
                <button
                  className={adjustMode==='PACKAGE'?'active':''}
                  onClick={()=>setAdjustMode('PACKAGE')}
                >
                  GARRAFAS
                </button>

                <button
                  className={adjustMode==='ML'?'active':''}
                  onClick={()=>setAdjustMode('ML')}
                >
                  MILILITROS
                </button>
              </div>

              <label className="bev48-field">
                <span>
                  {adjustMode==='PACKAGE'
                    ?'Quantidade de garrafas'
                    :'Quantidade em ML'
                  }
                </span>

                <input
                  type="number"
                  step="any"
                  placeholder={
                    adjustMode==='PACKAGE'
                      ?'Ex.: 12'
                      :'Ex.: 12000'
                  }
                  value={adjust}
                  onChange={e=>setAdjust(e.target.value)}
                />
              </label>

              {adjust&&
                <div className="bev48-conversion">
                  MOVIMENTO:
                  <strong>
                    {' '}
                    {num(adjustmentQty())} ml
                  </strong>
                </div>
              }

              <button
                className="primary"
                disabled={busy||!adjust}
                onClick={stock}
              >
                REGISTRAR MOVIMENTO
              </button>

              <small className="bev48-help">
                Use valor positivo para entrada e negativo
                somente para ajuste manual de saida.
              </small>
            </div>
          </>
        }
      </div>
    </div>

    <div className="panel bev48-table-panel">
      <div className="bev48-table-head">
        <div>
          <span>INVENTARIO DE BEBIDAS</span>
          <h3>Rendimento atual</h3>
        </div>

        <button
          className="ghost"
          disabled={busy}
          onClick={load}
        >
          ATUALIZAR
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bebida</th>
              <th>Controle</th>
              <th>Estoque</th>
              <th>Embalagem</th>
              <th>Dose</th>
              <th>Rendimento</th>
              <th>Preco</th>
              <th>Potencial</th>
            </tr>
          </thead>

          <tbody>
            {data.length===0&&
              <tr>
                <td colSpan="8">
                  Nenhuma bebida configurada para controle por dose.
                </td>
              </tr>
            }

            {data.map(x=>{
              const servings=Number(x.theoretical_servings)||0;
              const potential=servings*(Number(x.price)||0);
              const valid=
                String(x.stock_unit||'').toUpperCase()==='ML' &&
                Number(x.dose_ml)>0 &&
                Number(x.stock_factor)===Number(x.dose_ml);

              return <tr key={x.id}>
                <td>
                  <b>{x.name}</b>
                  <small>{x.category}</small>
                </td>

                <td>
                  <span className={
                    `bev48-status ${valid?'ok':'attention'}`
                  }>
                    {valid?'DOSE / ML':'REVISAR'}
                  </span>
                </td>

                <td>
                  {num(x.stock)} {x.stock_unit}
                </td>

                <td>
                  {x.package_ml
                    ?`${num(x.package_ml)} ml`
                    :'-'
                  }
                </td>

                <td>
                  {x.dose_ml
                    ?`${num(x.dose_ml)} ml`
                    :'-'
                  }
                </td>

                <td>
                  <strong>{num(servings)} doses</strong>
                </td>

                <td>{money(x.price)}</td>

                <td>{money(potential)}</td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
    </div>
  </section>
}
function ProcurementV49B({products}){
  const[suppliers,setSuppliers]=useState([]);
  const[quotes,setQuotes]=useState([]);
  const[need,setNeed]=useState([]);
  const[loading,setLoading]=useState(true);
  const[msg,setMsg]=useState('');
  const[supplier,setSupplier]=useState({name:'',contact:'',phone:'',email:''});
  const[title,setTitle]=useState('');
  const[deadline,setDeadline]=useState('');
  const[selectedSuppliers,setSelectedSuppliers]=useState([]);
  const[selectedProducts,setSelectedProducts]=useState({});
  const[links,setLinks]=useState([]);
  const[analysis,setAnalysis]=useState(null);
  const[busy,setBusy]=useState(false);

  async function load(){
    setLoading(true);
    try{
      const [ss,qq,nn]=await Promise.all([
        api.suppliersV03(),
        api.quotesV13(),
        api.procurementNeedV49B()
      ]);

      setSuppliers(ss||[]);
      setQuotes(qq||[]);
      setNeed(nn?.items||[]);

      const auto={};

      for(const x of nn?.items||[]){
        if(Number(x.suggested_qty)>0){
          auto[x.product_id]=Number(x.suggested_qty);
        }
      }

      setSelectedProducts(auto);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{load()},[]);

  async function addSupplier(){
    if(!supplier.name.trim()){
      setMsg('Informe o nome do fornecedor.');
      return;
    }

    setBusy(true);

    try{
      await api.createSupplierV03(supplier);
      setSupplier({name:'',contact:'',phone:'',email:''});
      setMsg('Fornecedor cadastrado.');
      await load();
    }catch(e){
      setMsg(e?.message||'Falha ao cadastrar fornecedor.');
    }finally{
      setBusy(false);
    }
  }

  function toggleSupplier(id){
    setSelectedSuppliers(old=>
      old.includes(id)
        ?old.filter(x=>x!==id)
        :[...old,id]
    );
  }

  function qty(productId,value){
    setSelectedProducts(old=>({
      ...old,
      [productId]:Math.max(0,Number(value)||0)
    }));
  }

  async function createQuote(){
    const items=need
      .filter(x=>Number(selectedProducts[x.product_id])>0)
      .map(x=>({
        product_id:x.product_id,
        qty:Number(selectedProducts[x.product_id]),
        unit:x.stock_unit||'UN',
        target_price:x.cost||null
      }));

    if(!title.trim()){
      setMsg('Informe o titulo da cotacao.');
      return;
    }

    if(!items.length){
      setMsg('Selecione pelo menos um produto.');
      return;
    }

    if(!selectedSuppliers.length){
      setMsg('Selecione pelo menos um fornecedor.');
      return;
    }

    setBusy(true);

    try{
      const out=await api.createQuoteV13({
        title,
        deadline_at:deadline||null,
        notes:'NEXUS V4.9B - Smart Procurement',
        items,
        supplier_ids:selectedSuppliers
      });

      setLinks(out.links||[]);
      setTitle('');
      setMsg('Cotacao criada. Links individuais gerados.');
      await load();
    }catch(e){
      setMsg(e?.message||'Falha ao criar cotacao.');
    }finally{
      setBusy(false);
    }
  }

  async function analyze(id){
    setBusy(true);

    try{
      const out=await api.smartQuoteAnalysisV49B(id);
      setAnalysis(out);
      setMsg('');
    }catch(e){
      setMsg(e?.message||'Falha na analise.');
    }finally{
      setBusy(false);
    }
  }

  async function finalize(){
    if(!analysis?.request?.id)return;

    if(!analysis.ready_to_finalize){
      setMsg('Ainda existem itens sem proposta valida.');
      return;
    }

    if(!window.confirm(
      'Aprovar a melhor proposta valida por produto e gerar os pedidos de compra?'
    ))return;

    setBusy(true);

    try{
      const out=await api.finalizeSmartQuoteV49B(analysis.request.id);
      setMsg(
        `${out.order_count} pedido(s) gerado(s) para ${out.supplier_count} fornecedor(es).`
      );
      setAnalysis(null);
      await load();
    }catch(e){
      setMsg(e?.message||'Falha ao gerar pedidos.');
    }finally{
      setBusy(false);
    }
  }

  function copyLink(path){
    const url=`${window.location.origin}${path}`;

    navigator.clipboard?.writeText(url);

    setMsg('Link do fornecedor copiado.');
  }

  const low=need.filter(x=>Number(x.suggested_qty)>0);

  return <section className="page">
    <Head
      eyebrow="NEXUS SMART PROCUREMENT V4.9B"
      title="Compras Inteligentes"
      text="Estoque gera a necessidade, fornecedores cotam por link e o NEXUS identifica o menor preco valido de cada produto."
    />

    {msg&&<div className="v06-notice">{msg}</div>}

    <div className="grid two">

      <div className="panel">
        <h3>Necessidade de compra</h3>
        <p>
          {low.length}
          {' '}
          produto(s) abaixo do estoque minimo.
        </p>

        {loading
          ?<div className="empty">Carregando estoque...</div>
          :need.map(x=>
            <div className="list-row" key={x.product_id}>
              <div>
                <b>{x.name}</b>
                <small>
                  Estoque {x.stock} {x.stock_unit}
                  {' • '}
                  Minimo {x.minimum_stock}
                </small>
              </div>

              <input
                style={{maxWidth:110}}
                type="number"
                min="0"
                step="1"
                value={selectedProducts[x.product_id]??0}
                onChange={e=>qty(x.product_id,e.target.value)}
                title="Quantidade para cotar"
              />
            </div>
          )
        }
      </div>

      <div className="panel">
        <h3>Fornecedores</h3>

        <div className="form-stack">
          <input
            placeholder="Fornecedor"
            value={supplier.name}
            onChange={e=>setSupplier({...supplier,name:e.target.value})}
          />

          <input
            placeholder="Contato"
            value={supplier.contact}
            onChange={e=>setSupplier({...supplier,contact:e.target.value})}
          />

          <input
            placeholder="Telefone / WhatsApp"
            value={supplier.phone}
            onChange={e=>setSupplier({...supplier,phone:e.target.value})}
          />

          <input
            placeholder="E-mail"
            value={supplier.email}
            onChange={e=>setSupplier({...supplier,email:e.target.value})}
          />

          <button
            className="primary"
            disabled={busy}
            onClick={addSupplier}
          >
            Cadastrar fornecedor
          </button>
        </div>

        <div style={{marginTop:18}}>
          {suppliers.map(s=>
            <label className="list-row" key={s.id}>
              <div>
                <b>{s.name}</b>
                <small>{s.phone||s.email||'Sem contato'}</small>
              </div>

              <input
                type="checkbox"
                checked={selectedSuppliers.includes(s.id)}
                onChange={()=>toggleSupplier(s.id)}
              />
            </label>
          )}

          {!suppliers.length&&
            <div className="empty">
              Cadastre os fornecedores que participarao das cotacoes.
            </div>
          }
        </div>
      </div>
    </div>

    <div className="panel">
      <h3>Abrir cotacao</h3>

      <div className="form-inline">
        <input
          placeholder="Ex.: Reposicao semanal"
          value={title}
          onChange={e=>setTitle(e.target.value)}
        />

        <input
          type="datetime-local"
          value={deadline}
          onChange={e=>setDeadline(e.target.value)}
        />

        <button
          className="primary"
          disabled={busy}
          onClick={createQuote}
        >
          Gerar cotacao e links
        </button>
      </div>

      {!!links.length&&
        <div style={{marginTop:18}}>
          <h4>Links dos fornecedores</h4>

          {links.map(x=>{
            const s=suppliers.find(a=>Number(a.id)===Number(x.supplier_id));

            return <div className="list-row" key={x.token}>
              <div>
                <b>{s?.name||`Fornecedor #${x.supplier_id}`}</b>
                <small>{x.path}</small>
              </div>

              <button onClick={()=>copyLink(x.path)}>
                Copiar link
              </button>
            </div>
          })}
        </div>
      }
    </div>

    <div className="panel">
      <h3>Cotacoes</h3>

      {!quotes.length&&
        <div className="empty">
          Nenhuma cotacao criada.
        </div>
      }

      {quotes.map(q=>
        <div className="list-row" key={q.id}>
          <div>
            <b>{q.title}</b>
            <small>
              {q.submitted}/{q.invited} responderam
              {' • '}
              {q.status}
            </small>
          </div>

          <button
            disabled={busy}
            onClick={()=>analyze(q.id)}
          >
            Analisar
          </button>
        </div>
      )}
    </div>

    {analysis&&
      <div className="panel">
        <h3>Mapa inteligente da cotacao</h3>

        <p>
          Estrategia: menor preco unitario valido por produto.
          Em empate, menor prazo de entrega.
        </p>

        {analysis.comparison.map(item=>
          <div
            key={item.item_id}
            style={{
              borderBottom:'1px solid rgba(255,255,255,.08)',
              padding:'16px 0'
            }}
          >
            <div className="list-row">
              <div>
                <b>{item.product_name}</b>
                <small>{item.qty} {item.unit}</small>
              </div>

              <strong>
                {item.best
                  ?money(item.best.subtotal)
                  :'Sem proposta'
                }
              </strong>
            </div>

            {item.offers.map((o,index)=>
              <div
                className={`list-row ${index===0?'best':''}`}
                key={`${item.item_id}-${o.supplier_id}`}
              >
                <div>
                  <b>
                    {index===0?'Melhor • ':''}
                    {o.supplier_name}
                  </b>

                  <small>
                    {o.brand||'Marca nao informada'}
                    {' • '}
                    {o.delivery_days??'—'} dias
                  </small>
                </div>

                <strong>
                  {money(o.unit_price)} / un.
                </strong>
              </div>
            )}
          </div>
        )}

        <h4>Pedidos que serao gerados</h4>

        {analysis.supplier_orders.map(x=>
          <div className="list-row" key={x.supplier_id}>
            <div>
              <b>{x.supplier_name}</b>
              <small>
                {x.items.length} item(ns)
                {' • '}
                Frete {money(x.freight)}
              </small>
            </div>

            <strong>{money(x.total)}</strong>
          </div>
        )}

        {!!analysis.uncovered_items.length&&
          <div className="v06-notice">
            Existem {analysis.uncovered_items.length} produto(s) sem proposta valida.
          </div>
        }

        <div
          className="list-row"
          style={{marginTop:18}}
        >
          <div>
            <b>Total previsto</b>
            <small>
              {analysis.supplier_orders.length} fornecedor(es) vencedor(es)
            </small>
          </div>

          <strong>{money(analysis.grand_total)}</strong>
        </div>

        <button
          className="primary"
          disabled={busy||!analysis.ready_to_finalize}
          onClick={finalize}
          style={{marginTop:18,width:'100%'}}
        >
          Aprovar e gerar pedidos
        </button>
      </div>
    }
  </section>
}

/* ============================================================
   NEXUS PURCHASE RECEIVING V4.9C
   ============================================================ */

function ProcurementV49C({products}){

  const [screen,setScreen]=useState('procurement');
  const [orders,setOrders]=useState([]);
  const [selected,setSelected]=useState(null);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');

  async function loadOrders(){

    try{

      const data=await api.purchaseOrdersV49C();

      setOrders(
        Array.isArray(data)
          ?data
          :[]
      );

    }catch(e){

      setMessage(
        e?.message||
        'Falha ao carregar pedidos.'
      );
    }
  }

  useEffect(()=>{

    if(screen==='receiving'){
      loadOrders();
    }

  },[screen]);

  async function openOrder(id){

    setLoading(true);
    setMessage('');

    try{

      const data=
        await api.purchaseOrderV49C(id);

      setSelected({
        ...data,

        items:(data.items||[]).map(item=>({
          ...item,
          receive_qty:Number(item.pending_qty||0),
          batch_code:'',
          manufactured_at:'',
          expires_at:'',
          receive_notes:''
        }))
      });

    }catch(e){

      setMessage(
        e?.message||
        'Falha ao abrir pedido.'
      );

    }finally{

      setLoading(false);
    }
  }

  function patchItem(id,key,value){

    setSelected(old=>({
      ...old,

      items:old.items.map(item=>
        Number(item.id)===Number(id)
          ?{
              ...item,
              [key]:value
            }
          :item
      )
    }));
  }

  async function receiveOrder(){

    if(!selected?.order?.id){
      return;
    }

    const items=selected.items
      .filter(item=>
        Number(item.receive_qty)>0
      )
      .map(item=>({
        purchase_item_id:item.id,
        qty:Number(item.receive_qty),
        batch_code:item.batch_code,
        manufactured_at:
          item.manufactured_at||null,
        expires_at:
          item.expires_at||null,
        notes:
          item.receive_notes||null
      }));

    if(!items.length){

      setMessage(
        'Informe ao menos uma quantidade recebida.'
      );

      return;
    }

    setLoading(true);
    setMessage('');

    try{

      const result=
        await api.receivePurchaseOrderV49C(
          selected.order.id,
          {items}
        );

      if(result.status==='RECEIVED'){

        setMessage(
          'Pedido recebido integralmente. Estoque e lotes atualizados.'
        );

      }else{

        setMessage(
          'Recebimento parcial registrado. O pedido continua pendente.'
        );
      }

      await loadOrders();
      await openOrder(selected.order.id);

    }catch(e){

      setMessage(
        e?.message||
        'Falha ao registrar recebimento.'
      );

    }finally{

      setLoading(false);
    }
  }

  if(screen==='procurement'){

    return <>

      <div
        className="panel"
        style={{
          marginBottom:14,
          display:'flex',
          gap:10,
          flexWrap:'wrap'
        }}
      >

        <button
          className="btn primary"
          onClick={()=>
            setScreen('procurement')
          }
        >
          Cotacoes e compras
        </button>

        <button
          className="btn"
          onClick={()=>
            setScreen('receiving')
          }
        >
          Receber pedidos
        </button>

      </div>

      <ProcurementV49B
        products={products}
      />

    </>;
  }

  return <section className="page">

    <Head
      eyebrow="NEXUS PURCHASE RECEIVING V4.9C"
      title="Recebimento Inteligente"
      text="Confira mercadorias, registre lotes e validade e atualize o estoque a partir dos pedidos aprovados."
    />

    <div
      style={{
        display:'flex',
        gap:10,
        flexWrap:'wrap',
        marginBottom:16
      }}
    >

      <button
        className="btn"
        onClick={()=>
          setScreen('procurement')
        }
      >
        Voltar para compras
      </button>

      <button
        className="btn"
        disabled={loading}
        onClick={loadOrders}
      >
        Atualizar pedidos
      </button>

    </div>

    {message&&
      <div className="v06-notice">
        {message}
      </div>
    }

    <div className="grid two">

      <div className="panel">

        <h3>Pedidos de compra</h3>

        {!orders.length&&
          <div className="empty">
            Nenhum pedido de compra disponivel.
          </div>
        }

        {orders.map(order=>

          <button
            key={order.id}
            className="btn"
            style={{
              display:'block',
              width:'100%',
              textAlign:'left',
              marginBottom:8,
              padding:12
            }}
            onClick={()=>
              openOrder(order.id)
            }
          >

            <b>
              Pedido #{order.id}
            </b>

            <div>
              {order.supplier_name}
            </div>

            <small>
              {order.status}
              {' | '}
              Recebido {Number(order.received_qty||0)}
              {' / '}
              {Number(order.ordered_qty||0)}
            </small>

          </button>
        )}

      </div>

      <div className="panel">

        {!selected&&
          <div className="empty">
            Selecione um pedido para realizar a conferencia.
          </div>
        }

        {selected&&<>

          <div
            style={{
              display:'flex',
              justifyContent:'space-between',
              gap:12,
              flexWrap:'wrap',
              marginBottom:16
            }}
          >

            <div>

              <h3 style={{margin:0}}>
                Pedido #{selected.order.id}
              </h3>

              <small>
                {selected.order.supplier_name}
              </small>

            </div>

            <b>
              {selected.order.status}
            </b>

          </div>

          <div
            style={{
              display:'grid',
              gap:12
            }}
          >

            {selected.items.map(item=>

              <div
                className="panel"
                key={item.id}
              >

                <div
                  style={{
                    display:'flex',
                    justifyContent:'space-between',
                    gap:10,
                    flexWrap:'wrap',
                    marginBottom:10
                  }}
                >

                  <div>

                    <b>
                      {item.product_name}
                    </b>

                    <small
                      style={{
                        display:'block'
                      }}
                    >
                      Pedido {Number(item.qty)}
                      {' | '}
                      Recebido {Number(item.received_qty)}
                      {' | '}
                      Pendente {Number(item.pending_qty)}
                    </small>

                  </div>

                  <b>
                    R$ {Number(item.unit_cost||0).toFixed(2)}
                  </b>

                </div>

                {Number(item.pending_qty)>0
                  ?<div
                      style={{
                        display:'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit,minmax(150px,1fr))',
                        gap:10
                      }}
                    >

                      <label>

                        Quantidade recebida

                        <input
                          type="number"
                          min="0"
                          max={item.pending_qty}
                          step="0.001"
                          value={item.receive_qty}
                          onChange={e=>
                            patchItem(
                              item.id,
                              'receive_qty',
                              e.target.value
                            )
                          }
                        />

                      </label>

                      <label>

                        Lote

                        <input
                          value={item.batch_code}
                          placeholder="Automatico se vazio"
                          onChange={e=>
                            patchItem(
                              item.id,
                              'batch_code',
                              e.target.value
                            )
                          }
                        />

                      </label>

                      <label>

                        Fabricacao

                        <input
                          type="date"
                          value={item.manufactured_at}
                          onChange={e=>
                            patchItem(
                              item.id,
                              'manufactured_at',
                              e.target.value
                            )
                          }
                        />

                      </label>

                      <label>

                        Validade

                        <input
                          type="date"
                          value={item.expires_at}
                          onChange={e=>
                            patchItem(
                              item.id,
                              'expires_at',
                              e.target.value
                            )
                          }
                        />

                      </label>

                      <label
                        style={{
                          gridColumn:'1 / -1'
                        }}
                      >

                        Observacao

                        <input
                          value={item.receive_notes}
                          onChange={e=>
                            patchItem(
                              item.id,
                              'receive_notes',
                              e.target.value
                            )
                          }
                        />

                      </label>

                    </div>

                  :<div className="empty">
                    Item integralmente recebido.
                  </div>
                }

              </div>
            )}

          </div>

          {selected.order.status!=='RECEIVED'&&

            <button
              className="btn primary"
              style={{
                width:'100%',
                marginTop:16
              }}
              disabled={loading}
              onClick={receiveOrder}
            >

              {loading
                ?'Registrando recebimento...'
                :'Confirmar recebimento e dar entrada no estoque'
              }

            </button>
          }

          {!!selected.batches?.length&&

            <div style={{marginTop:20}}>

              <h3>
                Lotes recebidos deste pedido
              </h3>

              {selected.batches.map(batch=>

                <div
                  className="list-row"
                  key={batch.id}
                >

                  <div>

                    <b>
                      {batch.product_name}
                    </b>

                    <small>
                      Lote {batch.batch_code}
                      {' | '}
                      Entrada {Number(batch.initial_qty)}
                      {' | '}
                      Saldo {Number(batch.remaining_qty)}
                    </small>

                  </div>

                  <small>
                    Validade:
                    {' '}
                    {batch.expires_at||'Nao informada'}
                  </small>

                </div>
              )}

            </div>
          }

        </>}

      </div>

    </div>

  </section>;
}

/* END NEXUS PURCHASE RECEIVING V4.9C */

/* ============================================================
   NEXUS DISPATCH CENTER V4.9D
   ============================================================ */

function Procurement({products}){

  const [view,setView]=useState('procurement');
  const [dispatches,setDispatches]=useState([]);
  const [selected,setSelected]=useState(null);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');

  async function loadDispatches(){

    setLoading(true);
    setMessage('');

    try{

      const result=
        await api.supplierDispatchesV49D();

      setDispatches(
        Array.isArray(result)
          ?result
          :[]
      );

    }catch(err){

      setMessage(
        err?.message||
        'Falha ao carregar pedidos.'
      );

    }finally{

      setLoading(false);
    }
  }

  async function openDispatch(id){

    setLoading(true);
    setMessage('');

    try{

      const result=
        await api.supplierDispatchV49D(id);

      setSelected(result);

    }catch(err){

      setMessage(
        err?.message||
        'Falha ao abrir pedido.'
      );

    }finally{

      setLoading(false);
    }
  }

  useEffect(()=>{

    if(view==='dispatch'){
      loadDispatches();
    }

  },[view]);

  function copyOrder(){

    if(!selected?.dispatch){
      return;
    }

    const d=selected.dispatch;

    const itemLines=
      (selected.items||[])
      .map(item=>
        `${item.product_name} | ${Number(item.qty)} x R$ ${Number(item.unit_cost||0).toFixed(2)} | R$ ${Number(item.item_total||0).toFixed(2)}`
      )
      .join('\n');

    const text=[
      'NEXUS HOSPITALITY ONE',
      `PEDIDO DE COMPRA #${d.purchase_order_id}`,
      '',
      `Fornecedor: ${d.supplier_name||''}`,
      `Contato: ${d.supplier_contact||''}`,
      `Telefone: ${d.supplier_phone||''}`,
      `E-mail: ${d.supplier_email||''}`,
      '',
      itemLines,
      '',
      `TOTAL: R$ ${Number(d.purchase_total||0).toFixed(2)}`
    ].join('\n');

    if(
      navigator.clipboard&&
      navigator.clipboard.writeText
    ){

      navigator.clipboard
        .writeText(text)
        .then(()=>
          setMessage(
            'Pedido copiado para a area de transferencia.'
          )
        )
        .catch(()=>
          setMessage(
            'Nao foi possivel copiar automaticamente.'
          )
        );

    }else{

      setMessage(
        'Area de transferencia indisponivel.'
      );
    }
  }

  async function registerSent(){

    if(!selected?.dispatch?.id){
      return;
    }

    const d=selected.dispatch;

    let defaultChannel='MANUAL';
    let defaultDestination='';

    if(d.supplier_phone){

      defaultChannel='WHATSAPP';
      defaultDestination=d.supplier_phone;

    }else if(d.supplier_email){

      defaultChannel='EMAIL';
      defaultDestination=d.supplier_email;
    }

    const channel=window.prompt(
      'Canal utilizado: MANUAL, WHATSAPP, EMAIL, PHONE ou OTHER',
      defaultChannel
    );

    if(!channel){
      return;
    }

    const destination=window.prompt(
      'Destino utilizado:',
      defaultDestination
    );

    const notes=window.prompt(
      'Observacao do envio:',
      ''
    );

    setLoading(true);
    setMessage('');

    try{

      await api.markSupplierDispatchSentV49D(
        d.id,
        {
          channel,
          destination:
            destination||'',
          notes:
            notes||''
        }
      );

      setMessage(
        'Envio registrado com sucesso.'
      );

      await loadDispatches();
      await openDispatch(d.id);

    }catch(err){

      setMessage(
        err?.message||
        'Nao foi possivel registrar o envio.'
      );

    }finally{

      setLoading(false);
    }
  }

  if(view==='procurement'){

    return <>

      <div
        className="panel"
        style={{
          display:'flex',
          gap:10,
          flexWrap:'wrap',
          marginBottom:14
        }}
      >

        <button
          className="btn primary"
          onClick={()=>
            setView('procurement')
          }
        >
          Cotacoes e recebimento
        </button>

        <button
          className="btn"
          onClick={()=>
            setView('dispatch')
          }
        >
          Pedidos para fornecedores
        </button>

      </div>

      <ProcurementV49C
        products={products}
      />

    </>;
  }

  const readyCount=
    dispatches.filter(
      item=>item.status==='READY'
    ).length;

  const sentCount=
    dispatches.filter(
      item=>item.status==='SENT'
    ).length;

  return <section className="page">

    <Head
      eyebrow="NEXUS DISPATCH CENTER V4.9D"
      title="Pedidos para Fornecedores"
      text="Confira os pedidos gerados pelo Smart Procurement e registre o encaminhamento ao fornecedor."
    />

    <div
      style={{
        display:'flex',
        gap:10,
        flexWrap:'wrap',
        marginBottom:16
      }}
    >

      <button
        className="btn"
        onClick={()=>
          setView('procurement')
        }
      >
        Voltar para compras
      </button>

      <button
        className="btn"
        disabled={loading}
        onClick={loadDispatches}
      >
        Atualizar pedidos
      </button>

    </div>

    <div
      className="grid three"
      style={{
        marginBottom:16
      }}
    >

      <div className="panel">

        <small>
          Total de pedidos
        </small>

        <h2>
          {dispatches.length}
        </h2>

      </div>

      <div className="panel">

        <small>
          Prontos para envio
        </small>

        <h2>
          {readyCount}
        </h2>

      </div>

      <div className="panel">

        <small>
          Enviados
        </small>

        <h2>
          {sentCount}
        </h2>

      </div>

    </div>

    {message&&
      <div className="v06-notice">
        {message}
      </div>
    }

    <div className="grid two">

      <div className="panel">

        <h3>
          Fila de pedidos
        </h3>

        {loading&&!dispatches.length&&
          <div className="empty">
            Carregando...
          </div>
        }

        {!loading&&!dispatches.length&&
          <div className="empty">
            Nenhum pedido disponivel.
          </div>
        }

        {dispatches.map(item=>

          <button
            key={item.id}
            className="btn"
            style={{
              display:'block',
              width:'100%',
              textAlign:'left',
              marginBottom:8,
              padding:12
            }}
            onClick={()=>
              openDispatch(item.id)
            }
          >

            <b>
              Pedido #{item.purchase_order_id}
            </b>

            <div>
              {item.supplier_name||
               'Fornecedor'}
            </div>

            <small>
              {item.status}
              {' | R$ '}
              {Number(
                item.purchase_total||0
              ).toFixed(2)}
            </small>

          </button>
        )}

      </div>

      <div className="panel">

        {!selected&&
          <div className="empty">
            Selecione um pedido para visualizar.
          </div>
        }

        {selected&&<>

          <div
            style={{
              display:'flex',
              justifyContent:'space-between',
              gap:12,
              flexWrap:'wrap'
            }}
          >

            <div>

              <h3 style={{margin:0}}>
                Pedido #{selected.dispatch.purchase_order_id}
              </h3>

              <p>
                {selected.dispatch.supplier_name}
              </p>

            </div>

            <b>
              {selected.dispatch.status}
            </b>

          </div>

          <div
            className="v13-feature"
            style={{
              marginTop:12
            }}
          >

            <div>

              <b>
                Contato do fornecedor
              </b>

              <p>
                {selected.dispatch.supplier_contact||
                 'Nao informado'}
              </p>

              <small>
                {selected.dispatch.supplier_phone||
                 ''}
                {' '}
                {selected.dispatch.supplier_email||
                 ''}
              </small>

            </div>

            <strong>
              R$ {Number(
                selected.dispatch.purchase_total||0
              ).toFixed(2)}
            </strong>

          </div>

          <div style={{marginTop:16}}>

            {(selected.items||[]).map(item=>

              <div
                className="list-row"
                key={item.id}
              >

                <div>

                  <b>
                    {item.product_name}
                  </b>

                  <small>
                    {Number(item.qty)}
                    {' x R$ '}
                    {Number(
                      item.unit_cost||0
                    ).toFixed(2)}
                  </small>

                </div>

                <b>
                  R$ {Number(
                    item.item_total||0
                  ).toFixed(2)}
                </b>

              </div>
            )}

          </div>

          <div
            style={{
              display:'flex',
              gap:10,
              flexWrap:'wrap',
              marginTop:16
            }}
          >

            <button
              className="btn"
              onClick={copyOrder}
            >
              Copiar pedido
            </button>

            {selected.dispatch.status==='READY'&&

              <button
                className="btn primary"
                disabled={loading}
                onClick={registerSent}
              >
                Registrar como enviado
              </button>
            }

          </div>

          {selected.dispatch.sent_at&&

            <p style={{marginTop:14}}>

              Enviado em:
              {' '}

              <b>
                {new Date(
                  selected.dispatch.sent_at
                ).toLocaleString('pt-BR')}
              </b>

            </p>
          }

        </>}

      </div>

    </div>

  </section>;
}

/* END NEXUS DISPATCH CENTER V4.9D */
