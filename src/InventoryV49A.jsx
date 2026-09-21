import React,{useEffect,useMemo,useState}from "react";
import {api} from "./api.js";
import "./InventoryV49A.css";

const money=v=>Number(v||0).toLocaleString(
  "pt-BR",
  {style:"currency",currency:"BRL"}
);

const num=v=>Number(v||0).toLocaleString(
  "pt-BR",
  {maximumFractionDigits:2}
);

const dateBR=v=>{
  if(!v)return "-";
  const s=String(v).slice(0,10).split("-");
  return s.length===3?`${s[2]}/${s[1]}/${s[0]}`:v;
};

const statusText={
  EXPIRED:"VENCIDO",
  TODAY:"VENCE HOJE",
  CRITICAL:"MUITO URGENTE",
  URGENT:"URGENTE",
  ALERT:"ALERTA",
  ATTENTION:"ATENCAO",
  NORMAL:"NORMAL",
  NO_EXPIRY:"SEM VALIDADE"
};

export default function InventoryV49A({onDone=()=>{}}){
  const[data,setData]=useState(null);
  const[selected,setSelected]=useState(null);
  const[detail,setDetail]=useState(null);
  const[action,setAction]=useState(null);
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState("");
  const[search,setSearch]=useState("");
  const[alertsOpen,setAlertsOpen]=useState(false);

  async function load(){
    try{
      setErr("");
      const x=await api.inventoryV49Summary();
      setData(x);

      if(selected){
        const d=await api.inventoryV49Product(selected);
        setDetail(d);
      }
    }
    catch(e){
      setErr(e.message||"Erro ao carregar estoque.");
    }
  }

  useEffect(()=>{
    load();
    const t=setInterval(load,60000);
    return()=>clearInterval(t);
  },[selected]);

  async function openProduct(id){
    try{
      setSelected(id);
      setDetail(await api.inventoryV49Product(id));
    }
    catch(e){
      setErr(e.message);
    }
  }

  async function submit(kind,form){
    if(!selected)return;

    try{
      setBusy(true);
      setErr("");

      if(kind==="entry")
        await api.inventoryV49Entry(selected,form);

      if(kind==="exit")
        await api.inventoryV49Exit(selected,form);

      if(kind==="loss")
        await api.inventoryV49Loss(selected,form);

      if(kind==="count")
        await api.inventoryV49Count(selected,form);

      setAction(null);
      await load();
      await onDone();
    }
    catch(e){
      setErr(e.message||"Operacao nao concluida.");
    }
    finally{
      setBusy(false);
    }
  }

  const products=useMemo(()=>{
    const q=search.trim().toLowerCase();
    const rows=data?.products||[];
    if(!q)return rows;

    return rows.filter(p=>
      `${p.name} ${p.category}`.toLowerCase().includes(q)
    );
  },[data,search]);

  const alerts=data?.alerts||[];
  const urgent=alerts.filter(a=>
    ["EXPIRED","TODAY","CRITICAL","URGENT"]
      .includes(a.expiry_status)
  );

  return(
    <section className="nx49">
      <div className="nx49-hero">
        <div>
          <small>NEXUS INVENTORY INTELLIGENCE V4.9A</small>
          <h2>Estoque & Validades</h2>
          <p>
            Controle operacional, lotes, perdas,
            auditoria e vencimentos automaticos.
          </p>
        </div>

        <button
          className={`nx49-bell ${urgent.length?"hot":""}`}
          onClick={()=>setAlertsOpen(!alertsOpen)}
        >
          <span className="bell">ALERTAS</span>
          <b>{urgent.length}</b>
        </button>
      </div>

      {err&&(
        <div className="nx49-error">
          {err}
        </div>
      )}

      <div className="nx49-kpis">
        <Kpi
          label="Produtos"
          value={data?.metrics?.products||0}
        />
        <Kpi
          label="Estoque critico"
          value={data?.metrics?.critical_stock||0}
          hot
        />
        <Kpi
          label="Lotes vencidos"
          value={data?.metrics?.expired||0}
          hot
        />
        <Kpi
          label="Alertas urgentes"
          value={data?.metrics?.urgent||0}
          hot
        />
        <Kpi
          label="Valor em risco"
          value={money(data?.metrics?.value_at_risk)}
        />
        <Kpi
          label="Perdas 30 dias"
          value={money(data?.metrics?.loss_30d_value)}
        />
      </div>

      {alertsOpen&&(
        <div className="nx49-alert-center">
          <div className="nx49-section-title">
            <div>
              <small>CENTRAL DE ALERTAS</small>
              <h3>Validade automatica em dias</h3>
            </div>
            <button onClick={()=>setAlertsOpen(false)}>
              Fechar
            </button>
          </div>

          {!alerts.length&&(
            <div className="nx49-empty">
              Nenhum lote dentro da janela de 30 dias.
            </div>
          )}

          <div className="nx49-alert-list">
            {alerts.map(a=>(
              <button
                key={a.alert_key}
                className={`nx49-alert ${a.expiry_status}`}
                onClick={()=>{
                  openProduct(a.product_id);
                  setAlertsOpen(false);
                }}
              >
                <div>
                  <b>{a.product_name}</b>
                  <small>
                    Lote {a.batch_code} | {num(a.remaining_qty)} {a.stock_unit}
                  </small>
                </div>

                <div className="nx49-alert-right">
                  <strong>{a.expiry_label}</strong>
                  <small>
                    {money(a.value_at_risk)} em risco
                  </small>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="nx49-toolbar">
        <div>
          <small>INVENTARIO ATIVO</small>
          <h3>Produtos</h3>
        </div>

        <input
          placeholder="Buscar produto ou categoria..."
          value={search}
          onChange={e=>setSearch(e.target.value)}
        />
      </div>

      <div className="nx49-products">
        {products.map(p=>{
          const low=Number(p.stock)<=Number(p.minimum_stock);

          let expiry=null;

          if(p.next_expiry){
            const today=new Date();
            today.setHours(12,0,0,0);
            const d=new Date(`${p.next_expiry}T12:00:00`);
            expiry=Math.round((d-today)/86400000);
          }

          return(
            <button
              key={p.id}
              className={`nx49-product ${low?"low":""}`}
              onClick={()=>openProduct(p.id)}
            >
              <div className="nx49-product-top">
                <span>{p.category}</span>
                {low&&<b>ESTOQUE CRITICO</b>}
              </div>

              <h3>{p.name}</h3>

              <div className="nx49-stock">
                <strong>{num(p.stock)}</strong>
                <span>{p.stock_unit||"UN"}</span>
              </div>

              <div className="nx49-product-info">
                <span>
                  Minimo
                  <b>{num(p.minimum_stock)}</b>
                </span>
                <span>
                  Custo
                  <b>{money(p.cost)}</b>
                </span>
              </div>

              <div className="nx49-expiry">
                {!p.next_expiry
                  ?"Sem lote com validade"
                  :expiry<0
                    ?`Vencido ha ${Math.abs(expiry)} dia(s)`
                    :expiry===0
                      ?"Vence hoje"
                      :`Proxima validade em ${expiry} dia(s)`
                }
              </div>
            </button>
          );
        })}
      </div>

      {selected&&detail&&(
        <div
          className="nx49-overlay"
          onMouseDown={e=>{
            if(e.target===e.currentTarget){
              setSelected(null);
              setDetail(null);
              setAction(null);
            }
          }}
        >
          <div className="nx49-detail">
            <div className="nx49-detail-head">
              <div>
                <small>FICHA 360 DO PRODUTO</small>
                <h2>{detail.product.name}</h2>
                <p>
                  {detail.product.category} | Saldo atual:
                  {" "}
                  <b>
                    {num(detail.product.stock)}
                    {" "}
                    {detail.product.stock_unit}
                  </b>
                </p>
              </div>

              <button
                className="nx49-close"
                onClick={()=>{
                  setSelected(null);
                  setDetail(null);
                  setAction(null);
                }}
              >
                X
              </button>
            </div>

            <div className="nx49-actions">
              <button
                className="entry"
                onClick={()=>setAction("entry")}
              >
                + Entrada
              </button>

              <button
                onClick={()=>setAction("exit")}
              >
                - Saida
              </button>

              <button
                className="loss"
                onClick={()=>setAction("loss")}
              >
                Registrar perda
              </button>

              <button
                onClick={()=>setAction("count")}
              >
                Contagem fisica
              </button>
            </div>

            {action&&(
              <ActionForm
                kind={action}
                detail={detail}
                busy={busy}
                onCancel={()=>setAction(null)}
                onSubmit={form=>submit(action,form)}
              />
            )}

            <div className="nx49-detail-grid">
              <div className="nx49-panel">
                <div className="nx49-section-title">
                  <div>
                    <small>FEFO</small>
                    <h3>Lotes e validades</h3>
                  </div>
                </div>

                {!detail.batches.length&&(
                  <div className="nx49-empty">
                    Nenhum lote registrado.
                  </div>
                )}

                {detail.batches.map(b=>(
                  <div
                    key={b.id}
                    className={`nx49-batch ${b.expiry_status}`}
                  >
                    <div>
                      <b>{b.batch_code}</b>
                      <small>
                        {num(b.remaining_qty)} restantes
                      </small>
                    </div>

                    <div>
                      <strong>
                        {b.expires_at
                          ?b.expiry_label
                          :"Sem validade"}
                      </strong>
                      <small>
                        Validade {dateBR(b.expires_at)}
                      </small>
                    </div>
                  </div>
                ))}
              </div>

              <div className="nx49-panel">
                <div className="nx49-section-title">
                  <div>
                    <small>AUDITORIA</small>
                    <h3>Movimentacoes</h3>
                  </div>
                </div>

                {!detail.movements.length&&(
                  <div className="nx49-empty">
                    Nenhuma movimentacao.
                  </div>
                )}

                {detail.movements.map(m=>(
                  <div
                    className="nx49-movement"
                    key={m.id}
                  >
                    <div>
                      <b>{m.type}</b>
                      <small>
                        {m.user_name||"Sistema"} | {m.notes||"-"}
                      </small>
                    </div>

                    <strong
                      className={Number(m.qty)<0?"negative":"positive"}
                    >
                      {Number(m.qty)>0?"+":""}
                      {num(m.qty)}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="nx49-panel">
              <div className="nx49-section-title">
                <div>
                  <small>PERDAS</small>
                  <h3>Historico financeiro de perdas</h3>
                </div>
              </div>

              {!detail.losses.length&&(
                <div className="nx49-empty">
                  Nenhuma perda registrada.
                </div>
              )}

              {detail.losses.map(l=>(
                <div
                  className="nx49-movement"
                  key={l.id}
                >
                  <div>
                    <b>{l.reason}</b>
                    <small>
                      {num(l.qty)} | Lote {l.batch_code||"-"} | {l.user_name||"Sistema"}
                    </small>
                  </div>

                  <strong className="negative">
                    {money(l.total_cost)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Kpi({label,value,hot=false}){
  return(
    <div className={`nx49-kpi ${hot?"hot":""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ActionForm({
  kind,
  detail,
  busy,
  onCancel,
  onSubmit
}){
  const[form,setForm]=useState({
    qty:"",
    batch_code:"",
    manufactured_at:"",
    expires_at:"",
    unit_cost:detail.product.cost||0,
    reason:"",
    notes:"",
    batch_id:"",
    counted_qty:detail.product.stock
  });

  const title={
    entry:"Entrada de estoque",
    exit:"Saida de estoque",
    loss:"Registrar perda",
    count:"Contagem fisica"
  }[kind];

  return(
    <div className="nx49-form">
      <div className="nx49-section-title">
        <div>
          <small>OPERACAO AUDITADA</small>
          <h3>{title}</h3>
        </div>
      </div>

      {kind==="entry"&&(
        <div className="nx49-form-grid">
          <Field label="Quantidade">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.qty}
              onChange={e=>setForm({...form,qty:e.target.value})}
            />
          </Field>

          <Field label="Lote">
            <input
              placeholder="Opcional - gerado automaticamente"
              value={form.batch_code}
              onChange={e=>setForm({...form,batch_code:e.target.value})}
            />
          </Field>

          <Field label="Custo unitario">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.unit_cost}
              onChange={e=>setForm({...form,unit_cost:e.target.value})}
            />
          </Field>

          <Field label="Fabricacao">
            <input
              type="date"
              value={form.manufactured_at}
              onChange={e=>setForm({...form,manufactured_at:e.target.value})}
            />
          </Field>

          <Field label="Validade">
            <input
              type="date"
              value={form.expires_at}
              onChange={e=>setForm({...form,expires_at:e.target.value})}
            />
          </Field>

          <Field label="Observacao">
            <input
              value={form.notes}
              onChange={e=>setForm({...form,notes:e.target.value})}
            />
          </Field>
        </div>
      )}

      {kind==="exit"&&(
        <div className="nx49-form-grid">
          <Field label="Quantidade">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.qty}
              onChange={e=>setForm({...form,qty:e.target.value})}
            />
          </Field>

          <Field label="Motivo obrigatorio">
            <input
              placeholder="Ex.: transferencia, uso interno..."
              value={form.reason}
              onChange={e=>setForm({...form,reason:e.target.value})}
            />
          </Field>
        </div>
      )}

      {kind==="loss"&&(
        <div className="nx49-form-grid">
          <Field label="Quantidade perdida">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.qty}
              onChange={e=>setForm({...form,qty:e.target.value})}
            />
          </Field>

          <Field label="Motivo obrigatorio">
            <select
              value={form.reason}
              onChange={e=>setForm({...form,reason:e.target.value})}
            >
              <option value="">Selecione</option>
              <option value="VENCIMENTO">Vencimento</option>
              <option value="QUEBRA">Quebra</option>
              <option value="AVARIA">Avaria</option>
              <option value="DESPERDICIO">Desperdicio</option>
              <option value="FURTO">Furto</option>
              <option value="CONSUMO_INTERNO">Consumo interno</option>
              <option value="OUTRO">Outro</option>
            </select>
          </Field>

          <Field label="Lote especifico">
            <select
              value={form.batch_id}
              onChange={e=>setForm({...form,batch_id:e.target.value})}
            >
              <option value="">
                Automatico por FEFO
              </option>

              {detail.batches
                .filter(b=>Number(b.remaining_qty)>0)
                .map(b=>(
                  <option key={b.id} value={b.id}>
                    {b.batch_code} - {num(b.remaining_qty)} - {b.expiry_label}
                  </option>
                ))
              }
            </select>
          </Field>

          <Field label="Observacao">
            <input
              value={form.notes}
              onChange={e=>setForm({...form,notes:e.target.value})}
            />
          </Field>
        </div>
      )}

      {kind==="count"&&(
        <div className="nx49-form-grid">
          <Field label="Saldo do sistema">
            <input
              value={num(detail.product.stock)}
              disabled
            />
          </Field>

          <Field label="Quantidade contada">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.counted_qty}
              onChange={e=>setForm({...form,counted_qty:e.target.value})}
            />
          </Field>

          <Field label="Motivo / observacao">
            <input
              value={form.reason}
              onChange={e=>setForm({...form,reason:e.target.value})}
            />
          </Field>
        </div>
      )}

      <div className="nx49-form-actions">
        <button onClick={onCancel}>
          Cancelar
        </button>

        <button
          className="primary"
          disabled={busy}
          onClick={()=>onSubmit(form)}
        >
          {busy?"Processando...":"Confirmar operacao"}
        </button>
      </div>
    </div>
  );
}

function Field({label,children}){
  return(
    <label className="nx49-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
