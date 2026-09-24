import React,{useEffect,useMemo,useState} from 'react';
import {saasPublicApi} from './saas-public-api.js';
import './SaasCommercialV1.css';

const money=value=>
  new Intl.NumberFormat('pt-BR',{
    style:'currency',
    currency:'BRL'
  }).format(Number(value||0));

const planFeatures={
  ESSENTIAL:[
    'Caixa e operação',
    'Mesas e salão',
    'Estoque inteligente',
    'Bebidas e doses',
    'Financeiro',
    'Eventos essenciais',
    'Indicadores de gestão'
  ],
  PROFESSIONAL:[
    'Tudo do Essential',
    'Eventos completos',
    'Ingressos online',
    'QR Code e Gate Scanner',
    'Inteligência avançada',
    'Auditoria operacional',
    'Mais usuários e recursos'
  ],
  ENTERPRISE:[
    'Tudo do Professional',
    'Inteligência executiva completa',
    'Recursos avançados de gestão',
    'Estrutura preparada para expansão',
    'Maior capacidade operacional',
    'Atendimento premium'
  ]
};

function normalizePlans(payload){
  if(Array.isArray(payload))return payload;
  if(Array.isArray(payload?.plans))return payload.plans;
  if(Array.isArray(payload?.data))return payload.data;
  return [];
}

function codeOf(plan){
  return String(
    plan?.code||
    plan?.plan_code||
    plan?.slug||
    ''
  ).toUpperCase();
}

function basePrice(plan){
  return Number(
    plan?.base_price ??
    plan?.price ??
    plan?.monthly_price ??
    plan?.list_price ??
    0
  );
}

function effectivePrice(plan){
  return Number(
    plan?.effective_price ??
    plan?.promotional_price ??
    plan?.current_price ??
    basePrice(plan)
  );
}

