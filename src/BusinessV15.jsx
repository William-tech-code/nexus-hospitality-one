import React,{useEffect,useState}from'react';import{api}from'./api.js';
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function BusinessV15(){const[tab,setTab]=useState('sales');const tabs=[['sales','Últimas vendas'],['flow','Retirada segura'],['pricing','Preço inteligente'],['payments','Asaas & pagamentos']];return <section className="biz15"><header className="biz15-hero"><div><span>NEXUS V1.5 • BUSINESS CONTROL</span><h1>Motor de Negócios</h1><p>Controle operacional, financeiro e de pagamentos sem telas vazias.</p></div><div className="biz15-tabs">{tabs.map(x=><button key={x[0]} className={tab===x[0]?'active':''} onClick={()=>setTab(x[0])}>{x[1]}</button>)}</div></header><SafeBoundary key={tab}>{tab==='sales'?<Sales/>:tab==='flow'?<Flow/>:tab==='pricing'?<Pricing/>:<Payments/>}</SafeBoundary></section>}
class SafeBoundary extends React.Component{constructor(p){super(p);this.state={error:null}}static getDerivedStateFromError(error){return{error}}render(){return this.state.error?<div className="biz15-error"><b>O módulo encontrou uma inconsistência.</b><p>{this.state.error.message}</p><button onClick={()=>location.reload()}>RECARREGAR MÓDULO</button></div>:this.props.children}}
function State({text}){return <div className="biz15-state"><div>N</div><b>{text}</b><small>O NEXUS continuará disponível mesmo sem dados para exibir.</small></div>}
function Sales(){const[rows,setRows]=useState(null),[detail,setDetail]=useState(null),[err,setErr]=useState('');const load=()=>api.salesRecentV16().then(setRows).catch(e=>{setRows([]);setErr(e.message)});useEffect(()=>{load()},[]);async function open(id){try{setDetail(await api.saleV16(id))}catch(e){setErr(e.message)}}async function action(kind){if(!detail)return;try{if(kind==='cancel'){const reason=prompt('Motivo obrigatório do cancelamento:');if(!reason)return;await api.cancelSaleV16(detail.id,reason);setDetail(null)}if(kind==='return'){
  const available=(detail.items||[])
    .map(i=>({
      ...i,
      available_qty:
        i.returnable_qty != null
          ? Number(i.returnable_qty)
          : Math.max(
              0,
              Number(i.qty||0)-
              Number(i.returned_qty||0)
            )
    }))
    .filter(i=>i.available_qty>0);

  if(!available.length){
    throw new Error(
      'VENDA_SEM_ITENS_DEVOLVIVEIS'
    );
  }

  const requested=[];

  for(const item of available){

    const label=
      item.name ||
      item.product_name ||
      ('Item '+item.id);

    const answer=prompt(
      'DEVOLUCAO PARCIAL\n\n'+
      label+
      '\nComprado: '+Number(item.qty||0)+
      '\nDisponivel para devolver: '+
      item.available_qty+
      '\n\nQuantidade a devolver:'+
      '\nDigite 0 para nao devolver este item.',
      String(item.available_qty)
    );

    if(answer===null){
      return;
    }

    const qty=Number(
      String(answer)
        .replace(',','.')
        .trim()
    );

    if(
      !Number.isFinite(qty) ||
      qty<0 ||
      qty>item.available_qty
    ){
      throw new Error(
        'QUANTIDADE_DEVOLUCAO_INVALIDA'
      );
    }

    if(qty>0){
      requested.push({
        sale_item_id:Number(item.id),
        qty
      });
    }
  }

  if(!requested.length){
    return;
  }

  const reason=prompt(
    'Motivo obrigatorio da devolucao:'
  );

  if(
    !reason ||
    String(reason).trim().length<4
  ){
    throw new Error(
      'MOTIVO_DEVOLUCAO_OBRIGATORIO'
    );
  }

  const payload={
    reason:String(reason).trim(),
    items:requested
  };

  const preview=
    await api.returnPreviewV16(
      detail.id,
      payload
    );

  const total=
    Number(
      preview?.return_total ?? preview?.total ??
      requested.reduce(
        (sum,r)=>{
          const original=
            available.find(
              i=>Number(i.id)===
                 Number(r.sale_item_id)
            );

          return sum+
            Number(r.qty||0)*
            Number(
              original?.unit_price||0
            );
        },
        0
      )
    );

  const summary=
    requested.map(r=>{
      const original=
        available.find(
          i=>Number(i.id)===
             Number(r.sale_item_id)
        );

      return (
        r.qty+
        'x '+
        (
          original?.name ||
          original?.product_name ||
          ('Item '+r.sale_item_id)
        )
      );
    }).join('\n');

  const confirmed=confirm(
    'CONFIRMAR DEVOLUCAO AUDITADA?\n\n'+
    summary+
    '\n\nValor da devolucao: '+
    Number(total||0)
      .toLocaleString(
        'pt-BR',
        {
          style:'currency',
          currency:'BRL'
        }
      )+
    '\n\nMotivo: '+
    String(reason).trim()+
    '\n\nEsta operacao sera registrada na auditoria.'
  );

  if(!confirmed){
    return;
  }

  await api.returnSaleV16(
    detail.id,
    payload
  );

  setDetail(
    await api.saleV16(detail.id)
  );

  load();
}if(kind==='change'){const received=prompt('Novo valor recebido em dinheiro:');if(received==null)return;const reason=prompt('Motivo da correção:');if(!reason)return;setDetail(await api.changeCorrectionV14(detail.id,{received_amount:Number(String(received).replace(',','.')),reason}))}await load()}catch(e){setErr(e.message)}}if(rows===null)return <State text="Carregando vendas..."/>;return <div className="biz15-card"><div className="biz15-cardhead"><div><span>OPERAÇÃO AUDITÁVEL</span><h2>Últimas vendas</h2></div><button onClick={load}>ATUALIZAR</button></div>{err&&<div className="biz15-warn">{err}</div>}{!rows.length?<State text="Nenhuma venda registrada ainda."/>:<div className="biz15-sales">{rows.map(s=><button key={s.id} onClick={()=>open(s.id)}><span><b>#{s.id}</b><small>{s.operator_name||'Operador'} • {new Date(s.created_at).toLocaleString('pt-BR')}</small></span><strong>{brl(s.total)}</strong><em>{s.status}{s.return_coverage?.status==='DEVOLVIDA'?' • DEVOLVIDA':s.return_coverage?.status==='DEVOLUCAO_PARCIAL'?' • DEVOLUÇÃO PARCIAL':s.released_at?' • ENTREGUE':' • AGUARDANDO'}</em></button>)}</div>}{detail&&<div className="biz15-modalback" onClick={()=>setDetail(null)}><div className="biz15-modal" onClick={e=>e.stopPropagation()}><button className="x" onClick={()=>setDetail(null)}>×</button><span>VENDA #{detail.id}</span><h2>{brl(detail.total)}</h2><div className="biz15-items">{detail.items?.map(i=><div key={i.id}><b>{i.qty}x {i.name}</b><strong>{brl(i.qty*i.unit_price)}</strong></div>)}</div><p>Pagamento: {detail.payments?.map(p=>`${p.method} ${brl(p.amount)}`).join(' + ')||'—'}</p><p>Recebido: <b>{brl(detail.received_amount)}</b> • Troco: <b>{brl(detail.change_amount)}</b></p><p>Retirada: <b>{detail.release_code||'—'}</b> • {detail.released_at?'ENTREGUE':'AGUARDANDO ENTREGA'}</p><p>Devolução: <b>{detail.return_coverage?.status==='DEVOLVIDA'?'DEVOLVIDA':detail.return_coverage?.status==='DEVOLUCAO_PARCIAL'?'DEVOLUÇÃO PARCIAL':'SEM DEVOLUÇÃO'}</b>{detail.return_coverage?.returned_value>0?` • ${brl(detail.return_coverage.returned_value)}`:''}</p><div className="biz15-actions"><button onClick={()=>api.printSaleV14(detail.id,'PICKUP').then(()=>window.print())}>FICHA</button><button onClick={()=>api.printSaleV14(detail.id,'RECEIPT').then(()=>window.print())}>CUPOM</button><button onClick={()=>action('change')}>CORRIGIR TROCO</button><button onClick={()=>action('return')}>DEVOLVER</button><button className="danger" onClick={()=>action('cancel')}>CANCELAR</button></div></div></div>}</div>}
function Flow(){const[d,setD]=useState(null),[err,setErr]=useState('');useEffect(()=>{api.withdrawalAdviceV13().then(setD).catch(e=>setErr(e.message))},[]);if(err)return <div className="biz15-card"><div className="biz15-warn">{err}</div></div>;if(!d)return <State text="Calculando proteção de caixa..."/>;return <div className="biz15-card"><div className="biz15-cardhead"><div><span>PROJEÇÃO FINANCEIRA</span><h2>Posso retirar dinheiro hoje?</h2></div></div><div className={'biz15-verdict '+(d.safe_withdrawal>0?'yes':'no')}><small>RECOMENDAÇÃO NEXUS</small><b>{d.safe_withdrawal>0?'SIM, COM LIMITE':'NÃO RECOMENDADO'}</b><strong>{brl(d.safe_withdrawal)}</strong><p>{d.rationale}</p></div><div className="biz15-kpis"><div><small>Dinheiro físico</small><b>{brl(d.physical_cash)}</b></div><div><small>Compromissos 14 dias</small><b>{brl(d.obligations_14d)}</b></div><div><small>Despesas previstas</small><b>{brl(d.planned_expenses_14d)}</b></div><div><small>Reserva protegida</small><b>{brl(d.safety_reserve)}</b></div></div></div>}
function Pricing(){const[d,setD]=useState(null),[err,setErr]=useState('');const load=()=>api.pricingV13().then(setD).catch(e=>setErr(e.message));useEffect(()=>{load()},[]);if(err)return <div className="biz15-card"><div className="biz15-warn">{err}</div></div>;if(!d)return <State text="Calculando preços e margens..."/>;return <div className="biz15-card"><div className="biz15-cardhead"><div><span>PRECIFICAÇÃO</span><h2>Preço inteligente</h2></div></div><div className="biz15-prices">{(d.products||[]).map(p=><div key={p.id}><span><b>{p.name}</b><small>Custo {brl(p.cost)} • Atual {brl(p.price)} • Margem {Number(p.current_margin||0).toFixed(1).replace('.',',')}%</small></span><strong>{brl(p.suggested_price)}</strong><button onClick={async()=>{if(confirm(`Aplicar ${brl(p.suggested_price)} em ${p.name}?`)){await api.priceProductV13(p.id,{target_margin:p.target_margin,apply:true});load()}}}>APLICAR</button></div>)}</div></div>}
function Payments(){const[d,setD]=useState(null),[test,setTest]=useState(null),[err,setErr]=useState('');const load=()=>api.paymentConfigV15().then(setD).catch(e=>setErr(e.message));useEffect(()=>{load()},[]);async function check(){setTest({loading:true});try{setTest(await api.testAsaasV15())}catch(e){setTest({ok:false,message:e.message})}}if(err)return <div className="biz15-card"><div className="biz15-warn">{err}</div></div>;if(!d)return <State text="Verificando camada de pagamentos..."/>;return <div className="biz15-card"><div className="biz15-cardhead"><div><span>PAYMENT ENGINE</span><h2>Asaas & pagamentos</h2></div><button onClick={check}>TESTAR CONEXÃO</button></div><div className="biz15-kpis"><div><small>Ambiente</small><b>{d.asaas.environment}</b></div><div><small>API Key</small><b>{d.asaas.configured?'CONFIGURADA':'PENDENTE'}</b></div><div><small>Webhook Token</small><b>{d.asaas.webhook_configured?'CONFIGURADO':'PENDENTE'}</b></div><div><small>Endpoint</small><b>V3</b></div></div>{test&&<div className={test.ok?'biz15-ok':'biz15-warn'}>{test.loading?'Testando...':test.ok?`Conexão válida • conta ${test.account_status||'acessível'}`:test.message}</div>}<div className="biz15-paymentflow"><b>Fluxo protegido</b><p>PIX, cartão, boleto e checkout eletrônico passam pela camada central. Dinheiro e troco permanecem no caixa interno. Pedido ou ingresso só é liberado após confirmação.</p><code>{d.asaas.webhook_url_hint}</code></div></div>}

