// Mensagens de falha de login, derivadas do código que o servidor devolve.
//
// Existe porque o oposto nos custou horas: quando toda falha virava "Token do
// Teams inválido", uma queda de banco parecia problema de identidade e o
// diagnóstico foi para o lado errado duas vezes. A mensagem na tela precisa
// apontar a categoria certa — sem expor detalhe interno, que fica no log.

/** Categorias que `/api/auth/teams` distingue. */
export type CodigoFalhaSso =
  | "token_invalido"
  | "sem_acesso"
  | "indisponivel"
  | "desconhecido";

/** Traduz o status HTTP da rota de SSO na categoria correspondente. */
export function codigoFalhaSso(status: number): CodigoFalhaSso {
  if (status === 401) return "token_invalido";
  if (status === 403) return "sem_acesso";
  if (status === 503) return "indisponivel";
  return "desconhecido";
}

/** Texto mostrado ao usuário para cada categoria. */
export function mensagemFalhaSso(codigo: CodigoFalhaSso): string {
  switch (codigo) {
    case "token_invalido":
      return "Não foi possível validar sua identidade do Teams.";
    case "sem_acesso":
      return "Seu e-mail não tem acesso ao G-Políticas. Solicite liberação ao administrador.";
    case "indisponivel":
      // A mensagem que teria economizado horas de investigação.
      return "O sistema está temporariamente indisponível (falha ao acessar o banco de dados). Tente novamente em alguns minutos.";
    case "desconhecido":
      return "Não foi possível entrar. Tente novamente.";
  }
}
