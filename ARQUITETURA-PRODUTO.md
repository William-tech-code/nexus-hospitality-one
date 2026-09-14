# NEXUS Hospitality One — Arquitetura V0.3

Fluxo operacional central:

Mesa → Comanda → Pedido → KDS → Serviço → Fechamento → Venda → Caixa → Estoque → Performance → Inteligência.

Compras:

Estoque → Necessidade → Cotação → Fornecedores → Melhor oferta → Pedido/Recebimento (próxima camada).

Bebidas:

Embalagem → volume em ml → dose configurável → fator de consumo → estoque real → rendimento teórico → divergência futura.

A arquitetura mantém autenticação/RBAC/auditoria da V0.2 e preserva banco SQLite existente por migração incremental.
