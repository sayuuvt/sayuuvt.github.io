# Página de apoio SaYuuVT

Página estática com identidade visual do site existente. Nenhum SDK financeiro ou segredo de API é distribuído ao navegador. Fora de loopback, a página usa o gateway público; se o serviço estiver fora do ar ou em pausa, ela se declara indisponível.

O formulário usa centavos, apelido público, mensagem, voz permitida, e-mail para processamento e consentimento. Não solicita CPF. Dados sensíveis não ficam em localStorage. A confirmação vem exclusivamente da API; pagamento confirmado e moderação da mensagem são etapas separadas.

Checkout externo oficial é o caminho padrão. QR incorporado está preparado para uso sujeito à revisão da política do GitHub Pages. Nenhum endereço simulado gera Pix utilizável.

Em desenvolvimento local o gateway de teste responde em `http://127.0.0.1:5111` (`python -m streamcontroller.gateway_main`, projeto StreamControllerProject). Os testes automatizados do gateway e do domínio pertencem ao repositório StreamControllerProject; incluem viewport mobile, validação, reconciliação simulada e ausência de caminhos administrativos. Não equivalem a validação financeira real. Em produção a página fala com o gateway público (`https://sayuuvt-pc.taile1dc42.ts.net:8443`, Tailscale Funnel só para `/public` e `/webhooks`).

## Recuperação e acompanhamento

- O mesmo UUID e o mesmo payload são reaproveitados após resposta incerta, enquanto a página estiver aberta. Nenhum dado é persistido no armazenamento do site.
- O polling usa uma única requisição de status por sessão, com cancelamento e descarte de respostas antigas. Após uma hora, o usuário pode retomar manualmente em "Atualizar status".
- O navegador pode alertar antes de sair durante uma operação pendente. Fechar/recarregar a página perde a recuperação em memória; a API atual não disponibiliza busca pública por request_id. Não tente criar outra cobrança sem verificar a anterior.
- O gateway publicado e o fluxo real devem ser validados separadamente. Os testes frontend não validam processamento financeiro nem a política de retenção de dados do backend.

## Ambientes financeiros

O gateway retorna `payment_environment` (`live`, `sandbox` ou `simulated`) e `simulated`, derivados do provedor ativo. A página pública só habilita o formulário quando o ambiente é explicitamente `live` e a API permite doações. Simulação e Sandbox aparecem somente em localhost/127.0.0.1. Uma API antiga ou resposta inconsistente deixa o Pix indisponível até a atualização do núcleo StreamController; não é seguro inferir produção do estado da Twitch.
