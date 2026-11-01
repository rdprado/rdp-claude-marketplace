// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — the app's texts in Portuguese (Brazil). `errors.<code>` keys match the codes
// the API and the BFF send.
export const ptBR: Readonly<Record<string, string>> = {
  'app.title': 'Ordens',
  'app.signout': 'Sair',

  'orders.new': 'Nova ordem',
  'orders.symbol': 'Ativo',
  'orders.side': 'Lado',
  'orders.side.buy': 'Compra',
  'orders.side.sell': 'Venda',
  'orders.quantity': 'Quantidade',
  'orders.price': 'Preço',
  'orders.create': 'Enviar ordem',
  'orders.loading': 'Carregando…',
  'orders.empty': 'Nenhuma ordem ainda.',
  'orders.retry': 'Tentar de novo',

  'feedback.order-created': 'Ordem enviada.',
  'feedback.dismiss': 'Fechar',

  'signed-out.title': 'Você saiu.',
  'signed-out.signin': 'Entrar de novo',

  'errors.unexpected': 'Algo deu errado. Tente de novo.',
  'errors.validation-failed': 'Confira os campos destacados.',
  'errors.client-order-id-reused': 'Esta ordem já foi enviada com outros valores. Confira a lista.',
  'errors.identity-provider-unavailable': 'O login está indisponível agora. Tente de novo em instantes.',
  'errors.api-unavailable': 'O serviço está indisponível agora. Tente de novo em instantes.',
  'errors.required': 'Obrigatório.',
  'errors.invalid': 'Valor inválido.',
  'errors.must-be-positive': 'Deve ser maior que zero.'
};
