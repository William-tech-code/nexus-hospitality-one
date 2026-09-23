import React,{
  useEffect,
  useMemo,
  useState
} from "react";

import {
  growthStatusV1,
  growthSaveOnboardingV1,
  growthAnalyzeV1,
  growthActivateV1,
  growthRecommendationStatusV1,
  growthMonitorRunV1
} from "./api.js";

import "./NexusGrowthIntelligenceV1.css";


const money=value=>
  Number(value||0).toLocaleString(
    "pt-BR",
    {
      style:"currency",
      currency:"BRL"
    }
  );

const number=value=>
  Number(value||0).toLocaleString(
    "pt-BR",
    {
      maximumFractionDigits:2
    }
  );

const percent=value=>
  `${number(value)}%`;


const EMPTY_OPERATION={
  business_segment:"BAR_RESTAURANTE",
  operation_model:"PRESENCIAL",
  opening_date:"",
  seats_capacity:"",
  operating_days_per_month:"26",
  operating_hours_per_day:"10",
  employees_count:""
};


const EMPTY_BASELINE={
  initial_investment:"",
  renovation_investment:"",
  equipment_investment:"",
  initial_inventory_investment:"",
  other_initial_investment:"",

  working_capital:"",
  available_cash:"",
  receivables:"",

  total_debt:"",
  monthly_debt_service:"",

  monthly_rent:"",
  monthly_payroll:"",
  monthly_utilities:"",
  monthly_marketing:"",
  monthly_other_fixed_costs:"",
  monthly_variable_costs:"",

  current_monthly_revenue:"",
  average_ticket:"",
  customers_per_month:"",

  gross_margin_percent:"",
  cmv_percent:"",

  owner_notes:""
};


const EMPTY_TARGET={
  target_type:"2X",
  target_revenue:"",
  target_date:""
};


const STEPS=[
  {
    id:1,
    label:"Negócio",
    caption:"Perfil operacional"
  },
  {
    id:2,
    label:"Investimento",
    caption:"Capital aplicado"
  },
  {
    id:3,
    label:"Liquidez",
    caption:"Caixa e dívidas"
  },
  {
    id:4,
    label:"Custos",
    caption:"Estrutura mensal"
  },
  {
    id:5,
    label:"Operação",
    caption:"Receita e clientes"
  },
  {
    id:6,
    label:"Objetivo",
    caption:"2X, 3X ou personalizado"
  },
  {
    id:7,
    label:"Diagnóstico",
    caption:"NEXUS Growth Intelligence"
  }
];


function numericObject(source){
  const result={...source};

  [
    "seats_capacity",
    "operating_days_per_month",
    "operating_hours_per_day",
    "employees_count",

    "initial_investment",
    "renovation_investment",
    "equipment_investment",
    "initial_inventory_investment",
    "other_initial_investment",

    "working_capital",
    "available_cash",
    "receivables",
    "total_debt",
    "monthly_debt_service",

    "monthly_rent",
    "monthly_payroll",
    "monthly_utilities",
    "monthly_marketing",
    "monthly_other_fixed_costs",
    "monthly_variable_costs",

    "current_monthly_revenue",
    "average_ticket",
    "customers_per_month",
    "gross_margin_percent",
    "cmv_percent"
  ].forEach(key=>{
    if(key in result){
      result[key]=
        result[key]===""
          ?0
          :Number(result[key]||0);
    }
  });

  return result;
}


function scoreLabel(score){
  const n=Number(score||0);

  if(n>=85)return "BASE MUITO FORTE";
  if(n>=70)return "BASE FORTE";
  if(n>=55)return "BASE MODERADA";
  if(n>=40)return "PONTOS DE ATENÇÃO";

  return "ESTRUTURA A REFORÇAR";
}


function viabilityLabel(value){
  const labels={
    VERY_HIGH:"Base muito favorável",
    HIGH:"Base favorável",
    MODERATE:"Cenário moderado",
    ATTENTION:"Exige preparação",
    CRITICAL:"Exige reestruturação"
  };

  return labels[value]||value||"Em análise";
}


function recommendationPriority(value){
  const labels={
    CRITICAL:"Prioridade crítica",
    HIGH:"Prioridade alta",
    MEDIUM:"Prioridade média",
    LOW:"Prioridade baixa"
  };

  return labels[value]||value;
}


