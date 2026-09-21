import React,{useEffect,useMemo,useState}from'react';import{api}from'./api.js';
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const num=v=>Number(v||0);
export function BusinessEngineV13(){const[view,setView]=useState('cash');return <section className="v13"><div className="v13-hero"><div><small>NEXUS V1.3</small><h2>Complete Business Engine</h2><p>Caixa, pagamentos, cancelamentos, preço, cotação e fluxo projetado em uma única camada.</p></div><div className="v13-tabs">{[['cash','Caixa & Vendas'],['flow','Posso retirar?'],['pricing','Preço Inteligente'],['quotes','Cotações']].map(x=><button className={view===x[0]?'active':''} onClick={()=>setView(x[0])}>{x[1]}</button>)}</div></div>{view==='cash'&&<SalesCenter/>}{view==='flow'&&<Withdrawal/>}{view==='pricing'&&<Pricing/>}{view==='quotes'&&<Quotes/>}</section>}
function SalesCenter(){const[sales,setSales]=useState([]),[reason,setReason]=useState('');const load=()=>api.salesV13().then(setSales).catch(()=>setSales([]));useEffect(()=>{load()},[]);async function cancel(id){const r=prompt('Motivo obrigatório do cancelamento:',reason||'');if(!r)return;await api.cancelSaleV13(id,r);await load()}return <div className="v13-panel"><div className="v13-title"><div><h3>Vendas e cancelamentos</h3><p>Histórico imutável, reversão de estoque e trilha de auditoria.</p></div></div><div className="v13-table"><div className="v13-tr head"><span>Venda</span><span>Total</span><span>Pagamento</span><span>Status</span><span>Ação</span></div>{sales.map(s=><div className="v13-tr" key={s.id}><span>#{s.id}<small>{s.customer_name||'Balcão'}</small></span><strong>{brl(s.total)}</strong><span>{s.payments||s.payment_method}</span><span className={'badge '+s.status}>{s.status==='PAID'?'PAGA':'CANCELADA'}</span><span>{s.status==='PAID'?<button className="danger" onClick={()=>cancel(s.id)}>Cancelar venda</button>:'—'}</span></div>)}</div><SplitDemo/></div>}
function SplitDemo(){const[people,setPeople]=useState(2);return <div className="v13-feature"><div><b>Pagamento dividido e misto</b><p>O motor aceita de 2 a 6 pessoas e múltiplas formas por pessoa. O fechamento só ocorre quando a soma confere com o total.</p></div><div className="v13-stepper"><button onClick={()=>setPeople(Math.max(2,people-1))}>−</button><strong>{people} pessoas</strong><button onClick={()=>setPeople(Math.min(6,people+1))}>+</button></div></div>}
function Withdrawal(){const[d,setD]=useState(null),[err,setErr]=useState('');useEffect(()=>{api.withdrawalAdviceV13().then(setD).catch(e=>setErr(e.message))},[]);if(err)return <div className="v13-panel"><h3>Posso tirar dinheiro do caixa hoje?</h3><p>{err}</p></div>;if(!d)return <div className="v13-panel">Calculando fluxo projetado...</div>;return <div className="v13-panel"><h3>Posso tirar dinheiro do caixa hoje?</h3><div className={'v13-answer '+(d.safe_withdrawal>0?'yes':'no')}><small>RECOMENDAÇÃO NEXUS</small><strong>{d.safe_withdrawal>0?'SIM, COM LIMITE':'NÃO RECOMENDADO'}</strong><b>{brl(d.safe_withdrawal)}</b><p>{d.rationale}</p></div><div className="v13-kpis">{[['Dinheiro físico',d.physical_cash],['Compromissos 14 dias',d.obligations_14d],['Despesas previstas',d.planned_expenses_14d],['Reserva de segurança',d.safety_reserve]].map(x=><div><small>{x[0]}</small><strong>{brl(x[1])}</strong></div>)}</div></div>}
function Pricing(){const[data,setData]=useState(null);const load=()=>api.pricingV13().then(setData);useEffect(()=>{load()},[]);if(!data)return <div className="v13-panel">Calculando preços...</div>;return <div className="v13-panel"><h3>Preço justo de venda</h3><p>Baseado no custo e na margem desejada. A sugestão nunca altera o preço sem sua confirmação.</p><div className="v13-table"><div className="v13-tr price head"><span>Produto</span><span>Custo</span><span>Atual</span><span>Margem</span><span>Sugerido</span><span></span></div>{data.products.map(p=><div className="v13-tr price" key={p.id}><span>{p.name}</span><span>{brl(p.cost)}</span><span>{brl(p.price)}</span><span>{num(p.current_margin).toFixed(1).replace('.',',')}%</span><strong>{brl(p.suggested_price)}</strong><button onClick={async()=>{await api.priceProductV13(p.id,{target_margin:p.target_margin,apply:true});load()}}>Aplicar</button></div>)}</div></div>}
function Quotes(){const[rows,setRows]=useState([]);const load=()=>api.quotesV13().then(setRows);useEffect(()=>{load()},[]);return <div className="v13-panel"><div className="v13-title"><div><h3>Cotação por link</h3><p>Fornecedor recebe link, informa preços e o NEXUS compara automaticamente.</p></div></div>{rows.length===0?<div className="empty">Nenhuma cotação V1.3 criada ainda. O motor e o portal do fornecedor já estão habilitados.</div>:rows.map(q=><div className="v13-feature"><div><b>{q.title}</b><p>{q.submitted}/{q.invited} fornecedores responderam • {q.status}</p></div><button onClick={async()=>alert(JSON.stringify(await api.quoteAnalysisV13(q.id),null,2))}>Analisar</button></div>)}</div>}
/* ============================================================
   NEXUS SUPPLIER PORTAL PREMIUM V4.9D
   ============================================================ */

export function SupplierQuotePublicV13({token}){

  const [data,setData]=useState(null);
  const [items,setItems]=useState([]);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [sending,setSending]=useState(false);

  useEffect(()=>{

    api.publicSupplierQuoteV13(token)
      .then(result=>{

        setData(result);

        setItems(
          (result.items||[]).map(item=>({
            ...item,

            available:
              item.available===0
                ?false
                :true,

            unit_price:
              item.unit_price||
              '',

            brand:
              item.brand||
              '',

            notes:
              item.notes||
              ''
          }))
        );
      })
      .catch(err=>{

        setError(
          err?.message||
          'Cotacao indisponivel.'
        );
      });

  },[token]);

  function updateItem(index,key,value){

    setItems(current=>
      current.map((item,i)=>
        i===index
          ?{
              ...item,
              [key]:value
            }
          :item
      )
    );
  }

  async function submitQuote(event){

    event.preventDefault();

    setSending(true);
    setMessage('');
    setError('');

    try{

      const form=event.currentTarget;

      const payloadItems=
        items.map(item=>({

          item_id:item.item_id,

          available:
            item.available!==false,

          unit_price:
            item.available!==false
              ?num(item.unit_price)
              :0,

          brand:
            item.brand||
            null,

          notes:
            item.notes||
            null
        }));

      const invalid=
        payloadItems.find(
          item=>
            item.available&&
            Number(item.unit_price)<=0
        );

      if(invalid){

        throw new Error(
          'Informe o preco de todos os itens disponiveis.'
        );
      }

      await api.submitSupplierQuoteV13(
        token,
        {
          items:payloadItems,

          freight:
            num(form.freight.value),

          delivery_days:
            num(form.delivery_days.value),

          validity_days:
            num(form.validity_days.value),

          notes:
            form.notes.value
        }
      );

      setMessage(
        'Cotacao enviada com sucesso.'
      );

    }catch(err){

      setError(
        err?.message||
        'Nao foi possivel enviar a cotacao.'
      );

    }finally{

      setSending(false);
    }
  }

  if(error&&!data){

    return <main className="public-v13">

      <div className="public-card">

        <small>
          NEXUS | PORTAL DO FORNECEDOR
        </small>

        <h1>
          Cotacao indisponivel
        </h1>

        <p>
          {error}
        </p>

      </div>

    </main>;
  }

  if(!data){

    return <main className="public-v13">

      <div className="public-card">
        Carregando cotacao...
      </div>

    </main>;
  }

  const availableCount=
    items.filter(
      item=>item.available!==false
    ).length;

  const subtotal=
    items.reduce(
      (total,item)=>
        total+
        (
          item.available!==false
            ?num(item.unit_price)*num(item.qty)
            :0
        ),
      0
    );

  return <main className="public-v13">

    <div className="public-card">

      <small>
        NEXUS | PORTAL PREMIUM DO FORNECEDOR
      </small>

      <h1>
        {data.title}
      </h1>

      <p>
        Fornecedor:
        {' '}
        <b>
          {data.supplier_name}
        </b>
      </p>

      {data.deadline_at&&
        <p>
          Prazo para resposta:
          {' '}
          <b>
            {new Date(
              data.deadline_at
            ).toLocaleString('pt-BR')}
          </b>
        </p>
      }

      {data.request_notes&&

        <div className="v13-feature">

          <div>

            <b>
              Orientacoes da compra
            </b>

            <p>
              {data.request_notes}
            </p>

          </div>

        </div>
      }

      <form onSubmit={submitQuote}>

        <div
          style={{
            display:'grid',
            gap:14
          }}
        >

          {items.map((item,index)=>

            <div
              key={item.item_id}
              className="v13-panel"
              style={{
                padding:16,
                opacity:
                  item.available===false
                    ?.68
                    :1
              }}
            >

              <div
                style={{
                  display:'flex',
                  justifyContent:'space-between',
                  gap:12,
                  flexWrap:'wrap',
                  marginBottom:12
                }}
              >

                <div>

                  <b
                    style={{
                      fontSize:17
                    }}
                  >
                    {item.name}
                  </b>

                  <small
                    style={{
                      display:'block',
                      marginTop:4
                    }}
                  >
                    Quantidade solicitada:
                    {' '}
                    {item.qty}
                    {' '}
                    {item.unit}
                  </small>

                  {item.category&&

                    <small
                      style={{
                        display:'block'
                      }}
                    >
                      Categoria:
                      {' '}
                      {item.category}
                    </small>
                  }

                </div>

                <label
                  style={{
                    display:'flex',
                    alignItems:'center',
                    gap:8,
                    cursor:'pointer'
                  }}
                >

                  <input
                    type="checkbox"
                    checked={
                      item.available!==false
                    }
                    onChange={e=>
                      updateItem(
                        index,
                        'available',
                        e.target.checked
                      )
                    }
                  />

                  <b>
                    {item.available!==false
                      ?'Disponivel'
                      :'Indisponivel'
                    }
                  </b>

                </label>

              </div>

              <div
                className="public-grid"
                style={{
                  marginBottom:10
                }}
              >

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required={
                    item.available!==false
                  }
                  disabled={
                    item.available===false
                  }
                  placeholder="Preco unitario R$"
                  value={item.unit_price}
                  onChange={e=>
                    updateItem(
                      index,
                      'unit_price',
                      e.target.value
                    )
                  }
                />

                <input
                  type="text"
                  disabled={
                    item.available===false
                  }
                  placeholder="Marca / fabricante"
                  value={item.brand}
                  onChange={e=>
                    updateItem(
                      index,
                      'brand',
                      e.target.value
                    )
                  }
                />

              </div>

              <textarea
                placeholder={
                  item.available===false
                    ?'Motivo da indisponibilidade'
                    :'Observacao deste item'
                }
                value={item.notes}
                onChange={e=>
                  updateItem(
                    index,
                    'notes',
                    e.target.value
                  )
                }
              />

              {item.available!==false&&
               Number(item.unit_price)>0&&

                <div
                  style={{
                    marginTop:10,
                    textAlign:'right'
                  }}
                >

                  <small>
                    Total deste item
                  </small>

                  <div>

                    <b>
                      {brl(
                        num(item.unit_price)*
                        num(item.qty)
                      )}
                    </b>

                  </div>

                </div>
              }

            </div>
          )}

        </div>

        <div
          className="v13-panel"
          style={{
            marginTop:16
          }}
        >

          <h3>
            Condicoes comerciais
          </h3>

          <div className="public-grid">

            <input
              name="freight"
              type="number"
              step="0.01"
              min="0"
              placeholder="Frete R$"
              defaultValue={
                data.freight||
                ''
              }
            />

            <input
              name="delivery_days"
              type="number"
              min="0"
              placeholder="Prazo de entrega em dias"
              defaultValue={
                data.delivery_days||
                ''
              }
            />

            <input
              name="validity_days"
              type="number"
              min="0"
              placeholder="Validade da proposta em dias"
              defaultValue={
                data.validity_days||
                ''
              }
            />

          </div>

          <textarea
            name="notes"
            placeholder="Observacoes comerciais gerais"
            defaultValue={
              data.notes||
              ''
            }
          />

        </div>

        <div
          className="v13-feature"
          style={{
            marginTop:16
          }}
        >

          <div>

            <b>
              Resumo da proposta
            </b>

            <p>
              {availableCount}
              {' de '}
              {items.length}
              {' itens disponiveis'}
            </p>

          </div>

          <strong>
            {brl(subtotal)}
          </strong>

        </div>

        <button
          className="primary"
          type="submit"
          disabled={sending}
          style={{
            width:'100%',
            marginTop:16
          }}
        >

          {sending
            ?'Enviando cotacao...'
            :'Enviar cotacao ao NEXUS'
          }

        </button>

        {message&&
          <p className="success">
            {message}
          </p>
        }

        {error&&
          <p style={{marginTop:12}}>
            {error}
          </p>
        }

      </form>

    </div>

  </main>;
}

/* END NEXUS SUPPLIER PORTAL PREMIUM V4.9D */