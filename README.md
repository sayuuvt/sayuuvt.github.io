# SaYuuVT — site de links

Página de links (substitui o Carrd) com o visual do painel de stream: tema escuro, neon e fonte Exo 2.
É estático (HTML + CSS + JS puro), sem etapa de build, e roda direto no GitHub Pages.

## Estrutura

```
index.html            # conteúdo e links
css/style.css         # estilos (tokens herdados do painel)
js/main.js            # badge "AO VIVO", e-mail e ano do rodapé
assets/               # imagens otimizadas + icons.svg (sprite de ícones)
tools/optimize-images.py
```

## Editar links

Os links ficam em `index.html`, um `<li>` por rede. A cor do brilho de cada botão vem de `style="--brand: #cor"`.

- Para esconder um link sem apagá-lo, adicione `hidden` ao `<li>`.
- **E-mail**: fica em `data-user` e `data-domain` no elemento `[data-email]` e é montado pelo JS, para não aparecer em texto puro no HTML.
  A seção "Contato Profissional" só aparece quando os dois estão preenchidos.

## Badge "AO VIVO"

`js/main.js` consulta `https://decapi.me/twitch/uptime/sayuuvt` (serviço público, sem token, com CORS liberado) a cada 2 minutos.
Quando o canal está em live, o avatar ganha um anel vermelho pulsante e o botão da Twitch mostra o jogo atual.
Se o serviço falhar, o site só deixa de mostrar o badge; o resto da página continua funcionando.

## Rodar localmente

```
python -m http.server 8000
```

Depois abra http://localhost:8000. Abrir o `index.html` direto pelo arquivo não carrega os ícones, porque o sprite SVG precisa de HTTP.

## Publicar no GitHub Pages

Ícones de marca: [Simple Icons](https://simpleicons.org) (CC0).
