# SaYuuVT Ladder — testes locais

A página perfil.html é um candidato de integração local com Discord.
Serve o repositório com python -m http.server 8000 --bind 127.0.0.1,
abra http://localhost:8000/torneios/perfil.html (não 127.0.0.1 no navegador).
O backend deve rodar com local_player na porta 5126 e redirect URI igual
à página local cadastrada no Discord. Não funciona ainda no Pages público.
Não gravar Client Secret ou token em código. A sessão fica em memória,
portanto recarregar a página exige novo login. Sem integração de produção.
