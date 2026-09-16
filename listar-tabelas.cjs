const D=require("better-sqlite3");const d=new D("./data/nexus-hospitality.sqlite",{readonly:true});console.table(d.pragma("table_list"));d.close();
