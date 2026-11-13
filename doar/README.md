# Página de apoio SaYuuVT

Página estática com identidade visual do site existente. Nenhum SDK financeiro ou segredo de API é distribuído ao navegador. Fora de loopback, a página usa o gateway público; se o serviço estiver fora do ar ou em pausa, ela se declara indisponível.

O formulário usa centavos, apelido público, mensagem, voz permitida, e-mail para processamento e consentimento. Não solicita CPF. Dados sensíveis não ficam em localStorage. A confirmação vem exclusivamente da API; pagamento confirmado e moderação da mensagem são etapas separadas.

Checkout externo oficial é o caminho padrão. QR incorporado está preparado para uso sujeito à revisão da política do GitHub Pages. Nenhum endereço simulado gera Pix utilizável.

Em desenvolvimento local o gateway de teste responde em `http://127.0.0.1:5111` (`python -m streamcontroller.gateway_main`, projeto StreamController legado). Os testes automatizados do gateway e do domínio pertencem ao repositório privado StreamController; incluem viewport mobile, validação, reconciliação simulada e ausência de caminhos administrativos. Não equivalem a validação financeira real. Em produção a página fala com o gateway público (`https://sayuuvt-pc.taile1dc42.ts.net:8443`, Tailscale Funnel só para `/public` e `/webhooks`).
