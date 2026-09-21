import React,{useMemo,useState}from'react';
import './SmartPOSPremiumV21.css';
import{api}from'./api.js';

const brl=v=>Number(v||0).toLocaleString(
  'pt-BR',
  {style:'currency',currency:'BRL'}
);

const round=v=>
  Math.round((Number(v||0)+Number.EPSILON)*100)/100;

const num=v=>{
  const raw=String(v??'').trim();

  if(!raw)return 0;

  const normalized=
    raw.includes(',') ? raw.replace(/\./g,'').replace(',','.') : raw;

  const value=Number(normalized);

  return Number.isFinite(value)?value:0;
};

const METHODS=[
  {id:'PIX',label:'PIX'},
  {id:'DINHEIRO',label:'DINHEIRO'},
  {id:'DEBITO',label:'DÃ‰BITO'},
  {id:'CREDITO',label:'CRÃ‰DITO'}
];

function splitTotal(total,count){

  const people=Math.max(1,Number(count)||1);
  const cents=Math.round(Number(total||0)*100);

  const base=Math.floor(cents/people);
  const remainder=cents-(base*people);

  return Array.from(
    {length:people},
    (_,index)=>
      (base+(index<remainder?1:0))/100
  );
}

export default function SmartPOSV16({
  products=[],
  cash,
  onDone,
  user
}){

  const[cart,setCart]=useState([]);
  const[category,setCategory]=useState('TODOS');
  const[search,setSearch]=useState('');

  const[paymentOpen,setPaymentOpen]=useState(false);
  const[paymentMode,setPaymentMode]=useState('');

  const[singleMethod,setSingleMethod]=useState('');
  const[singleReceived,setSingleReceived]=useState('');

  const[peopleCount,setPeopleCount]=useState(2);
  const[people,setPeople]=useState([]);

  const[opening,setOpening]=useState('');
  const[busy,setBusy]=useState(false);
  const[msg,setMsg]=useState('');
  const[success,setSuccess]=useState(null);

  const categories=[
    'TODOS',
    ...new Set(
      products.map(
        p=>p.category||'OUTROS'
      )
    )
  ];

  const visibleProducts=useMemo(
    ()=>products.filter(p=>
      (
        category==='TODOS'||
        (p.category||'OUTROS')===category
      )&&
      String(p.name||'')
        .toLowerCase()
        .includes(search.toLowerCase())
    ),
    [products,category,search]
  );

  const total=round(
    cart.reduce(
      (sum,item)=>
        sum+
        Number(item.price||0)*
        Number(item.qty||0),
      0
    )
  );

  const singleReceivedValue=
    num(singleReceived);

  const singleChange=
    singleMethod==='DINHEIRO' ? Math.max(
          0,
          round(singleReceivedValue-total)
        )
      : 0;

  function add(product){

    setCart(current=>{

      const found=
        current.find(
          item=>item.id===product.id
        );

      if(found){

        return current.map(
          item=>
            item.id===product.id ? {...item,qty:item.qty+1} : item
        );
      }

      return[
        ...current,
        {...product,qty:1}
      ];
    });
  }

  function qty(id,delta){

    setCart(current=>
      current
        .map(item=>
          item.id===id ? {...item,qty:item.qty+delta} : item
        )
        .filter(item=>item.qty>0)
    );
  }

  function closePayment(){

    if(busy)return;

    setPaymentOpen(false);
    setPaymentMode('');
    setSingleMethod('');
    setSingleReceived('');
    setPeople([]);
    setMsg('');
  }

  function openPayment(){

    if(!cart.length){
      setMsg('Adicione pelo menos um produto.');
      return;
    }

    setPaymentOpen(true);
    setPaymentMode('');
    setSingleMethod('');
    setSingleReceived('');
    setPeople([]);
    setMsg('');
  }

  function chooseSingle(){

    setPaymentMode('SINGLE');
    setSingleMethod('');
    setSingleReceived('');
    setMsg('');
  }

  function chooseSplit(){

    const count=2;
    const values=splitTotal(total,count);

    setPeopleCount(count);

    setPeople(
      values.map(
        (amount,index)=>({
          id:index+1,
          amount,
          method:'',
          received:'',
          paid:false
        })
      )
    );

    setPaymentMode('SPLIT');
    setMsg('');
  }

  function rebuildPeople(nextCount){

    const count=
      Math.min(
        20,
        Math.max(
          2,
          Number(nextCount)||2
        )
      );

    const values=
      splitTotal(total,count);

    setPeopleCount(count);

    setPeople(
      values.map(
        (amount,index)=>({
          id:index+1,
          amount,
          method:'',
          received:'',
          paid:false
        })
      )
    );

    setMsg('');
  }

  function updatePerson(index,patch){

    setPeople(current=>
      current.map(
        (person,i)=>
          i===index ? {...person,...patch} : person
      )
    );
  }

  function selectPersonMethod(index,method){

    updatePerson(
      index,
      {
        method,
        received:'',
        paid:method!=='DINHEIRO'
      }
    );
  }

  function confirmCashPerson(index){

    const person=people[index];

    if(!person)return;

    const received=num(person.received);

    if(received<person.amount){

      setMsg(
        `Pessoa ${index+1}: valor entregue menor que ${brl(person.amount)}.`
      );

      return;
    }

    updatePerson(
      index,
      {paid:true}
    );

    setMsg('');
  }

  function personChange(person){

    if(person.method!=='DINHEIRO')return 0;

    return Math.max(
      0,
      round(
        num(person.received)-person.amount
      )
    );
  }

  const peoplePaid=
    people.filter(
      person=>person.paid&&person.method
    ).length;

  const allPeoplePaid=
    people.length>0&&
    people.every(
      person=>person.paid&&person.method
    );

  function buildSplitPayments(){

    const grouped={};

    for(const person of people){

      grouped[person.method]=round(
        (grouped[person.method]||0)+
        person.amount
      );
    }

    return Object.entries(grouped)
      .filter(([,amount])=>amount>0)
      .map(([method,amount])=>({
        method,
        amount
      }));
  }

  function splitCashReceived(){

    return round(
      people
        .filter(
          person=>person.method==='DINHEIRO'
        )
        .reduce(
          (sum,person)=>
            sum+num(person.received),
          0
        )
    );
  }

  async function postSaleFlow(sale){

    /*
      NEXUS HOSPITALITY ONE V2.1.6

      Venda confirmada = venda concluida.

      Depois do pagamento, registramos automaticamente:

      - ficha do cliente
      - ficha de producao
      - comprovante

      Nenhum desses documentos bloqueia a retirada.

      Neste momento usamos SIMULATION:
      a fila e os documentos sao reais,
      mas ainda nao enviamos fisicamente
      para a impressora termica.

      A camada Electron/thermal printer sera
      conectada na proxima evolucao.
    */

    try{

      const printResult =
        await api.queueSaleDocumentsV16(
          sale.id,
          'SIMULATION'
        );

      return{
        ...sale,
        print_jobs:
          printResult?.jobs || [],
        documents_queued:true
      };

    }catch(printError){

      console.warn(
        '[NEXUS][POS] Documentos operacionais nao enfileirados:',
        printError
      );

      /*
        Falha documental NAO desfaz a venda.
        A venda ja foi confirmada pelo backend.
      */

      return{
        ...sale,
        documents_queued:false,
        print_warning:
          printError?.message ||
          'Venda concluida, mas os documentos nao foram enfileirados.'
      };
    }
  }

  async function finishSingle(){

    if(!singleMethod){

      setMsg(
        'Escolha a forma de pagamento.'
      );

      return;
    }

    if(
      singleMethod==='DINHEIRO'&&
      singleReceivedValue<total
    ){

      setMsg(
        `Informe pelo menos ${brl(total)} recebidos em dinheiro.`
      );

      return;
    }

    setBusy(true);
    setMsg('');

    try{

      const body={

        items:
          cart.map(item=>({
            product_id:item.id,
            qty:item.qty,
            mode:'UNIT'
          })),

        payments:[
          {
            method:singleMethod,
            amount:total
          }
        ],

        payment_method:singleMethod,

        received_amount:
          singleMethod==='DINHEIRO' ? singleReceivedValue : total,

        customer_name:null,
        employee_id:null,
        tip_amount:0
      };

      const sale=
        await api.createSaleV14(body);

      let finalSale=sale;

      try{

        finalSale=
          await postSaleFlow(sale);

      }catch(flowError){

        setSuccess({
          sale,
          warning:
            'Venda registrada, mas a ficha/liberaÃ§Ã£o automÃ¡tica precisa de atenÃ§Ã£o: '+
            (flowError.message||'erro operacional')
        });

        setPaymentOpen(false);
        setCart([]);

        await onDone?.();

        return;
      }

      setSuccess({
        sale:finalSale,
        warning:''
      });

      setPaymentOpen(false);
      setCart([]);

      await onDone?.();

      setTimeout(()=>{
        setSuccess(null);
      },1800);

    }catch(e){

      setMsg(
        e.message||
        'NÃ£o foi possÃ­vel concluir a venda.'
      );

    }finally{

      setBusy(false);
    }
  }

  async function finishSplit(){

    if(!allPeoplePaid){

      setMsg(
        'Confirme o pagamento de todas as pessoas antes de finalizar.'
      );

      return;
    }

    const payments=
      buildSplitPayments();

    const paymentTotal=
      round(
        payments.reduce(
          (sum,p)=>sum+p.amount,
          0
        )
      );

    if(
      Math.abs(paymentTotal-total)>.01
    ){

      setMsg(
        `A divisÃ£o nÃ£o fechou o total da venda. ${brl(paymentTotal)} de ${brl(total)}.`
      );

      return;
    }

    setBusy(true);
    setMsg('');

    try{

      const cashAmount=
        payments
          .filter(p=>p.method==='DINHEIRO')
          .reduce(
            (sum,p)=>sum+p.amount,
            0
          );

      const receivedCash=
        splitCashReceived();

      const body={

        items:
          cart.map(item=>({
            product_id:item.id,
            qty:item.qty,
            mode:'UNIT'
          })),

        payments,

        payment_method:
          payments.length>1 ? 'MISTO' : payments[0].method,

        received_amount:
          cashAmount>0 ? receivedCash : total,

        customer_name:null,
        employee_id:null,
        tip_amount:0
      };

      const sale=
        await api.createSaleV14(body);

      let finalSale=sale;

      try{

        finalSale=
          await postSaleFlow(sale);

      }catch(flowError){

        setSuccess({
          sale,
          warning:
            'Venda registrada, mas a ficha/liberaÃ§Ã£o automÃ¡tica precisa de atenÃ§Ã£o: '+
            (flowError.message||'erro operacional')
        });

        setPaymentOpen(false);
        setCart([]);

        await onDone?.();

        return;
      }

      setSuccess({
        sale:finalSale,
        warning:''
      });

      setPaymentOpen(false);
      setCart([]);

      await onDone?.();

      setTimeout(()=>{
        setSuccess(null);
      },1800);

    }catch(e){

      setMsg(
        e.message||
        'NÃ£o foi possÃ­vel concluir a venda.'
      );

    }finally{

      setBusy(false);
    }
  }

  async function openCash(){

    try{

      setBusy(true);
      setMsg('');

      await api.openCash({
        opening_amount:num(opening),
        notes:'Abertura Smart POS V2.1'
      });

      await onDone?.();

    }catch(e){

      setMsg(e.message);

    }finally{

      setBusy(false);
    }
  }

  if(!cash){

    return(
      <section className="fastpos open-page">

        <style>{styles}</style>

        <div className="open-card nexus-pos-premium-v21">

          <span className="eyebrow">
            NEXUS HOSPITALITY ONE
          </span>

          <h1>Abrir caixa</h1>

          <p>
            Operador: <b>{user?.name||'UsuÃ¡rio'}</b>
          </p>

          <label>Saldo inicial</label>

          <div className="money-input">
            <span>R$</span>

            <input
              value={opening}
              onChange={
                e=>setOpening(e.target.value)
              }
              placeholder="0,00"
            />
          </div>

          <button
            className="primary"
            disabled={busy}
            onClick={openCash}
          >
            ABRIR CAIXA
          </button>

          {msg&&(
            <div className="message">
              {msg}
            </div>
          )}

        </div>

      </section>
    );
  }

  return(
    <section className="fastpos">

      <style>{styles}</style>

      <header className="top">

        <div className="brand">

          <strong>NEXUS</strong>

          <span>
            HOSPITALITY ONE â€¢ FAST CHECKOUT
          </span>

        </div>

        <div className="operator">

          <div>
            <small>OPERADOR</small>
            <strong>{user?.name||'UsuÃ¡rio'}</strong>
          </div>

          <em>â— CAIXA ABERTO</em>

        </div>

      </header>

      <div className="layout">

        <main className="catalog">

          <div className="catalog-top">

            <input
              className="search"
              value={search}
              onChange={
                e=>setSearch(e.target.value)
              }
              placeholder="Buscar produto..."
            />

            <div className="categories">

              {categories.map(c=>(
                <button
                  key={c}
                  className={
                    'category '+
                    (category===c?'active':'')
                  }
                  onClick={()=>setCategory(c)}
                >
                  {c}
                </button>
              ))}

            </div>

          </div>

          <div className="products">

            {visibleProducts.map(product=>(
              <button
                className="product"
                key={product.id}
                onClick={()=>add(product)}
              >

                <div className="nx-product-media">

                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="nx-product-placeholder">
                      <span>◆</span>
                      <small>NEXUS</small>
                    </div>
                  )}

                  <div className="nx-product-stock">
                    {Number(product.stock || 0)} em estoque
                  </div>

                </div>

                <div className="nx-product-content">

                  <small className="nx-product-category">
                    {product.category||'PRODUTO'}
                  </small>

                  <strong className="nx-product-name">
                    {product.name}
                  </strong>

                  <div className="nx-product-bottom">

                    <b className="nx-product-price">
                      {brl(product.price)}
                    </b>

                    <span className="nx-product-add">
                      +
                    </span>

                  </div>

                </div>

              </button>
            ))}

          </div>

        </main>

        <aside className="cart">

          <div className="cart-title">

            <div>
              <small>PEDIDO ATUAL</small>

              <strong>
                {cart.reduce(
                  (sum,item)=>sum+item.qty,
                  0
                )}{' '}
                item(ns)
              </strong>
            </div>

            {!!cart.length&&(
              <button
                className="clear"
                onClick={()=>setCart([])}
              >
                LIMPAR
              </button>
            )}

          </div>

          <div className="cart-items">

            {!cart.length&&(
              <div className="empty">

                <div className="empty-icon">
                  +
                </div>

                <strong>
                  Novo pedido
                </strong>

                <span>
                  Selecione os produtos ao lado.
                </span>

              </div>
            )}

            {cart.map(item=>(
              <div
                className="cart-item"
                key={item.id}
              >

                <div className="item-name">

                  <strong>
                    {item.name}
                  </strong>

                  <small>
                    {brl(item.price)}
                  </small>

                </div>

                <div className="qty">

                  <button
                    onClick={()=>
                      qty(item.id,-1)
                    }
                  >
                    âˆ’
                  </button>

                  <b>{item.qty}</b>

                  <button
                    onClick={()=>
                      qty(item.id,1)
                    }
                  >
                    +
                  </button>

                </div>

                <strong>
                  {brl(
                    item.price*item.qty
                  )}
                </strong>

              </div>
            ))}

          </div>

          <div className="checkout">

            <div className="total">

              <span>TOTAL</span>

              <strong>
                {brl(total)}
              </strong>

            </div>

            <button
              className="pay"
              disabled={!cart.length}
              onClick={openPayment}
            >
              PAGAR
              <span>{brl(total)}</span>
            </button>

          </div>

        </aside>

      </div>

      {paymentOpen&&(
        <div className="overlay">

          <div className="modal">

            <button
              className="close"
              onClick={closePayment}
            >
              Ã—
            </button>

            <span className="eyebrow">
              FINALIZAR PEDIDO
            </span>

            <div className="pay-total">
              {brl(total)}
            </div>

            {!paymentMode&&(
              <>

                <h2>
                  Como serÃ¡ o pagamento?
                </h2>

                <div className="choice-grid">

                  <button
                    className="choice"
                    onClick={chooseSingle}
                  >

                    <span className="choice-icon">
                      1
                    </span>

                    <strong>
                      PAGAR SOZINHO
                    </strong>

                    <small>
                      Uma Ãºnica pessoa paga a conta
                    </small>

                  </button>

                  <button
                    className="choice"
                    onClick={chooseSplit}
                  >

                    <span className="choice-icon">
                      Ã·
                    </span>

                    <strong>
                      DIVIDIR CONTA
                    </strong>

                    <small>
                      O NEXUS calcula automaticamente
                    </small>

                  </button>

                </div>

              </>
            )}

            {paymentMode==='SINGLE'&&(
              <>

                <button
                  className="back"
                  onClick={()=>{
                    setPaymentMode('');
                    setSingleMethod('');
                    setSingleReceived('');
                    setMsg('');
                  }}
                >
                  â† VOLTAR
                </button>

                <h2>
                  Escolha a forma de pagamento
                </h2>

                <div className="methods">

                  {METHODS.map(method=>(
                    <button
                      key={method.id}
                      className={
                        'method '+
                        (
                          singleMethod===method.id ? 'selected' : ''
                        )
                      }
                      onClick={()=>{
                        setSingleMethod(method.id);
                        setSingleReceived('');
                        setMsg('');
                      }}
                    >
                      {method.label}
                    </button>
                  ))}

                </div>

                {singleMethod==='DINHEIRO'&&(
                  <>

                    <label className="field-label">
                      Valor entregue pelo cliente
                    </label>

                    <div className="money-input large">

                      <span>R$</span>

                      <input
                        autoFocus
                        value={singleReceived}
                        onChange={
                          e=>
                            setSingleReceived(
                              e.target.value
                            )
                        }
                        placeholder="0,00"
                      />

                    </div>

                    <div className="cash-buttons">

                      <button
                        onClick={()=>
                          setSingleReceived(
                            total.toFixed(2)
                          )
                        }
                      >
                        EXATO
                      </button>

                      {[10,20,50,100,200]
                        .filter(v=>v>=total)
                        .map(v=>(
                          <button
                            key={v}
                            onClick={()=>
                              setSingleReceived(
                                String(v)
                              )
                            }
                          >
                            R$ {v}
                          </button>
                        ))}

                    </div>

                    <div className="change">

                      <span>TROCO</span>

                      <strong>
                        {brl(singleChange)}
                      </strong>

                    </div>

                  </>
                )}

                <button
                  className="finish"
                  disabled={
                    busy||
                    !singleMethod||
                    (
                      singleMethod==='DINHEIRO'&&
                      singleReceivedValue<total
                    )
                  }
                  onClick={finishSingle}
                >
                  {busy ? 'FINALIZANDO...' : 'CONFIRMAR E FINALIZAR'}
                </button>

              </>
            )}

            {paymentMode==='SPLIT'&&(
              <>

                <button
                  className="back"
                  onClick={()=>{
                    setPaymentMode('');
                    setPeople([]);
                    setMsg('');
                  }}
                >
                  â† VOLTAR
                </button>

                <div className="split-head">

                  <div>
                    <small>
                      DIVIDIR ENTRE
                    </small>

                    <strong>
                      Quantas pessoas?
                    </strong>
                  </div>

                  <div className="people-control">

                    <button
                      onClick={()=>
                        rebuildPeople(
                          peopleCount-1
                        )
                      }
                      disabled={peopleCount<=2}
                    >
                      âˆ’
                    </button>

                    <b>
                      {peopleCount}
                    </b>

                    <button
                      onClick={()=>
                        rebuildPeople(
                          peopleCount+1
                        )
                      }
                    >
                      +
                    </button>

                  </div>

                </div>

                <div className="split-summary">

                  <span>
                    {peopleCount} pessoas
                  </span>

                  <strong>
                    {peopleCount>0 ? `${brl(total/peopleCount)} em mÃ©dia` : brl(total)
                    }
                  </strong>

                </div>

                <div className="people-list">

                  {people.map(
                    (person,index)=>(
                      <div
                        className={
                          'person '+
                          (
                            person.paid ? 'paid' : ''
                          )
                        }
                        key={person.id}
                      >

                        <div className="person-head">

                          <div>

                            <small>
                              PESSOA {index+1}
                            </small>

                            <strong>
                              {brl(person.amount)}
                            </strong>

                          </div>

                          {person.paid&&(
                            <span className="paid-badge">
                              âœ“ PAGO
                            </span>
                          )}

                        </div>

                        <div className="person-methods">

                          {METHODS.map(method=>(
                            <button
                              key={method.id}
                              className={
                                person.method===method.id ? 'selected' : ''
                              }
                              onClick={()=>
                                selectPersonMethod(
                                  index,
                                  method.id
                                )
                              }
                            >
                              {method.label}
                            </button>
                          ))}

                        </div>

                        {person.method==='DINHEIRO'&&(
                          <div className="person-cash">

                            <label>
                              Entregou
                            </label>

                            <div className="mini-money">

                              <span>R$</span>

                              <input
                                value={person.received}
                                onChange={
                                  e=>
                                    updatePerson(
                                      index,
                                      {
                                        received:e.target.value,
                                        paid:false
                                      }
                                    )
                                }
                                placeholder="0,00"
                              />

                            </div>

                            <div className="person-cash-bottom">

                              <span>
                                Troco:
                                {' '}
                                <b>
                                  {brl(
                                    personChange(person)
                                  )}
                                </b>
                              </span>

                              <button
                                onClick={()=>
                                  confirmCashPerson(index)
                                }
                              >
                                CONFIRMAR
                              </button>

                            </div>

                          </div>
                        )}

                      </div>
                    )
                  )}

                </div>

                <div className="paid-progress">

                  <div>
                    <small>
                      PAGAMENTOS CONFIRMADOS
                    </small>

                    <strong>
                      {peoplePaid}/{people.length}
                    </strong>
                  </div>

                  <div className="progress">

                    <span
                      style={{
                        width:
                          `${
                            people.length ? (peoplePaid/people.length)*100 : 0
                          }%`
                      }}
                    />

                  </div>

                </div>

                <button
                  className="finish"
                  disabled={
                    busy||
                    !allPeoplePaid
                  }
                  onClick={finishSplit}
                >
                  {busy ? 'FINALIZANDO...' : allPeoplePaid ? 'FINALIZAR VENDA' : `AGUARDANDO ${people.length-peoplePaid} PAGAMENTO(S)`}
                </button>

              </>
            )}

            {msg&&(
              <div className="message">
                {msg}
              </div>
            )}

          </div>

        </div>
      )}

      {success&&(
        <div className="toast-success">

          <div className="success-check">
            âœ“
          </div>

          <div>

            <small>
              VENDA FINALIZADA
            </small>

            <strong>
              Pedido #{success.sale?.id}
            </strong>

            <span>
              {success.warning||
               'Venda concluÃ­da â€¢ Ficha de retirada gerada â€¢ Caixa pronto'}
            </span>

          </div>

        </div>
      )}

    </section>
  );
}

