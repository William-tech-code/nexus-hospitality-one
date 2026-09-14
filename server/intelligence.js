import {db,setting} from './db.js';
const n=v=>Number(v||0), round=v=>Math.round((n(v)+Number.EPSILON)*100)/100;
export function dashboardSnapshot(){
  const today=db.prepare("SELECT COALESCE(SUM(total),0) revenue,COUNT(*) sales FROM sales WHERE status='PAID' AND date(created_at,'localtime')=date('now','localtime')").get();
  const month=db.prepare("SELECT COALESCE(SUM(total),0) revenue FROM sales WHERE status='PAID' AND strftime('%Y-%m',created_at,'localtime')=strftime('%Y-%m','now','localtime')").get();
  const profit=db.prepare("SELECT COALESCE(SUM((si.unit_price-si.unit_cost)*si.qty),0) p FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='PAID' AND date(s.created_at,'localtime')=date('now','localtime')").get().p;
  const expenses=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE paid=1 AND strftime('%Y-%m',COALESCE(paid_at,created_at),'localtime')=strftime('%Y-%m','now','localtime')").get().total;
  const lowStock=db.prepare('SELECT id,name,category,stock,minimum_stock FROM products WHERE active=1 AND stock<=minimum_stock ORDER BY (minimum_stock-stock) DESC LIMIT 8').all();
  const topProducts=db.prepare("SELECT p.id,p.name,ROUND(COALESCE(SUM(si.qty),0),2) qty,ROUND(COALESCE(SUM(si.qty*si.unit_price),0),2) revenue FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.status='PAID' JOIN products p ON p.id=si.product_id WHERE date(s.created_at,'localtime')>=date('now','localtime','-30 day') GROUP BY p.id,p.name ORDER BY revenue DESC LIMIT 6").all();
  const goal=n(setting('daily_goal','1000'));
  return {todayRevenue:round(today.revenue),monthRevenue:round(month.revenue),salesCount:n(today.sales),averageTicket:today.sales?round(today.revenue/today.sales):0,grossProfitToday:round(profit),monthExpenses:round(expenses),dailyGoal:goal,goalProgress:goal?Math.min(999,round(today.revenue/goal*100)):0,lowStock,topProducts};
}
export function closingPlan(revenue){
  const r=n(revenue),p=k=>n(setting(k,'0'))/100;
  const reserve=round(r*p('reserve_percent')),taxes=round(r*p('tax_percent')),payroll=round(r*p('salary_percent')),owner=round(r*p('owner_percent')),reinvest=round(r*p('reinvest_percent'));
  return {revenue:round(r),reserve,taxes,payroll,owner,reinvest,operating:round(Math.max(0,r-reserve-taxes-payroll-owner-reinvest)),mode:'FOUNDATION_PERCENTAGE'};
}
export function growthBrief(){
  const s=dashboardSnapshot(); let score=50; const notes=[];
  if(s.goalProgress>=100){score+=18;notes.push('Meta diária alcançada. Preserve margem e caixa antes de aumentar retiradas.')} else if(s.goalProgress>=60){score+=8;notes.push(`Você já atingiu ${s.goalProgress}% da meta diária.`)} else notes.push(`Faltam R$ ${Math.max(0,s.dailyGoal-s.todayRevenue).toFixed(2)} para a meta do dia.`);
  if(s.lowStock.length){score-=Math.min(15,s.lowStock.length*3);notes.push(`${s.lowStock.length} item(ns) estão no nível de reposição.`)} else {score+=8;notes.push('Estoque sem rupturas críticas detectadas.')} 
  if(s.averageTicket>35){score+=8;notes.push('Ticket médio saudável para a base atual.')} else notes.push('Há espaço para elevar ticket médio com combos e venda orientada.');
  return {score:Math.max(0,Math.min(100,score)),headline:score>=75?'Operação em trajetória forte':score>=55?'Operação estável com oportunidades':'A operação pede atenção tática',notes};
}
export function performanceSnapshot(){
  const employees=db.prepare(`SELECT e.id,e.name,e.role_label,
    COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.employee_id=e.id AND s.status='PAID' AND strftime('%Y-%m',s.created_at)=strftime('%Y-%m','now')),0) sales,
    COALESCE((SELECT SUM(t.amount) FROM tips t WHERE t.employee_id=e.id AND strftime('%Y-%m',t.created_at)=strftime('%Y-%m','now')),0) tips,
    COALESCE((SELECT SUM(r.amount) FROM employee_rewards r WHERE r.employee_id=e.id AND strftime('%Y-%m',r.created_at)=strftime('%Y-%m','now')),0) rewards
    FROM employees e WHERE e.active=1 ORDER BY sales DESC`).all();
  return employees.map(x=>({...x,total_due:round(n(x.tips)+n(x.rewards))}));
}
