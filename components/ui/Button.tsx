import { ButtonHTMLAttributes, forwardRef } from "react";

// Padrão único de botão clicável AAHBRANT: vinho sólido, texto branco,
// cantos levemente arredondados, mesma altura/padding sempre. Cor NÃO é
// configurável por prop — decisão do usuário, pra garantir consistência
// visual em todo o app.
//
// Exportada à parte porque 2 pontos do app precisam do mesmo visual num
// <Link>/<a> (navegação), não num <button> — <Button> não serve pra esses
// casos, mas a aparência tem que ser idêntica.
export const BUTTON_CLASSES =
  "rounded-md bg-marsala px-4 py-2 text-sm font-medium text-white transition hover:bg-marsala-600 disabled:opacity-60";

type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, BotaoProps>(
  ({ className = "", ...props }, ref) => (
    <button ref={ref} className={`${BUTTON_CLASSES} ${className}`} {...props} />
  ),
);
Button.displayName = "Button";