const styles=`
.fastpos{
  --bg:#08090b;
  --panel:#111318;
  --panel2:#171a20;
  --line:#292e37;
  --text:#f5f6f8;
  --muted:#9096a0;
  --gold:#e6b94e;
  --green:#59d99c;
  --red:#ff657d;
  min-height:100vh;
  padding:20px;
  box-sizing:border-box;
  color:var(--text);
  background:
    radial-gradient(circle at 12% 0%,#1b170d 0,transparent 26%),
    linear-gradient(135deg,#08090b,#101218);
  font-family:Inter,Segoe UI,Arial,sans-serif
}

.fastpos *{
  box-sizing:border-box
}

.fastpos button,
.fastpos input{
  font:inherit
}

.fastpos button{
  cursor:pointer
}

.top{
  max-width:1500px;
  margin:0 auto 16px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:16px
}

.brand strong{
  display:block;
  font-size:21px;
  letter-spacing:3px
}

.brand span{
  display:block;
  margin-top:4px;
  color:var(--gold);
  font-size:10px;
  letter-spacing:2px
}

.operator{
  display:flex;
  align-items:center;
  gap:18px;
  padding:10px 14px;
  border:1px solid var(--line);
  border-radius:13px;
  background:var(--panel)
}

.operator small,
.operator strong{
  display:block
}

.operator small{
  color:var(--muted);
  font-size:9px
}

.operator em{
  color:var(--green);
  font-size:10px;
  font-style:normal
}

.layout{
  max-width:1500px;
  margin:auto;
  display:grid;
  grid-template-columns:minmax(0,1fr) 390px;
  gap:16px;
  align-items:start
}

.catalog{
  min-width:0
}

.catalog-top{
  position:sticky;
  top:0;
  z-index:5;
  padding-bottom:10px;
  background:linear-gradient(#0b0c10 80%,transparent)
}

.search{
  width:100%;
  padding:14px 16px;
  border:1px solid var(--line);
  border-radius:12px;
  outline:0;
  background:#111318;
  color:#fff
}

.categories{
  display:flex;
  gap:7px;
  overflow:auto;
  padding-top:9px
}

.category{
  flex:none;
  padding:8px 13px;
  border:1px solid var(--line);
  border-radius:999px;
  background:#121419;
  color:#999
}

.category.active{
  border-color:var(--gold);
  background:var(--gold);
  color:#111;
  font-weight:900
}

.products{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(160px,1fr));
  gap:10px
}

.product{
  min-height:132px;
  padding:15px;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
  text-align:left;
  border:1px solid var(--line);
  border-radius:16px;
  background:linear-gradient(145deg,#171a20,#101217);
  color:#fff;
  transition:.15s
}

.product:hover{
  transform:translateY(-2px);
  border-color:#665634
}

.product small{
  color:#777;
  font-size:9px
}

.product strong{
  font-size:15px
}

.product b{
  color:var(--gold);
  font-size:19px
}

.product em{
  color:#999;
  font-size:9px;
  font-style:normal;
  letter-spacing:1px
}

.cart{
  position:sticky;
  top:15px;
  height:calc(100vh - 35px);
  min-height:560px;
  display:flex;
  flex-direction:column;
  border:1px solid var(--line);
  border-radius:20px;
  overflow:hidden;
  background:var(--panel);
  box-shadow:0 20px 50px rgba(0,0,0,.22)
}

.cart-title{
  padding:16px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  border-bottom:1px solid var(--line)
}

.cart-title small{
  display:block;
  color:var(--muted);
  font-size:9px
}

.clear{
  border:0;
  background:transparent;
  color:#c49d45;
  font-size:10px
}

.cart-items{
  flex:1;
  overflow:auto;
  padding:0 15px
}

.empty{
  height:100%;
  min-height:280px;
  display:flex;
  flex-direction:column;
  justify-content:center;
  align-items:center;
  gap:6px;
  color:#777;
  text-align:center
}

.empty-icon{
  width:48px;
  height:48px;
  display:grid;
  place-items:center;
  border:1px solid #343942;
  border-radius:50%;
  font-size:25px
}

.empty span{
  font-size:12px
}

.cart-item{
  display:flex;
  align-items:center;
  gap:9px;
  padding:13px 0;
  border-bottom:1px solid #242831
}

.item-name{
  flex:1
}

.item-name strong,
.item-name small{
  display:block
}

.item-name small{
  margin-top:3px;
  color:var(--muted)
}

.qty{
  display:flex;
  align-items:center;
  gap:6px
}

.qty button{
  width:29px;
  height:29px;
  border:1px solid #373c45;
  border-radius:8px;
  background:#1b1e24;
  color:#fff
}

.checkout{
  padding:15px;
  border-top:1px solid var(--line);
  background:#0e1014
}

.total{
  display:flex;
  justify-content:space-between;
  align-items:end;
  margin-bottom:12px
}

.total span{
  color:var(--muted);
  font-size:11px
}

.total strong{
  font-size:30px
}

.pay{
  width:100%;
  padding:15px 18px;
  display:flex;
  justify-content:space-between;
  border:0;
  border-radius:12px;
  background:var(--gold);
  color:#111;
  font-weight:950
}

.pay:disabled{
  opacity:.35;
  cursor:not-allowed
}

.overlay{
  position:fixed;
  inset:0;
  z-index:9999;
  display:grid;
  place-items:center;
  padding:16px;
  background:rgba(0,0,0,.82);
  backdrop-filter:blur(9px)
}

.modal{
  position:relative;
  width:min(700px,100%);
  max-height:94vh;
  overflow:auto;
  padding:25px;
  border:1px solid #343a45;
  border-radius:22px;
  background:#111419;
  box-shadow:0 35px 100px #000
}

.close{
  position:absolute;
  right:13px;
  top:13px;
  width:35px;
  height:35px;
  border:1px solid var(--line);
  border-radius:50%;
  background:#1a1d23;
  color:#fff;
  font-size:21px
}

.eyebrow{
  color:var(--gold);
  font-size:9px;
  letter-spacing:2px
}

.pay-total{
  margin:5px 0 18px;
  font-size:43px;
  font-weight:900
}

.choice-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:11px
}

.choice{
  min-height:150px;
  padding:20px;
  border:1px solid var(--line);
  border-radius:17px;
  background:#171a20;
  color:#fff;
  text-align:left
}

.choice:hover{
  border-color:var(--gold)
}

.choice-icon{
  width:40px;
  height:40px;
  margin-bottom:17px;
  display:grid;
  place-items:center;
  border-radius:11px;
  background:#25200f;
  color:var(--gold);
  font-size:22px;
  font-weight:900
}

.choice strong,
.choice small{
  display:block
}

.choice small{
  margin-top:7px;
  color:var(--muted)
}

.back{
  margin-bottom:12px;
  padding:0;
  border:0;
  background:transparent;
  color:var(--gold)
}

.methods{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:8px
}

.method,
.person-methods button{
  padding:13px;
  border:1px solid #333944;
  border-radius:11px;
  background:#181b21;
  color:#ddd
}

.method.selected,
.person-methods button.selected{
  border-color:var(--gold);
  background:#2a2414;
  color:#f1c85d;
  font-weight:900
}

.field-label{
  display:block;
  margin:17px 0 7px;
  color:#aaa
}

.money-input{
  display:flex;
  align-items:center;
  border:1px solid #383e48;
  border-radius:12px;
  padding:0 12px;
  background:#0d0f12
}

.money-input span{
  color:#777
}

.money-input input{
  width:100%;
  padding:13px;
  border:0;
  outline:0;
  background:transparent;
  color:#fff
}

.money-input.large input{
  font-size:29px;
  font-weight:900
}

.cash-buttons{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  margin-top:8px
}

.cash-buttons button{
  padding:8px 11px;
  border:1px solid #343a44;
  border-radius:8px;
  background:#1b1e24;
  color:#ddd
}

.change{
  margin-top:11px;
  padding:13px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  border:1px solid #28543f;
  border-radius:12px;
  background:#10251c
}

.change span{
  color:#8ac9aa
}

.change strong{
  color:var(--green);
  font-size:26px
}

.finish{
  width:100%;
  margin-top:16px;
  padding:15px;
  border:0;
  border-radius:12px;
  background:var(--green);
  color:#07140e;
  font-weight:950
}

.finish:disabled{
  opacity:.35;
  cursor:not-allowed
}

.split-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:15px;
  padding:14px;
  border:1px solid var(--line);
  border-radius:13px;
  background:#171a20
}

.split-head small,
.split-head strong{
  display:block
}

.split-head small{
  color:var(--muted);
  font-size:9px
}

.people-control{
  display:flex;
  align-items:center;
  gap:12px
}

.people-control button{
  width:38px;
  height:38px;
  border:1px solid #393f49;
  border-radius:10px;
  background:#202329;
  color:#fff;
  font-size:20px
}

.people-control b{
  min-width:28px;
  text-align:center;
  font-size:23px
}

.split-summary{
  margin:9px 0;
  padding:11px 14px;
  display:flex;
  justify-content:space-between;
  border-radius:11px;
  background:#0d0f12;
  color:#aaa
}

.split-summary strong{
  color:var(--gold)
}

.people-list{
  display:grid;
  gap:8px
}

.person{
  padding:13px;
  border:1px solid var(--line);
  border-radius:13px;
  background:#171a20
}

.person.paid{
  border-color:#28543f;
  background:#122219
}

.person-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:10px
}

.person-head small,
.person-head strong{
  display:block
}

.person-head small{
  color:var(--muted);
  font-size:9px
}

.person-head strong{
  margin-top:2px;
  font-size:20px
}

.paid-badge{
  color:var(--green);
  font-size:10px;
  font-weight:900
}

.person-methods{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:5px
}

.person-methods button{
  padding:9px 5px;
  font-size:10px
}

.person-cash{
  margin-top:10px;
  padding:10px;
  border-radius:10px;
  background:#0d0f12
}

.person-cash label{
  display:block;
  margin-bottom:5px;
  color:#888;
  font-size:10px
}

.mini-money{
  display:flex;
  align-items:center;
  border:1px solid #343a44;
  border-radius:9px;
  padding:0 9px
}

.mini-money span{
  color:#777
}

.mini-money input{
  width:100%;
  padding:9px;
  border:0;
  outline:0;
  background:transparent;
  color:#fff
}

.person-cash-bottom{
  margin-top:7px;
  display:flex;
  justify-content:space-between;
  align-items:center
}

.person-cash-bottom span{
  color:#aaa;
  font-size:11px
}

.person-cash-bottom button{
  padding:7px 10px;
  border:0;
  border-radius:8px;
  background:var(--green);
  color:#07140e;
  font-size:9px;
  font-weight:900
}

.paid-progress{
  margin-top:11px;
  padding:12px;
  border:1px solid var(--line);
  border-radius:11px;
  background:#0d0f12
}

.paid-progress>div:first-child{
  display:flex;
  justify-content:space-between
}

.paid-progress small{
  color:#888
}

.progress{
  height:6px;
  margin-top:8px;
  overflow:hidden;
  border-radius:999px;
  background:#242830
}

.progress span{
  display:block;
  height:100%;
  border-radius:999px;
  background:var(--green);
  transition:.2s
}

.message{
  margin-top:11px;
  padding:11px;
  border:1px solid #594721;
  border-radius:10px;
  background:#251e10;
  color:#efc75e
}

.toast-success{
  position:fixed;
  right:22px;
  bottom:22px;
  z-index:10000;
  width:min(420px,calc(100% - 44px));
  display:flex;
  gap:13px;
  align-items:center;
  padding:16px;
  border:1px solid #28543f;
  border-radius:15px;
  background:#102219;
  box-shadow:0 20px 60px #000;
  animation:toastIn .2s ease
}

.success-check{
  flex:none;
  width:43px;
  height:43px;
  display:grid;
  place-items:center;
  border-radius:50%;
  background:#17442d;
  color:var(--green);
  font-size:22px;
  font-weight:900
}

.toast-success small,
.toast-success strong,
.toast-success span{
  display:block
}

.toast-success small{
  color:#77b996;
  font-size:8px;
  letter-spacing:1px
}

.toast-success strong{
  margin:2px 0;
  font-size:17px
}

.toast-success span{
  color:#a8c4b4;
  font-size:10px
}

.open-page{
  display:grid;
  place-items:center
}

.open-card{
  width:min(430px,100%);
  padding:27px;
  border:1px solid var(--line);
  border-radius:20px;
  background:var(--panel)
}

.open-card label{
  display:block;
  margin:18px 0 7px;
  color:#aaa
}

.primary{
  width:100%;
  margin-top:14px;
  padding:14px;
  border:0;
  border-radius:11px;
  background:var(--gold);
  color:#111;
  font-weight:900
}

@keyframes toastIn{
  from{
    transform:translateY(15px);
    opacity:0
  }
  to{
    transform:translateY(0);
    opacity:1
  }
}

@media(max-width:950px){
  .layout{
    grid-template-columns:1fr
  }

  .cart{
    position:relative;
    top:auto;
    height:auto;
    min-height:420px
  }
}

@media(max-width:600px){
  .fastpos{
    padding:11px
  }

  .products{
    grid-template-columns:1fr 1fr
  }

  .choice-grid{
    grid-template-columns:1fr
  }

  .person-methods{
    grid-template-columns:1fr 1fr
  }

  .modal{
    padding:20px 14px
  }
}
`;
