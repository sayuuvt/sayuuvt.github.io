# SaYuuVT Ladder — testes locais

O checkout de desenvolvimento contém a página inicial e uma área autenticada
em perfil.html com telas Perfil, Competição e Administração. A navegação interna
usa o mesmo documento para manter o token somente em memória (sem armazenamento
persistente); a administração tem uma tela própria com criação de eventos,
organização de seeds, resolução de partidas e reporte/DQ do Top 8.
Competição inclui inscrição, fila, check-in, cancelamento, chat privado Ladder,
classificação, Top 8 e Discord do adversário pronto no Top 8.

Execute no repositório front-end:

    python -m http.server 8000 --bind 127.0.0.1

Abra http://localhost:8000/torneios/perfil.html (não 127.0.0.1 no navegador).
O backend deve executar local_player na porta 5126 com o redirect URI igual à
página local cadastrada no Discord. Nenhuma conexão ao backend está habilitada
no Pages publicado. Não gravar Client Secret ou token em código.
Recarregar a página exige novo login. A API é experimental; não publicar.
O laboratório permanece separado e usa exportação/importação de JSON.
O chat do Top 8 e a revisão visual completa em navegador ainda estão pendentes.

## Transmissão local

A administração pode selecionar o evento ou reservar uma partida disponível
(Ladder ou Top 8). Carregar no placar exige a ponte explicitamente habilitada
no backend e confirmação do administrador. A reserva não pausa prazos nem
bloqueia o confronto. Nenhum acesso direto ao logger é feito pelo navegador.
Veja docs/ladder/README.md do StreamControllerProject para configurar a ponte.