function Field({
  label,
  value,
  onChange,
  type="number",
  prefix,
  suffix,
  placeholder,
  min,
  max,
  step="0.01"
}){
  return(
    <label className="ngx-field">
      <span>{label}</span>

      <div className="ngx-input-wrap">
        {prefix&&<i>{prefix}</i>}

        <input
          type={type}
          value={value??""}
          onChange={e=>onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          step={type==="number"?step:undefined}
        />

        {suffix&&<em>{suffix}</em>}
      </div>
    </label>
  );
}


function Choice({
  active,
  title,
  text,
  onClick
}){
  return(
    <button
      type="button"
      className={`ngx-choice ${active?"active":""}`}
      onClick={onClick}
    >
      <b>{title}</b>
      <span>{text}</span>
    </button>
  );
}


function StepHeader({
  eyebrow,
  title,
  text
}){
  return(
    <div className="ngx-step-head">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}


function Metric({
  label,
  value,
  note,
  accent=false
}){
  return(
    <div className={`ngx-metric ${accent?"accent":""}`}>
      <span>{label}</span>
      <b>{value}</b>
      {note&&<small>{note}</small>}
    </div>
  );
}


function ScoreRing({score}){
  const value=Math.max(
    0,
    Math.min(
      100,
      Number(score||0)
    )
  );

  return(
    <div
      className="ngx-score-ring"
      style={{"--growth-score":value}}
    >
      <div>
        <b>{Math.round(value)}</b>
        <span>GROWTH SCORE</span>
        <small>{scoreLabel(value)}</small>
      </div>
    </div>
  );
}


function Onboarding({
  initial,
  onActivated
}){
  const [step,setStep]=useState(1);

  const [operation,setOperation]=useState({
    ...EMPTY_OPERATION,
    ...(initial?.onboarding||{})
  });

  const [baseline,setBaseline]=useState({
    ...EMPTY_BASELINE
  });

  const [target,setTarget]=useState({
    ...EMPTY_TARGET
  });

  const [preview,setPreview]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");


  const totalInvestment=useMemo(
    ()=>[
      baseline.initial_investment,
      baseline.renovation_investment,
      baseline.equipment_investment,
      baseline.initial_inventory_investment,
      baseline.other_initial_investment
    ].reduce(
      (sum,value)=>
        sum+Number(value||0),
      0
    ),
    [baseline]
  );


  const monthlyStructure=useMemo(
    ()=>[
      baseline.monthly_rent,
      baseline.monthly_payroll,
      baseline.monthly_utilities,
      baseline.monthly_marketing,
      baseline.monthly_other_fixed_costs,
      baseline.monthly_variable_costs,
      baseline.monthly_debt_service
    ].reduce(
      (sum,value)=>
        sum+Number(value||0),
      0
    ),
    [baseline]
  );


  const targetPreview=useMemo(
    ()=>{
      const revenue=
        Number(
          baseline.current_monthly_revenue||0
        );

      if(target.target_type==="2X"){
        return revenue*2;
      }

      if(target.target_type==="3X"){
        return revenue*3;
      }

      return Number(
        target.target_revenue||0
      );
    },
    [
      baseline.current_monthly_revenue,
      target
    ]
  );


  function updateOperation(key,value){
    setOperation(current=>({
      ...current,
      [key]:value
    }));
  }


  function updateBaseline(key,value){
    setBaseline(current=>({
      ...current,
      [key]:value
    }));
  }


  async function persistOperation(nextStep){
    await growthSaveOnboardingV1({
      ...numericObject(operation),
      onboarding_status:"IN_PROGRESS",
      current_step:nextStep
    });
  }


  async function next(){
    setError("");

    try{
      setBusy(true);

      if(step===1){
        await persistOperation(2);
      }

      if(step<6){
        setStep(value=>value+1);
        return;
      }

      if(step===6){
        if(
          Number(
            baseline.current_monthly_revenue||0
          )<=0
        ){
          throw new Error(
            "Informe o faturamento mensal atual para gerar o diagnóstico."
          );
        }

        if(
          target.target_type==="CUSTOM" &&
          Number(target.target_revenue||0)<=
          Number(
            baseline.current_monthly_revenue||0
          )
        ){
          throw new Error(
            "A meta personalizada deve ser superior ao faturamento atual."
          );
        }

        const result=
          await growthAnalyzeV1({
            baseline:{
              ...numericObject(baseline),
              ...numericObject({
                seats_capacity:
                  operation.seats_capacity,

                operating_days_per_month:
                  operation.operating_days_per_month,

                employees_count:
                  operation.employees_count
              })
            },

            target:{
              ...target,
              target_revenue:
                target.target_type==="CUSTOM"
                  ?Number(
                      target.target_revenue||0
                    )
                  :0
            }
          });

        setPreview(result);
        setStep(7);
      }
    }
    catch(err){
      setError(
        err.message||
        "Não foi possível continuar."
      );
    }
    finally{
      setBusy(false);
    }
  }


  async function activate(){
    setError("");

    try{
      setBusy(true);

      await persistOperation(7);

      const result=
        await growthActivateV1({
          baseline:{
            ...numericObject(baseline),

            seats_capacity:
              Number(
                operation.seats_capacity||0
              ),

            operating_days_per_month:
              Number(
                operation.operating_days_per_month||0
              ),

            employees_count:
              Number(
                operation.employees_count||0
              )
          },

          target:{
            ...target,

            target_revenue:
              target.target_type==="CUSTOM"
                ?Number(
                    target.target_revenue||0
                  )
                :0
          }
        });

      // NEXUS_ACTIVATION_CALLBACK_V3
      await onActivated(result);
    }
    catch(err){
      setError(
        err.message||
        "Não foi possível ativar o plano de crescimento."
      );
    }
    finally{
      setBusy(false);
    }
  }


  return(
    <section className="ngx-onboarding">
      {/* NEXUS_FIRST_ACCESS_ONBOARDING_V3 */}
      <div className="ngx-first-access-v3">
        <div>
          <span>
            CONFIGURAÇÃO INICIAL
          </span>
          <b>
            Diagnóstico empresarial e Marco Zero
          </b>
        </div>

        <small>
          Seus dados financeiros permanecem
          vinculados à empresa autenticada.
        </small>
      </div>


      <div className="ngx-onboarding-top">
        <div>
          <span className="ngx-kicker">
            NEXUS GROWTH INTELLIGENCE
          </span>

          <h1>
            Vamos conhecer
            <br/>
            <em>o seu negócio.</em>
          </h1>

          <p>
            Antes de recomendar crescimento,
            o NEXUS cria o seu Marco Zero:
            estrutura financeira, operação,
            capacidade e objetivo.
          </p>
        </div>

        <div className="ngx-onboarding-badge">
          <span>CONFIGURAÇÃO</span>
          <b>{step}/7</b>
          <small>
            Diagnóstico empresarial
          </small>
        </div>
      </div>


      <div className="ngx-stepper">
        {STEPS.map(item=>(
          <div
            key={item.id}
            className={
              item.id===step
                ?"active"
                :item.id<step
                  ?"done"
                  :""
            }
          >
            <i>
              {item.id<step
                ?"✓"
                :item.id}
            </i>

            <span>
              <b>{item.label}</b>
              <small>{item.caption}</small>
            </span>
          </div>
        ))}
      </div>


      <div className="ngx-form-stage">

        {step===1&&(
          <>
            <StepHeader
              eyebrow="ETAPA 01 • OPERAÇÃO"
              title="Como o negócio funciona hoje?"
              text="Essas informações ajudam o NEXUS a interpretar capacidade, estrutura e ritmo operacional."
            />

            <div className="ngx-grid-2">
              <label className="ngx-field">
                <span>Segmento principal</span>

                <div className="ngx-input-wrap">
                  <select
                    value={operation.business_segment}
                    onChange={e=>
                      updateOperation(
                        "business_segment",
                        e.target.value
                      )
                    }
                  >
                    <option value="BAR_RESTAURANTE">
                      Bar / Restaurante
                    </option>
                    <option value="BAR">
                      Bar
                    </option>
                    <option value="RESTAURANTE">
                      Restaurante
                    </option>
                    <option value="LANCHONETE">
                      Lanchonete
                    </option>
                    <option value="CAFETERIA">
                      Cafeteria
                    </option>
                    <option value="EVENTOS">
                      Eventos
                    </option>
                    <option value="HOSPEDAGEM">
                      Hospedagem
                    </option>
                    <option value="OUTRO">
                      Outro
                    </option>
                  </select>
                </div>
              </label>

              <label className="ngx-field">
                <span>Modelo de operação</span>

                <div className="ngx-input-wrap">
                  <select
                    value={operation.operation_model}
                    onChange={e=>
                      updateOperation(
                        "operation_model",
                        e.target.value
                      )
                    }
                  >
                    <option value="PRESENCIAL">
                      Presencial
                    </option>
                    <option value="HIBRIDO">
                      Presencial + Delivery
                    </option>
                    <option value="DELIVERY">
                      Delivery
                    </option>
                    <option value="EVENTOS">
                      Eventos
                    </option>
                  </select>
                </div>
              </label>

              <Field
                label="Data de início da operação"
                type="date"
                value={operation.opening_date}
                onChange={v=>
                  updateOperation(
                    "opening_date",
                    v
                  )
                }
              />

              <Field
                label="Capacidade de clientes"
                value={operation.seats_capacity}
                onChange={v=>
                  updateOperation(
                    "seats_capacity",
                    v
                  )
                }
                suffix="pessoas"
              />

              <Field
                label="Dias de funcionamento por mês"
                value={
                  operation.operating_days_per_month
                }
                onChange={v=>
                  updateOperation(
                    "operating_days_per_month",
                    v
                  )
                }
                suffix="dias"
              />

              <Field
                label="Horas de operação por dia"
                value={
                  operation.operating_hours_per_day
                }
                onChange={v=>
                  updateOperation(
                    "operating_hours_per_day",
                    v
                  )
                }
                suffix="horas"
              />

              <Field
                label="Quantidade de colaboradores"
                value={operation.employees_count}
                onChange={v=>
                  updateOperation(
                    "employees_count",
                    v
                  )
                }
                suffix="pessoas"
              />
            </div>
          </>
        )}


        {step===2&&(
          <>
            <StepHeader
              eyebrow="ETAPA 02 • CAPITAL INVESTIDO"
              title="Quanto foi necessário para colocar o negócio de pé?"
              text="Vamos separar investimento inicial, estrutura, equipamentos e estoque para construir uma leitura real do capital aplicado."
            />

            <div className="ngx-grid-2">
              <Field
                label="Investimento inicial"
                prefix="R$"
                value={baseline.initial_investment}
                onChange={v=>
                  updateBaseline(
                    "initial_investment",
                    v
                  )
                }
              />

              <Field
                label="Reformas e estrutura"
                prefix="R$"
                value={baseline.renovation_investment}
                onChange={v=>
                  updateBaseline(
                    "renovation_investment",
                    v
                  )
                }
              />

              <Field
                label="Equipamentos"
                prefix="R$"
                value={baseline.equipment_investment}
                onChange={v=>
                  updateBaseline(
                    "equipment_investment",
                    v
                  )
                }
              />

              <Field
                label="Estoque inicial"
                prefix="R$"
                value={
                  baseline.initial_inventory_investment
                }
                onChange={v=>
                  updateBaseline(
                    "initial_inventory_investment",
                    v
                  )
                }
              />

              <Field
                label="Outros investimentos"
                prefix="R$"
                value={
                  baseline.other_initial_investment
                }
                onChange={v=>
                  updateBaseline(
                    "other_initial_investment",
                    v
                  )
                }
              />
            </div>

            <div className="ngx-live-total">
              <span>
                CAPITAL INICIAL MAPEADO
              </span>
              <b>{money(totalInvestment)}</b>
              <small>
                Base informada pelo proprietário
              </small>
            </div>
          </>
        )}


        {step===3&&(
          <>
            <StepHeader
              eyebrow="ETAPA 03 • LIQUIDEZ"
              title="Qual é a força financeira disponível hoje?"
              text="Capital de giro e dívida determinam quanto espaço existe para crescer sem pressionar excessivamente o caixa."
            />

            <div className="ngx-grid-2">
              <Field
                label="Capital de giro"
                prefix="R$"
                value={baseline.working_capital}
                onChange={v=>
                  updateBaseline(
                    "working_capital",
                    v
                  )
                }
              />

              <Field
                label="Dinheiro disponível em caixa"
                prefix="R$"
                value={baseline.available_cash}
                onChange={v=>
                  updateBaseline(
                    "available_cash",
                    v
                  )
                }
              />

              <Field
                label="Valores a receber"
                prefix="R$"
                value={baseline.receivables}
                onChange={v=>
                  updateBaseline(
                    "receivables",
                    v
                  )
                }
              />

              <Field
                label="Dívidas / financiamentos atuais"
                prefix="R$"
                value={baseline.total_debt}
                onChange={v=>
                  updateBaseline(
                    "total_debt",
                    v
                  )
                }
              />

              <Field
                label="Parcelas mensais das dívidas"
                prefix="R$"
                value={
                  baseline.monthly_debt_service
                }
                onChange={v=>
                  updateBaseline(
                    "monthly_debt_service",
                    v
                  )
                }
              />
            </div>
          </>
        )}


        {step===4&&(
          <>
            <StepHeader
              eyebrow="ETAPA 04 • ESTRUTURA DE CUSTOS"
              title="Quanto custa manter a operação funcionando?"
              text="O ponto de equilíbrio depende da estrutura mensal. Informe valores médios; eles poderão ser refinados depois com os dados reais do sistema."
            />

            <div className="ngx-grid-2">
              <Field
                label="Aluguel"
                prefix="R$"
                value={baseline.monthly_rent}
                onChange={v=>
                  updateBaseline(
                    "monthly_rent",
                    v
                  )
                }
              />

              <Field
                label="Folha / equipe"
                prefix="R$"
                value={baseline.monthly_payroll}
                onChange={v=>
                  updateBaseline(
                    "monthly_payroll",
                    v
                  )
                }
              />

              <Field
                label="Água, energia, internet etc."
                prefix="R$"
                value={baseline.monthly_utilities}
                onChange={v=>
                  updateBaseline(
                    "monthly_utilities",
                    v
                  )
                }
              />

              <Field
                label="Marketing"
                prefix="R$"
                value={baseline.monthly_marketing}
                onChange={v=>
                  updateBaseline(
                    "monthly_marketing",
                    v
                  )
                }
              />

              <Field
                label="Outros custos fixos"
                prefix="R$"
                value={
                  baseline.monthly_other_fixed_costs
                }
                onChange={v=>
                  updateBaseline(
                    "monthly_other_fixed_costs",
                    v
                  )
                }
              />

              <Field
                label="Custos variáveis mensais"
                prefix="R$"
                value={
                  baseline.monthly_variable_costs
                }
                onChange={v=>
                  updateBaseline(
                    "monthly_variable_costs",
                    v
                  )
                }
              />
            </div>

            <div className="ngx-live-total">
              <span>
                ESTRUTURA MENSAL INFORMADA
              </span>
              <b>{money(monthlyStructure)}</b>
              <small>
                Inclui a parcela mensal das dívidas
              </small>
            </div>
          </>
        )}


        {step===5&&(
          <>
            <StepHeader
              eyebrow="ETAPA 05 • DESEMPENHO ATUAL"
              title="Onde o negócio está agora?"
              text="Este será o ponto de partida para o Marco Zero. Depois, o NEXUS poderá comparar a evolução com os dados reais da operação."
            />

            <div className="ngx-grid-2">
              <Field
                label="Faturamento mensal atual"
                prefix="R$"
                value={
                  baseline.current_monthly_revenue
                }
                onChange={v=>
                  updateBaseline(
                    "current_monthly_revenue",
                    v
                  )
                }
              />

              <Field
                label="Ticket médio"
                prefix="R$"
                value={baseline.average_ticket}
                onChange={v=>
                  updateBaseline(
                    "average_ticket",
                    v
                  )
                }
              />

              <Field
                label="Clientes por mês"
                value={
                  baseline.customers_per_month
                }
                onChange={v=>
                  updateBaseline(
                    "customers_per_month",
                    v
                  )
                }
                suffix="clientes"
              />

              <Field
                label="Margem bruta estimada"
                value={
                  baseline.gross_margin_percent
                }
                onChange={v=>
                  updateBaseline(
                    "gross_margin_percent",
                    v
                  )
                }
                suffix="%"
                min="0"
                max="100"
              />

              <Field
                label="CMV estimado"
                value={baseline.cmv_percent}
                onChange={v=>
                  updateBaseline(
                    "cmv_percent",
                    v
                  )
                }
                suffix="%"
                min="0"
                max="100"
              />
            </div>

            <label className="ngx-field ngx-full">
              <span>
                Observações do proprietário
              </span>

              <textarea
                value={baseline.owner_notes}
                onChange={e=>
                  updateBaseline(
                    "owner_notes",
                    e.target.value
                  )
                }
                placeholder="Ex.: movimento maior aos finais de semana, intenção de ampliar eventos, dificuldade com estoque..."
              />
            </label>
          </>
        )}


        {step===6&&(
          <>
            <StepHeader
              eyebrow="ETAPA 06 • OBJETIVO"
              title="Onde você quer levar o negócio?"
              text="O NEXUS transforma o objetivo em distância financeira e cenários. Não é promessa de resultado: é planejamento condicionado aos dados informados."
            />

            <div className="ngx-target-options">
              <Choice
                active={
                  target.target_type==="2X"
                }
                title="2X"
                text="Dobrar o faturamento mensal"
                onClick={()=>
                  setTarget(current=>({
                    ...current,
                    target_type:"2X"
                  }))
                }
              />

              <Choice
                active={
                  target.target_type==="3X"
                }
                title="3X"
                text="Triplicar o faturamento mensal"
                onClick={()=>
                  setTarget(current=>({
                    ...current,
                    target_type:"3X"
                  }))
                }
              />

              <Choice
                active={
                  target.target_type==="CUSTOM"
                }
                title="META PRÓPRIA"
                text="Definir faturamento desejado"
                onClick={()=>
                  setTarget(current=>({
                    ...current,
                    target_type:"CUSTOM"
                  }))
                }
              />
            </div>

            {target.target_type==="CUSTOM"&&(
              <div className="ngx-custom-target">
                <Field
                  label="Faturamento mensal desejado"
                  prefix="R$"
                  value={target.target_revenue}
                  onChange={v=>
                    setTarget(current=>({
                      ...current,
                      target_revenue:v
                    }))
                  }
                />
              </div>
            )}

            <Field
              label="Data desejada para a meta"
              type="date"
              value={target.target_date}
              onChange={v=>
                setTarget(current=>({
                  ...current,
                  target_date:v
                }))
              }
            />

            <div className="ngx-target-preview">
              <span>FATURAMENTO ATUAL</span>
              <b>
                {money(
                  baseline.current_monthly_revenue
                )}
              </b>

              <i>→</i>

              <span>OBJETIVO</span>
              <strong>
                {money(targetPreview)}
              </strong>
            </div>
          </>
        )}


        {step===7&&preview&&(
          <Preview
            preview={preview}
            baseline={baseline}
            onActivate={activate}
            busy={busy}
          />
        )}


        {error&&(
          <div className="ngx-error">
            <b>Não foi possível continuar.</b>
            <span>{error}</span>
          </div>
        )}


        {step<7&&(
          <div className="ngx-actions">
            <button
              type="button"
              className="ngx-secondary"
              disabled={step===1||busy}
              onClick={()=>
                setStep(value=>
                  Math.max(1,value-1)
                )
              }
            >
              ← Voltar
            </button>

            <button
              type="button"
              className="ngx-primary"
              disabled={busy}
              onClick={next}
            >
              {busy
                ?"PROCESSANDO..."
                :step===6
                  ?"GERAR MEU DIAGNÓSTICO →"
                  :"CONTINUAR →"}
            </button>
          </div>
        )}

      </div>

      <div className="ngx-disclaimer">
        <b>INTELIGÊNCIA COM PREMISSAS TRANSPARENTES</b>

        <span>
          Projeções e cenários não constituem
          garantia de faturamento, lucro ou
          crescimento futuro.
        </span>
      </div>

    </section>
  );
}


function Preview({
  preview,
  baseline,
  onActivate,
  busy
}){
  const a=preview.assessment||{};
  const target=preview.target||{};

  return(
    <div className="ngx-preview">

      <div className="ngx-result-hero">
        <div>
          <span className="ngx-kicker">
            DIAGNÓSTICO CONCLUÍDO
          </span>

          <h2>
            Seu Marco Zero
            <br/>
            <em>está pronto.</em>
          </h2>

          <p>
            O NEXUS analisou a estrutura
            informada e construiu o ponto
            inicial do plano de crescimento.
          </p>

          <div className="ngx-viability">
            {viabilityLabel(
              a.viability_level
            )}
          </div>
        </div>

        <ScoreRing
          score={a.growth_score}
        />
      </div>


      <div className="ngx-metrics">
        <Metric
          label="Faturamento atual"
          value={money(
            baseline.current_monthly_revenue
          )}
        />

        <Metric
          label="Objetivo"
          value={money(
            target.target_revenue
          )}
          accent
        />

        <Metric
          label="Distância para a meta"
          value={money(
            a.revenue_gap
          )}
          note={
            `${percent(
              a.required_growth_percent
            )} de crescimento requerido`
          }
        />

        <Metric
          label="Ponto de equilíbrio"
          value={money(
            a.break_even_revenue
          )}
        />

        <Metric
          label="Reserva operacional"
          value={
            `${number(
              a.working_capital_months
            )} meses`
          }
        />

        <Metric
          label="Capital investido"
          value={money(
            a.total_investment
          )}
        />
      </div>


      <div className="ngx-preview-scenarios">
        <h3>
          Três caminhos para acompanhar
          sua evolução
        </h3>

        <div className="ngx-scenario-grid">
          {(preview.scenarios||[])
            .map(item=>(
              <div
                className="ngx-scenario"
                key={item.scenario_type}
              >
                <span>
                  {item.scenario_type==="CONSERVATIVE"
                    ?"CONSERVADOR"
                    :item.scenario_type==="BASE"
                      ?"BASE"
                      :"EXPANSÃO"}
                </span>

                <b>
                  {money(
                    item.projected_revenue
                  )}
                </b>

                <small>
                  receita mensal de cenário
                </small>

                <dl>
                  <div>
                    <dt>Ticket</dt>
                    <dd>
                      {money(
                        item.projected_ticket
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Clientes</dt>
                    <dd>
                      {number(
                        item.projected_customers
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Resultado estimado
                    </dt>
                    <dd>
                      {money(
                        item.projected_monthly_profit
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
        </div>
      </div>


      <div className="ngx-activate-box">
        <div>
          <span>
            NEXUS GROWTH OPERATING SYSTEM
          </span>

          <h3>
            Transformar diagnóstico
            em plano ativo?
          </h3>

          <p>
            Ao ativar, este diagnóstico
            será registrado como Marco Zero
            e passará a ser a referência
            para acompanhamento da evolução.
          </p>
        </div>

        <button
          type="button"
          className="ngx-primary"
          disabled={busy}
          onClick={onActivate}
        >
          {busy
            ?"ATIVANDO..."
            :"ATIVAR MEU PLANO DE CRESCIMENTO →"}
        </button>
      </div>

    </div>
  );
}


function GrowthDashboard({
  data,
  onRefresh,
  monitor,
  monitorLoading,
  monitorError,
  onMonitorRefresh,
  firstAccessMode
}){
  // NEXUS_MONITOR_DASHBOARD_V3
  const {
    baseline,
    target,
    assessment,
    scenarios=[],
    recommendations=[],
    snapshots=[]
  }=data||{};

  const [updating,setUpdating]=useState(null);
  const [error,setError]=useState("");


  const progress=useMemo(()=>{
    const current=
      Number(
        baseline?.current_monthly_revenue||0
      );

    const objective=
      Number(
        target?.target_revenue||0
      );

    if(objective<=0)return 0;

    return Math.max(
      0,
      Math.min(
        100,
        current/objective*100
      )
    );
  },[baseline,target]);


  async function updateRecommendation(
    id,
    status
  ){
    try{
      setUpdating(id);
      setError("");

      await growthRecommendationStatusV1(
        id,
        status
      );

      await onRefresh();
    }
    catch(err){
      setError(err.message);
    }
    finally{
      setUpdating(null);
    }
  }



  // NEXUS_MONITOR_MODEL_V3
  const monitorStatus=
    monitor?.monitor||
    monitor?.status||
    monitor||
    {};

  const monitorCreated=
    Array.isArray(monitor?.created)
      ?monitor.created
      :[];

  const monitorPeriods=[
    {
      key:"30_DAYS",
      title:"30 dias",
      description:"Primeira comparação"
    },
    {
      key:"60_DAYS",
      title:"60 dias",
      description:"Evolução operacional"
    },
    {
      key:"90_DAYS",
      title:"90 dias",
      description:"Revisão estratégica"
    }
  ];

  function monitorPeriodReady(key){
    if(
      monitorCreated.some(item=>
        typeof item==="string"
          ?item===key
          :(
              item?.period_label===key||
              item?.period===key
            )
      )
    ){
      return true;
    }

    if(
      monitorStatus?.periods &&
      monitorStatus.periods[key]
    ){
      return true;
    }

    if(
      Array.isArray(monitorStatus?.snapshots) &&
      monitorStatus.snapshots.some(
        item=>item?.period_label===key
      )
    ){
      return true;
    }

    return false;
  }

  const monitorPanel=(
    <div className="ngx-monitor-v3">

      <div className="ngx-monitor-v3-head">
        <div>
          <span>
            NEXUS GROWTH MONITOR
          </span>

          <h3>
            Evolução 30 • 60 • 90
          </h3>

          <p>
            O sistema compara a operação atual
            com o Marco Zero e registra os
            checkpoints de crescimento.
          </p>
        </div>

        <button
          type="button"
          onClick={onMonitorRefresh}
          disabled={monitorLoading}
        >
          {monitorLoading
            ?"ATUALIZANDO..."
            :"ATUALIZAR ACOMPANHAMENTO"}
        </button>
      </div>

      {monitorError&&(
        <div className="ngx-monitor-v3-error">
          {monitorError}
        </div>
      )}

      <div className="ngx-monitor-v3-grid">
        {monitorPeriods.map(period=>{
          const ready=
            monitorPeriodReady(period.key);

          return(
            <div
              key={period.key}
              className={
                ready
                  ?"ngx-monitor-v3-card ready"
                  :"ngx-monitor-v3-card"
              }
            >
              <i/>

              <span>
                {period.title}
              </span>

              <b>
                {ready
                  ?"CHECKPOINT REGISTRADO"
                  :"ACOMPANHAMENTO PROGRAMADO"}
              </b>

              <small>
                {period.description}
              </small>
            </div>
          );
        })}
      </div>

      <div className="ngx-monitor-v3-footer">

        <span>
          <b>Marco Zero</b>
          {" "}
          {monitorStatus?.marco_zero
            ?"ativo"
            :"registrado"}
        </span>

        {Number.isFinite(
          Number(monitorStatus?.age_days)
        )&&(
          <span>
            <b>Ciclo atual</b>
            {" "}
            {Number(
              monitorStatus.age_days
            )} dias
          </span>
        )}

        {firstAccessMode&&(
          <span>
            <b>Primeiro acesso</b>
            {" "}
            concluído
          </span>
        )}

      </div>

    </div>
  );
  return(
    <section className="ngx-dashboard">

      <div className="ngx-dashboard-hero">
        <div className="ngx-dashboard-copy">
          <span className="ngx-kicker">
            NEXUS GROWTH COMMAND CENTER
          </span>

          <h1>
            Seu caminho para
            <br/>
            <em>
              {target?.target_type==="2X"
                ?"2X"
                :target?.target_type==="3X"
                  ?"3X"
                  :"a sua meta"}
            </em>
          </h1>

          <p>
            Marco Zero ativo.
            O NEXUS transforma números
            financeiros e operacionais
            em prioridades mensuráveis.
          </p>

          <div className="ngx-status-row">
            <span>
              <i/>
              MARCO ZERO ATIVO
            </span>

            <span>
              MONITORAMENTO CONTÍNUO
            </span>

            <span>
              TENANT PROTECTED
            </span>
          </div>
        </div>

        <ScoreRing
          score={assessment?.growth_score}
        />
      </div>


      <div className="ngx-path">
        <div className="ngx-path-head">
          <div>
            <span>
              PROGRESSO PARA O OBJETIVO
            </span>

            <b>
              {money(
                baseline?.current_monthly_revenue
              )}
            </b>

            <small>
              de {money(
                target?.target_revenue
              )}
            </small>
          </div>

          <strong>
            {Math.round(progress)}%
          </strong>
        </div>

        <div className="ngx-progress">
          <i
            style={{
              width:`${progress}%`
            }}
          />
        </div>

        <div className="ngx-path-foot">
          <span>
            Gap atual:
            <b>
              {" "}
              {money(
                assessment?.revenue_gap
              )}
            </b>
          </span>

          <span>
            Crescimento requerido:
            <b>
              {" "}
              {percent(
                assessment
                  ?.required_growth_percent
              )}
            </b>
          </span>
        </div>
      </div>


      <div className="ngx-metrics ngx-dashboard-metrics">
        <Metric
          label="Growth Score"
          value={
            Math.round(
              Number(
                assessment?.growth_score||0
              )
            )
          }
          note={scoreLabel(
            assessment?.growth_score
          )}
          accent
        />

        <Metric
          label="Ponto de equilíbrio"
          value={money(
            assessment?.break_even_revenue
          )}
        />

        <Metric
          label="Capital de giro"
          value={
            `${number(
              assessment
                ?.working_capital_months
            )} meses`
          }
        />

        <Metric
          label="Resultado operacional"
          value={money(
            JSON.parse(
              assessment
                ?.explanation_json||
              "{}"
            ).estimated_operating_result
          )}
        />
      </div>


      <div className="ngx-dashboard-grid">

        <div className="ngx-panel ngx-score-panel">
          <div className="ngx-panel-title">
            <span>
              DIAGNÓSTICO ESTRUTURAL
            </span>
            <h3>
              O que sustenta o Growth Score
            </h3>
          </div>

          {[
            [
              "Liquidez",
              assessment?.liquidity_score
            ],
            [
              "Dívidas",
              assessment?.debt_score
            ],
            [
              "Margem",
              assessment?.margin_score
            ],
            [
              "Ponto de equilíbrio",
              assessment?.break_even_score
            ],
            [
              "Capital de giro",
              assessment?.working_capital_score
            ],
            [
              "Resultado",
              assessment?.revenue_score
            ],
            [
              "Operação",
              assessment?.operational_score
            ],
            [
              "Estoque",
              assessment?.inventory_score
            ]
          ].map(([label,value])=>(
            <div
              className="ngx-score-row"
              key={label}
            >
              <span>{label}</span>

              <div>
                <i
                  style={{
                    width:
                      `${Math.max(
                        0,
                        Math.min(
                          100,
                          Number(value||0)
                        )
                      )}%`
                  }}
                />
              </div>

              <b>
                {Math.round(
                  Number(value||0)
                )}
              </b>
            </div>
          ))}
        </div>


        <div className="ngx-panel">
          <div className="ngx-panel-title">
            <span>
              LEITURA NEXUS
            </span>
            <h3>
              Situação atual
            </h3>
          </div>

          <div className="ngx-health-card">
            <span>
              VIABILIDADE DO CENÁRIO
            </span>

            <b>
              {viabilityLabel(
                assessment?.viability_level
              )}
            </b>

            <p>
              Essa classificação representa
              a estrutura atual utilizada
              para os cenários, e não uma
              probabilidade de sucesso.
            </p>
          </div>

          <div className="ngx-financial-list">
            <div>
              <span>Faturamento base</span>
              <b>
                {money(
                  baseline
                    ?.current_monthly_revenue
                )}
              </b>
            </div>

            <div>
              <span>Ticket médio</span>
              <b>
                {money(
                  baseline?.average_ticket
                )}
              </b>
            </div>

            <div>
              <span>Clientes/mês</span>
              <b>
                {number(
                  baseline
                    ?.customers_per_month
                )}
              </b>
            </div>

            <div>
              <span>Dívida total</span>
              <b>
                {money(
                  baseline?.total_debt
                )}
              </b>
            </div>

            <div>
              <span>Capital de giro</span>
              <b>
                {money(
                  baseline?.working_capital
                )}
              </b>
            </div>
          </div>
        </div>

      </div>


      <div className="ngx-section-title">
        <span>
          CENÁRIOS DE CRESCIMENTO
        </span>

        <h2>
          Crescer não depende de
          uma única variável.
        </h2>

        <p>
          Os cenários combinam evolução
          de receita, ticket e volume.
          São referências condicionais,
          não previsões garantidas.
        </p>
      </div>


      <div className="ngx-scenario-grid">
        {scenarios.map(item=>(
          <div
            className="ngx-scenario"
            key={item.id}
          >
            <span>
              {item.scenario_type==="CONSERVATIVE"
                ?"CONSERVADOR"
                :item.scenario_type==="BASE"
                  ?"BASE"
                  :"EXPANSÃO"}
            </span>

            <b>
              {money(
                item.projected_revenue
              )}
            </b>

            <small>
              faturamento de cenário
            </small>

            <dl>
              <div>
                <dt>Ticket</dt>
                <dd>
                  {money(
                    item.projected_ticket
                  )}
                </dd>
              </div>

              <div>
                <dt>Clientes</dt>
                <dd>
                  {number(
                    item.projected_customers
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Resultado estimado
                </dt>
                <dd>
                  {money(
                    item.projected_monthly_profit
                  )}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>


      <div className="ngx-section-title">
        <span>
          PLANO DE AÇÃO
        </span>

        <h2>
          O que merece atenção agora.
        </h2>
      </div>


      {error&&(
        <div className="ngx-error">
          {error}
        </div>
      )}


      <div className="ngx-actions-list">
        {recommendations.length
          ?recommendations.map(
            (item,index)=>(
              <article
                className={
                  `ngx-action-card priority-${String(
                    item.priority||""
                  ).toLowerCase()}`
                }
                key={item.id}
              >
                <div className="ngx-action-number">
                  {String(index+1)
                    .padStart(2,"0")}
                </div>

                <div className="ngx-action-content">
                  <div className="ngx-action-meta">
                    <span>
                      {recommendationPriority(
                        item.priority
                      )}
                    </span>

                    <small>
                      {item.category}
                    </small>
                  </div>

                  <h3>{item.title}</h3>
                  <p>{item.description}</p>

                  <div className="ngx-rationale">
                    <b>Por quê?</b>
                    <span>
                      {item.rationale}
                    </span>
                  </div>

                  <small className="ngx-impact">
                    Impacto esperado:
                    {" "}
                    {item.expected_impact}
                  </small>
                </div>

                <div className="ngx-action-control">
                  <span
                    className={
                      `status-${String(
                        item.status
                      ).toLowerCase()}`
                    }
                  >
                    {item.status}
                  </span>

                  {item.status!=="COMPLETED"&&(
                    <button
                      type="button"
                      disabled={
                        updating===item.id
                      }
                      onClick={()=>
                        updateRecommendation(
                          item.id,
                          item.status==="OPEN"
                            ?"IN_PROGRESS"
                            :"COMPLETED"
                        )
                      }
                    >
                      {updating===item.id
                        ?"SALVANDO..."
                        :item.status==="OPEN"
                          ?"INICIAR"
                          :"CONCLUIR"}
                    </button>
                  )}
                </div>
              </article>
            )
          )
          :(
            <div className="ngx-empty">
              Nenhuma recomendação pendente.
            </div>
          )}
      </div>


      {/* NEXUS_MONITOR_PANEL_RENDER_V3 */}
      {monitorPanel}

      <div className="ngx-baseline">
        <div>
          <span>
            MARCO ZERO
          </span>

          <h3>
            A referência para medir
            sua evolução.
          </h3>

          <p>
            O NEXUS preserva o ponto
            inicial para que os próximos
            ciclos possam comparar
            faturamento, ticket, margem,
            caixa, dívida e Growth Score.
          </p>
        </div>

        <div className="ngx-baseline-timeline">
          <span className="active">
            <i/>
            <b>Agora</b>
            <small>Marco Zero</small>
          </span>

          <span>
            <i/>
            <b>30 dias</b>
            <small>Comparação</small>
          </span>

          <span>
            <i/>
            <b>60 dias</b>
            <small>Evolução</small>
          </span>

          <span>
            <i/>
            <b>90 dias</b>
            <small>Revisão</small>
          </span>
        </div>
      </div>


      {snapshots.length>0&&(
        <div className="ngx-panel">
          <div className="ngx-panel-title">
            <span>
              HISTÓRICO
            </span>

            <h3>
              Snapshots de crescimento
            </h3>
          </div>

          <div className="ngx-snapshot-list">
            {snapshots.map(item=>(
              <div key={item.id}>
                <span>
                  {item.period_label}
                </span>

                <b>
                  {money(item.revenue)}
                </b>

                <small>
                  Score {Math.round(
                    Number(
                      item.growth_score||0
                    )
                  )}
                </small>
              </div>
            ))}
          </div>
        </div>
      )}


      <div className="ngx-methodology">
        <b>
          NEXUS GROWTH SCORE V1
        </b>

        <span>
          Diagnóstico determinístico
          baseado nos dados informados
          e registrados na operação.
          Os cenários não representam
          garantia de faturamento,
          lucro ou crescimento.
        </span>
      </div>

    </section>
  );
}


export default function NexusGrowthIntelligenceV1({
  firstAccessMode=false,
  onCompleted=null
}){
  // NEXUS_GROWTH_FRONTEND_INTEGRATION_V3
  const [status,setStatus]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  // NEXUS_MONITOR_STATE_V3
  const [nexusMonitor,setNexusMonitor]=useState(null);
  const [nexusMonitorLoading,setNexusMonitorLoading]=useState(false);
  const [nexusMonitorError,setNexusMonitorError]=useState("");

  async function loadMonitor(){
    try{
      setNexusMonitorLoading(true);
      setNexusMonitorError("");

      const result=
        await growthMonitorRunV1();

      setNexusMonitor(result||null);

      return result;
    }
    catch(err){
      setNexusMonitorError(
        err?.message||
        "Não foi possível atualizar o acompanhamento 30/60/90."
      );

      return null;
    }
    finally{
      setNexusMonitorLoading(false);
    }
  }

  // NEXUS_FIRST_ACCESS_COMPLETION_V3
  async function handleActivated(result){
    setStatus(result);

    if(typeof onCompleted==="function"){
      await onCompleted();
    }

    try{
      await loadMonitor();
    }
    catch{
      // O Marco Zero permanece ativado mesmo se
      // o painel de monitoramento não puder atualizar.
    }
  }



  async function load(){
    try{
      setLoading(true);
      setError("");

      const result=
        await growthStatusV1();

      setStatus(result);
    }
    catch(err){
      setError(
        err.message||
        "Não foi possível carregar o Growth Intelligence."
      );
    }
    finally{
      setLoading(false);
    }
  }


  useEffect(()=>{
    load();
  },[]);


  if(loading){
    return(
      <section className="ngx-loading">
        <div className="ngx-loader-orb">
          N
        </div>

        <span>
          NEXUS GROWTH INTELLIGENCE
        </span>

        <b>
          Construindo visão estratégica...
        </b>
      </section>
    );
  }


  if(error){
    return(
      <section className="ngx-shell-error">
        <span>
          GROWTH INTELLIGENCE
        </span>

        <h2>
          Não foi possível carregar
          o módulo.
        </h2>

        <p>{error}</p>

        <button
          className="ngx-primary"
          onClick={load}
        >
          TENTAR NOVAMENTE
        </button>
      </section>
    );
  }


  if(
    !status?.assessment ||
    status?.onboarding
      ?.onboarding_status!=="COMPLETED"
  ){
    return(
      <Onboarding
        initial={status}
        onActivated={handleActivated}
      />
    );
  }


  return(
    <GrowthDashboard
      data={status}
      onRefresh={load}
      monitor={nexusMonitor}
      monitorLoading={nexusMonitorLoading}
      monitorError={nexusMonitorError}
      onMonitorRefresh={loadMonitor}
      firstAccessMode={firstAccessMode}
    />
  );
}