export function SaasPlansPage(){
  const[plans,setPlans]=useState([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');

  useEffect(()=>{
    let alive=true;

    saasPublicApi.plans()
      .then(data=>{
        if(alive){
          setPlans(normalizePlans(data));
          setError('');
        }
      })
      .catch(err=>{
        console.error('NEXUS_SAAS_PLANS_ERROR',err);
        if(alive){
          setError(
            err?.message||
            'Não foi possível carregar os planos neste momento.'
          );
        }
      })
      .finally(()=>{
        if(alive)setLoading(false);
      });

    return()=>{alive=false};
  },[]);

  const brl=value=>
    Number(value||0).toLocaleString(
      'pt-BR',
      {
        style:'currency',
        currency:'BRL',
        minimumFractionDigits:0,
        maximumFractionDigits:2
      }
    );

  const featureLabels={
    pos:'Caixa inteligente e vendas',
    salon:'Mesas, salão e comandas',
    inventory:'Estoque inteligente',
    beverages_and_doses:'Bebidas e doses',
    financial:'Gestão financeira',
    events:'Eventos',
    tickets:'Ingressos digitais',
    online_ticket_sales:'Venda online de ingressos',
    qr_code:'QR Code integrado',
    gate_scanner:'Controle de acesso',
    audit:'Auditoria operacional',
    intelligence:'NEXUS Intelligence',
    support:'Suporte',
    multi_unit_ready:'Estrutura para multiunidades'
  };

  const readableFeature=(key,value)=>{
    const label=featureLabels[key]||
      String(key)
        .replaceAll('_',' ')
        .replace(/\b\w/g,x=>x.toUpperCase());

    if(value===true)return label;
    if(value===false||value===null||value===undefined)return null;

    const suffix=String(value)
      .replaceAll('_',' ')
      .toLowerCase();

    return `${label} · ${suffix}`;
  };

  const featuresFor=plan=>{
    const source=plan?.features||{};

    return Object.entries(source)
      .map(([key,value])=>readableFeature(key,value))
      .filter(Boolean)
      .slice(0,8);
  };

  return(
    <main className="nxs-commercial nxs-v3">

      <div className="nxs-v3-ambient nxs-v3-ambient-a"/>
      <div className="nxs-v3-ambient nxs-v3-ambient-b"/>
      <div className="nxs-v3-grid-bg"/>

      <div className="nxs-container">

        <header className="nxs-header">

          <a href="/planos" className="nxs-brand">
            <div className="nxs-brand-mark">N</div>

            <div className="nxs-brand-copy">
              <strong>NEXUS</strong>
              <small>HOSPITALITY ONE</small>
            </div>
          </a>

          <nav className="nxs-nav">
            <a href="#inicio">Início</a>
            <a href="#planos">Planos</a>
            <a href="#intelligence">Intelligence</a>
            <a href="#seguranca">Segurança</a>
          </nav>

          <div className="nxs-actions">
            <a href="/" className="nxs-btn">
              Entrar
            </a>

            <a href="#planos" className="nxs-btn nxs-btn-primary">
              Começar agora
              <span>→</span>
            </a>
          </div>

        </header>


        <section id="inicio" className="nxs-hero">

          <div className="nxs-v3-hero-copy">

            <div className="nxs-eyebrow">
              HOSPITALITY INTELLIGENCE PLATFORM
            </div>

            <h1>
              Gestão inteligente para
              <span className="nxs-gradient-text">
                negócios que querem crescer.
              </span>
            </h1>

            <p className="nxs-lead">
              Operação, caixa, estoque, financeiro, equipe,
              eventos, ingressos e inteligência em uma única
              plataforma criada para transformar dados em decisões.
            </p>

            <div className="nxs-hero-buttons">

              <a
                href="#planos"
                className="nxs-btn nxs-btn-primary nxs-v3-main-cta"
              >
                CONHECER PLANOS
                <span>→</span>
              </a>

              <a
                href="#intelligence"
                className="nxs-btn"
              >
                CONHECER A INTELIGÊNCIA
              </a>

            </div>


            <div className="nxs-benefits">

              <div className="nxs-benefit">
                <div className="nxs-benefit-icon">↗</div>
                <div>
                  <b>Mais controle</b>
                  <small>Operação centralizada</small>
                </div>
              </div>

              <div className="nxs-benefit">
                <div className="nxs-benefit-icon">⌁</div>
                <div>
                  <b>Mais inteligência</b>
                  <small>Decisões orientadas por dados</small>
                </div>
              </div>

              <div className="nxs-benefit">
                <div className="nxs-benefit-icon">◇</div>
                <div>
                  <b>Mais crescimento</b>
                  <small>Gestão preparada para evoluir</small>
                </div>
              </div>

            </div>

          </div>


          <div
            id="intelligence"
            className="nxs-ai-stage"
          >

            <div className="nxs-v3-data-line data-line-a"/>
            <div className="nxs-v3-data-line data-line-b"/>

            <div className="nxs-ai-ring"/>
            <div className="nxs-ai-ring nxs-ai-ring-two"/>

            <div className="nxs-v3-orbit-dot orbit-dot-a"/>
            <div className="nxs-v3-orbit-dot orbit-dot-b"/>

            <div className="nxs-ai-core">
              <div className="nxs-v3-core-glass"/>
              <b>N</b>
            </div>

            <div className="nxs-ai-label">
              IA QUE TRANSFORMA
              GESTÃO EM
              RESULTADOS
            </div>

            <div className="nxs-ai-status">
              <i/>
              NEXUS INTELLIGENCE CORE
            </div>

            <div className="nxs-v3-ai-card nxs-v3-ai-card-one">
              <span>OPERAÇÃO</span>
              <b>Dados conectados</b>
            </div>

            <div className="nxs-v3-ai-card nxs-v3-ai-card-two">
              <span>INTELLIGENCE</span>
              <b>Decisões mais rápidas</b>
            </div>

          </div>

        </section>


        <section
          id="planos"
          className="nxs-plans-section"
        >

          <div className="nxs-section-head">
            <span>PLANOS NEXUS</span>

            <h2>
              Tecnologia para cada estágio
              do seu negócio.
            </h2>

            <p>
              Escolha a estrutura adequada para sua operação.
              Valores, benefícios e promoções são carregados
              diretamente da plataforma NEXUS.
            </p>
          </div>


          {loading&&(
            <div className="nxs-v3-loading">
              <div className="nxs-v3-loader"/>
              <span>Carregando planos NEXUS...</span>
            </div>
          )}


          {error&&(
            <div className="nxs-error">
              {error}
            </div>
          )}


          {!loading&&!error&&(
            <div className="nxs-plan-grid">

              {plans.map(plan=>{

                const code=codeOf(plan);
                const base=basePrice(plan);
                const effective=effectivePrice(plan);

                const pricing=plan?.pricing||{};
                const promotion=pricing?.promotion||null;

                const promoted=
                  promotion&&
                  Number(effective)<Number(base);

                const featured=
                  Boolean(plan?.featured)||
                  code==='PROFESSIONAL';

                const features=featuresFor(plan);

                return(
                  <article
                    key={plan.id||code}
                    className={
                      `nxs-plan ${
                        featured?'featured':''
                      }`
                    }
                  >

                    {featured&&(
                      <div className="nxs-featured-label">
                        MAIS ESCOLHIDO
                      </div>
                    )}


                    <div className="nxs-v3-plan-top">

                      <div className="nxs-plan-icon">
                        {code==='PROFESSIONAL'
                          ?'✦'
                          :code==='ENTERPRISE'
                            ?'▦'
                            :'◇'
                        }
                      </div>

                      <span className="nxs-v3-plan-code">
                        {code}
                      </span>

                    </div>


                    <h3>
                      {plan.name||
                        `NEXUS ${code}`
                      }
                    </h3>

                    <p className="nxs-plan-sub">
                      {plan.tagline||
                       plan.description||
                       'Gestão inteligente NEXUS.'}
                    </p>


                    <div className="nxs-price-wrap">

                      {promoted&&(
                        <div className="nxs-old-price">
                          de {brl(base)}
                        </div>
                      )}

                      <div className="nxs-price">
                        <strong>
                          {brl(effective)}
                        </strong>
                        <span>/mês</span>
                      </div>


                      {promotion&&(
                        <div className="nxs-promo">
                          {promotion.name||
                           promotion.code||
                           'OFERTA ATIVA'
                          }
                        </div>
                      )}

                    </div>


                    <div className="nxs-features">

                      {features.map((feature,index)=>(
                        <div
                          className="nxs-feature"
                          key={`${code}-${index}`}
                        >
                          <span className="nxs-check">✓</span>
                          <span>{feature}</span>
                        </div>
                      ))}

                    </div>


                    <a
                      className={
                        `nxs-btn ${
                          featured
                            ?'nxs-btn-primary'
                            :''
                        }`
                      }
                      href={
                        `/contratar?plano=${
                          encodeURIComponent(code)
                        }`
                      }
                    >
                      ESCOLHER {plan.name||code}
                      <span>→</span>
                    </a>

                  </article>
                );
              })}

            </div>
          )}

        </section>


        <section
          id="seguranca"
          className="nxs-v3-intelligence-strip"
        >

          <div className="nxs-v3-strip-intro">
            <span>NEXUS OPERATING SYSTEM</span>

            <h2>
              Uma operação.
              <br/>
              Uma inteligência.
            </h2>
          </div>


          <div className="nxs-v3-strip-grid">

            <div className="nxs-v3-strip-item">
              <span>01</span>
              <div>
                <b>Operação integrada</b>
                <p>
                  Caixa, estoque, salão, clientes,
                  financeiro e eventos conectados.
                </p>
              </div>
            </div>

            <div className="nxs-v3-strip-item">
              <span>02</span>
              <div>
                <b>Intelligence Core</b>
                <p>
                  Indicadores e informações para
                  apoiar decisões operacionais.
                </p>
              </div>
            </div>

            <div className="nxs-v3-strip-item">
              <span>03</span>
              <div>
                <b>Controle e auditoria</b>
                <p>
                  Perfis, permissões e rastreabilidade
                  das operações.
                </p>
              </div>
            </div>

          </div>

        </section>


        <footer className="nxs-v3-footer">

          <div className="nxs-brand">
            <div className="nxs-brand-mark">N</div>

            <div className="nxs-brand-copy">
              <strong>NEXUS</strong>
              <small>HOSPITALITY ONE</small>
            </div>
          </div>

          <div>
            NEXORA TECHNOLOGY · HOSPITALITY INTELLIGENCE
          </div>

        </footer>

      </div>

    </main>
  );
}
/*
 * NEXUS_CHECKOUT_IDEMPOTENCY_CLIENT_V3
 *
 * A chave identifica uma tentativa de checkout.
 * Ela nao contem dados do cliente e nao e derivada
 * de e-mail, documento, plano ou senha.
 */

const NEXUS_CHECKOUT_ATTEMPT_KEY=
  'nexus:saas:checkout:idempotency:v3';

function createCheckoutAttemptKey(){

  if(
    typeof crypto!=='undefined' &&
    typeof crypto.randomUUID==='function'
  ){
    return crypto.randomUUID();
  }

  if(
    typeof crypto!=='undefined' &&
    typeof crypto.getRandomValues==='function'
  ){
    const bytes=
      new Uint8Array(16);

    crypto.getRandomValues(bytes);

    /*
     * UUID v4.
     */

    bytes[6]=
      (bytes[6]&0x0f)|0x40;

    bytes[8]=
      (bytes[8]&0x3f)|0x80;

    const hex=
      Array.from(
        bytes,
        byte=>byte
          .toString(16)
          .padStart(2,'0')
      );

    return [
      hex.slice(0,4).join(''),
      hex.slice(4,6).join(''),
      hex.slice(6,8).join(''),
      hex.slice(8,10).join(''),
      hex.slice(10,16).join('')
    ].join('-');
  }

  throw new Error(
    'SECURE_RANDOM_UNAVAILABLE'
  );
}

function getOrCreateCheckoutAttemptKey(planCode){
  const normalizedPlan=
    String(planCode||'')
      .trim()
      .toUpperCase();

  const stored=
    sessionStorage.getItem(
      NEXUS_CHECKOUT_ATTEMPT_KEY
    );

  if(stored){
    try{
      const parsed=JSON.parse(stored);

      if(
        parsed?.key &&
        parsed?.plan_code===normalizedPlan
      ){
        return parsed.key;
      }
    }catch{
      // Formato anterior ou invalido.
      // Uma nova tentativa sera criada abaixo.
    }
  }

  const created=createCheckoutAttemptKey();

  sessionStorage.setItem(
    NEXUS_CHECKOUT_ATTEMPT_KEY,
    JSON.stringify({
      key:created,
      plan_code:normalizedPlan
    })
  );

  return created;
}

function resetCheckoutAttemptKey(){

  sessionStorage.removeItem(
    NEXUS_CHECKOUT_ATTEMPT_KEY
  );
}

export function SaasCheckoutPage(){
  const params=useMemo(
    ()=>new URLSearchParams(window.location.search),
    []
  );

  const planCode=String(
    params.get('plano')||'PROFESSIONAL'
  ).toUpperCase();

  const[plan,setPlan]=useState(null);
  const[loading,setLoading]=useState(true);
  const[submitting,setSubmitting]=useState(false);
  const[error,setError]=useState('');
  const[result,setResult]=useState(null);

  const[form,setForm]=useState({
    legal_name:'',
    trade_name:'',
    document:'',
    owner_name:'',
    owner_email:'',
    phone:'',
    password:'',
    confirm_password:''
  });

  useEffect(()=>{
    let alive=true;

    saasPublicApi.plan(planCode)
      .then(data=>{
        if(alive){
          setPlan(data?.plan||data);
          setError('');
        }
      })
      .catch(err=>{
        if(alive){
          setError(
            err?.message||
            'Não foi possível carregar o plano selecionado.'
          );
        }
      })
      .finally(()=>{
        if(alive)setLoading(false);
      });

    return()=>{alive=false};
  },[planCode]);

  function change(field,value){

    /*
     * Qualquer alteracao cria uma nova tentativa
     * no proximo submit. Isso inclui senha.
     */

    resetCheckoutAttemptKey();

    setForm(prev=>({
      ...prev,
      [field]:value
    }));
  }

  function formatDocument(value){
    const digits=String(value||'')
      .replace(/\D/g,'')
      .slice(0,14);

    if(digits.length<=11){
      return digits
        .replace(/^(\d{3})(\d)/,'$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3')
        .replace(/\.(\d{3})(\d)/,'.$1-$2');
    }

    return digits
      .replace(/^(\d{2})(\d)/,'$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
      .replace(/\.(\d{3})(\d)/,'.$1/$2')
      .replace(/(\d{4})(\d)/,'$1-$2');
  }

  function formatPhone(value){
    const digits=String(value||'')
      .replace(/\D/g,'')
      .slice(0,11);

    if(digits.length<=10){
      return digits
        .replace(/^(\d{2})(\d)/,'($1) $2')
        .replace(/(\d{4})(\d)/,'$1-$2');
    }

    return digits
      .replace(/^(\d{2})(\d)/,'($1) $2')
      .replace(/(\d{5})(\d)/,'$1-$2');
  }

  function validate(){
    const required=[
      ['legal_name','Informe a razão social.'],
      ['trade_name','Informe o nome fantasia.'],
      ['document','Informe o CPF ou CNPJ.'],
      ['owner_name','Informe o responsável pela contratação.'],
      ['owner_email','Informe o e-mail do responsável.'],
      ['phone','Informe o telefone.']
    ];

    for(const[field,message]of required){
      if(!String(form[field]||'').trim()){
        return message;
      }
    }

    const email=String(form.owner_email).trim();

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      return 'Informe um e-mail válido.';
    }

    if(String(form.password).length<10){
      return 'A senha deve possuir pelo menos 10 caracteres.';
    }

    if(form.password!==form.confirm_password){
      return 'As senhas informadas não coincidem.';
    }

    const documentDigits=String(form.document).replace(/\D/g,'');

    if(
      documentDigits.length!==11 &&
      documentDigits.length!==14
    ){
      return 'Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos.';
    }

    const phoneDigits=String(form.phone).replace(/\D/g,'');

    if(phoneDigits.length<10){
      return 'Informe um telefone válido com DDD.';
    }

    return '';
  }

  async function submit(event){
    event.preventDefault();

    const validationError=validate();

    if(validationError){
      setError(validationError);
      return;
    }

    setError('');
    setSubmitting(true);

    try{

      /*
       * Retry sem edicao reutiliza exatamente
       * a mesma chave da tentativa anterior.
       */

      const idempotencyKey=
        getOrCreateCheckoutAttemptKey(planCode);

      const data=await saasPublicApi.createCheckout({
        plan_code:planCode,
        legal_name:String(form.legal_name).trim(),
        trade_name:String(form.trade_name).trim(),
        document:String(form.document).replace(/\D/g,''),
        owner_name:String(form.owner_name).trim(),
        email:String(form.owner_email).trim().toLowerCase(),
        phone:String(form.phone).replace(/\D/g,''),
        password:String(form.password)
      },idempotencyKey);

      /*
       * Checkout confirmado pelo backend:
       * a tentativa terminou.
       */

      resetCheckoutAttemptKey();

      setResult(data);

      const publicId=
        data?.checkout_id||
        data?.public_id||
        data?.checkout?.public_id;

      const token=
        data?.checkout_token||
        data?.token||
        data?.checkout?.token;

      if(publicId&&token){
        window.history.replaceState(
          {},
          '',
          `/contratacao?checkout=${encodeURIComponent(publicId)}`+
          `&token=${encodeURIComponent(token)}`
        );
      }

    }catch(err){
      setError(
        err?.data?.message||
        err?.data?.error||
        err?.message||
        'Não foi possível iniciar a contratação.'
      );
    }finally{
      setSubmitting(false);
    }
  }

  const selectedPrice=
    plan
      ?effectivePrice(plan)||basePrice(plan)
      :0;

  const selectedBase=
    plan
      ?basePrice(plan)
      :0;

  const pricing=plan?.pricing||{};
  const promotion=pricing?.promotion||null;

  const promoted=
    Boolean(promotion)&&
    Number(selectedPrice)<Number(selectedBase);

  if(result){
    const payment=
      result.payment||
      result.checkout?.payment||
      result.subscription||
      result;

    return(
      <main className="nxs-commercial nxs-checkout-v2">

        <div className="nxs-v3-grid-bg"/>
        <div className="nxs-v3-ambient nxs-v3-ambient-a"/>

        <div className="nxs-checkout-v2-success">

          <div className="nxs-checkout-success-core">
            <span>✓</span>
          </div>

          <div className="nxs-kicker">
            NEXUS HOSPITALITY ONE
          </div>

          <h1>Contratação iniciada.</h1>

          <p>
            Recebemos os dados da empresa. A assinatura permanecerá
            aguardando a confirmação do pagamento antes da ativação.
          </p>

          {payment?.invoice_url&&(
            <a
              className="nxs-btn nxs-btn-primary"
              href={payment.invoice_url}
              target="_blank"
              rel="noreferrer"
            >
              ABRIR PAGAMENTO
              <span>→</span>
            </a>
          )}

          <small>
            O acesso não é liberado antes da confirmação do pagamento.
          </small>

        </div>
      </main>
    );
  }

  return(
    <main className="nxs-commercial nxs-checkout-v2">

      <div className="nxs-v3-grid-bg"/>
      <div className="nxs-v3-ambient nxs-v3-ambient-a"/>
      <div className="nxs-v3-ambient nxs-v3-ambient-b"/>

      <div className="nxs-checkout-v2-container">

        <header className="nxs-checkout-v2-header">

          <a href="/planos" className="nxs-brand">
            <div className="nxs-brand-mark">N</div>

            <div className="nxs-brand-copy">
              <strong>NEXUS</strong>
              <small>HOSPITALITY ONE</small>
            </div>
          </a>

          <a
            href="/planos"
            className="nxs-checkout-v2-back"
          >
            ← Voltar aos planos
          </a>

        </header>


        <div className="nxs-checkout-v2-progress">

          <div className="active">
            <span>01</span>
            <b>Empresa</b>
          </div>

          <i/>

          <div className="active">
            <span>02</span>
            <b>Responsável</b>
          </div>

          <i/>

          <div>
            <span>03</span>
            <b>Pagamento</b>
          </div>

          <i/>

          <div>
            <span>04</span>
            <b>Ativação</b>
          </div>

        </div>


        <div className="nxs-checkout-v2-layout">

          <aside className="nxs-checkout-v2-summary">

            <div className="nxs-kicker">
              PLANO SELECIONADO
            </div>

            <div className="nxs-checkout-v2-plan-head">

              <div>
                <small>NEXUS</small>

                <h1>
                  {plan?.name||
                   codeOf(plan)||
                   planCode}
                </h1>
              </div>

              <div className="nxs-checkout-v2-plan-icon">
                ✦
              </div>

            </div>


            {loading?(
              <div className="nxs-checkout-v2-loading">
                Carregando plano...
              </div>
            ):plan&&(
              <>
                <div className="nxs-checkout-v2-price">

                  {promoted&&(
                    <div className="nxs-checkout-v2-old-price">
                      {money(selectedBase)}
                    </div>
                  )}

                  <strong>
                    {money(selectedPrice)}
                  </strong>

                  <span>/ mês</span>

                </div>


                {promotion&&(
                  <div className="nxs-checkout-v2-promo">
                    <span>✦</span>

                    <div>
                      <b>
                        {promotion.name||
                         promotion.code||
                         'Oferta ativa'}
                      </b>

                      <small>
                        Condição promocional aplicada
                        automaticamente.
                      </small>
                    </div>
                  </div>
                )}
              </>
            )}


            <div className="nxs-checkout-v2-divider"/>


            <div className="nxs-checkout-v2-benefits">

              <div>
                <span>✓</span>
                <p>
                  <b>Operação centralizada</b>
                  <small>
                    Gestão integrada em uma única plataforma.
                  </small>
                </p>
              </div>

              <div>
                <span>✓</span>
                <p>
                  <b>NEXUS Intelligence</b>
                  <small>
                    Informações para apoiar decisões do negócio.
                  </small>
                </p>
              </div>

              <div>
                <span>✓</span>
                <p>
                  <b>Ativação controlada</b>
                  <small>
                    Acesso somente após confirmação do pagamento.
                  </small>
                </p>
              </div>

            </div>


            <div className="nxs-checkout-v2-ai">

              <div className="nxs-checkout-mini-core">
                N
              </div>

              <div>
                <span>NEXUS INTELLIGENCE CORE</span>
                <b>Preparando sua nova operação.</b>
              </div>

            </div>

          </aside>


          <section className="nxs-checkout-v2-form-card">

            <div className="nxs-checkout-v2-form-head">

              <span>CADASTRO DA EMPRESA</span>

              <h2>Dados para contratação</h2>

              <p>
                Preencha os dados da empresa e do responsável
                pela assinatura.
              </p>

            </div>


            <form onSubmit={submit} noValidate>

              <div className="nxs-checkout-v2-fields">

                <label className="full">
                  <span>Razão social *</span>

                  <input
                    autoComplete="organization"
                    placeholder="Razão social da empresa"
                    value={form.legal_name}
                    onChange={
                      e=>change(
                        'legal_name',
                        e.target.value
                      )
                    }
                  />
                </label>


                <label>
                  <span>Nome fantasia *</span>

                  <input
                    placeholder="Nome do estabelecimento"
                    value={form.trade_name}
                    onChange={
                      e=>change(
                        'trade_name',
                        e.target.value
                      )
                    }
                  />
                </label>


                <label>
                  <span>CPF / CNPJ *</span>

                  <input
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    value={form.document}
                    onChange={
                      e=>change(
                        'document',
                        formatDocument(e.target.value)
                      )
                    }
                  />
                </label>


                <label className="full nxs-checkout-v2-section-label">
                  <span>RESPONSÁVEL PELA CONTRATAÇÃO</span>
                </label>


                <label>
                  <span>Nome completo *</span>

                  <input
                    autoComplete="name"
                    placeholder="Nome do responsável"
                    value={form.owner_name}
                    onChange={
                      e=>change(
                        'owner_name',
                        e.target.value
                      )
                    }
                  />
                </label>


                <label>
                  <span>Telefone *</span>

                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                    value={form.phone}
                    onChange={
                      e=>change(
                        'phone',
                        formatPhone(e.target.value)
                      )
                    }
                  />
                </label>


                <label className="full">
                  <span>E-mail do responsável *</span>

                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="responsavel@empresa.com.br"
                    value={form.owner_email}
                    onChange={
                      e=>change(
                        'owner_email',
                        e.target.value
                      )
                    }
                  />
                </label>
                <label>
                  <span>Senha de acesso</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Mínimo de 10 caracteres"
                    value={form.password}
                    onChange={
                      e=>change(
                        'password',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>Confirmar senha</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repita a senha"
                    value={form.confirm_password}
                    onChange={
                      e=>change(
                        'confirm_password',
                        e.target.value
                      )
                    }
                  />
                </label>

              </div>


              {error&&(
                <div className="nxs-checkout-v2-error">
                  <span>!</span>
                  <div>
                    <b>Revise os dados</b>
                    <p>{error}</p>
                  </div>
                </div>
              )}


              <div className="nxs-checkout-v2-submit-area">

                <button
                  type="submit"
                  className="nxs-btn nxs-btn-primary nxs-checkout-v2-submit"
                  disabled={submitting||loading}
                >
                  {submitting
                    ?'PROCESSANDO...'
                    :'CONTINUAR PARA PAGAMENTO'
                  }

                  {!submitting&&<span>→</span>}
                </button>


                <div className="nxs-checkout-v2-secure">
                  <span>◇</span>

                  <div>
                    <b>Ambiente protegido</b>
                    <small>
                      Seus dados são utilizados para
                      processar a contratação.
                    </small>
                  </div>
                </div>

              </div>

            </form>

          </section>

        </div>

      </div>

    </main>
  );
}

export function SaasContractStatusPage(){
  const params=useMemo(
    ()=>new URLSearchParams(window.location.search),
    []
  );

  const publicId=params.get('checkout')||'';
  const token=params.get('token')||'';

  const[data,setData]=useState(null);
  const[error,setError]=useState('');

  useEffect(()=>{
    if(!publicId||!token){
      setError('Contratação não identificada.');
      return;
    }

    let alive=true;

    async function load(){
      try{
        const result=
          await saasPublicApi.checkout(publicId,token);

        if(alive)setData(result);
      }catch(err){
        if(alive)setError(err.message);
      }
    }

    load();
    const timer=setInterval(load,5000);

    return()=>{
      alive=false;
      clearInterval(timer);
    };
  },[publicId,token]);

  const status=String(
    data?.status||
    data?.subscription?.status||
    'PENDING'
  ).toUpperCase();

  return(
    <main className="nxs-checkout-page">
      <section className="nxs-success">
        <span>NEXUS HOSPITALITY ONE</span>

        <div className="nxs-status-orb">
          {status==='ACTIVE'?'✓':'…'}
        </div>

        <h1>
          {status==='ACTIVE'
            ?'Assinatura ativada.'
            :'Aguardando confirmação.'}
        </h1>

        {error
          ?<p>{error}</p>
          :status==='ACTIVE'
            ?(
              <>
                <p>
                  Sua assinatura NEXUS está ativa.
                </p>
                <a href="/login" className="nxs-primary">
                  ACESSAR NEXUS
                </a>
              </>
            )
            :(
              <p>
                Assim que o pagamento for confirmado,
                esta tela será atualizada automaticamente.
              </p>
            )
        }
      </section>
    </main>
  );
}


/* NEXUS_COMMERCIAL_V2_RUNTIME */
function NexusCommercialV2Runtime(){
  if(typeof document!=='undefined'){
    document.body.classList.add('nexus-commercial-v2');
  }
  return null;
}
export function resolveSaasPublicPage(){
  const path=window.location.pathname
    .replace(/\/+$/,'')||'/';

  if(path==='/planos'){
    return <SaasPlansPage/>;
  }

  if(path==='/contratar'){
    return <SaasCheckoutPage/>;
  }

  if(path==='/contratacao'){
    return <SaasContractStatusPage/>;
  }

  return null;
}