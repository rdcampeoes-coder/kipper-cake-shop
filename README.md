# Kipper Cake Shop — protótipo full-stack

Primeira versão funcional do sistema de gestão da Kipper Cake Shop.

## Arquitetura
- Node.js + Express
- PostgreSQL quando `DATABASE_URL` está definido
- Fallback em memória para desenvolvimento sem base de dados
- Frontend responsivo em HTML/CSS/JavaScript
- Preparado para Render (`render.yaml`)

## Módulos incluídos
- Dashboard
- Clientes + histórico
- Produtos
- Componentes (massas, coberturas/recheios)
- Tamanhos configuráveis
- Calculadora de bolo personalizado
- Encomendas: registar → preparar → aguarda recolha → arquivo
- Ajuste de consumo real antes de descontar stock
- Stock, mínimos e movimentos
- Finanças / despesas
- Confirmações de edição e eliminação
- Reset avançado das quantidades das receitas

## Dados reais já introduzidos
- Massa de Bolo de Cenoura fornecida na conversa
- Cobertura de Chocolate fornecida na conversa
- Tamanhos P: 650g massa + 400g cobertura; M: 1100g + 600g

Outras receitas são marcadas como dados provisórios de demonstração.

## Executar localmente
```bash
npm install
npm start
```
Abrir http://localhost:3000

## Deploy no Render
O repositório inclui `render.yaml`. Depois de publicar no GitHub:
1. Criar Blueprint no Render a partir do repositório, ou criar Web Service + Postgres.
2. O Render injeta `DATABASE_URL`.
3. A aplicação cria as tabelas automaticamente no arranque e faz seed inicial se a base estiver vazia.
