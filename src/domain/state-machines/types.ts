/** Result of asking a state machine whether a move is allowed. */
export type TransitionCheck = { ok: true } | { ok: false; reasonCode: string; message_bn: string };

export const allow = (): TransitionCheck => ({ ok: true });
export const deny = (reasonCode: string, message_bn: string): TransitionCheck => ({
  ok: false,
  reasonCode,
  message_bn,
});
