import { Transaction } from '../../models';

export type BalanceScopeAccountId = 'all' | string;

export function isHiddenCreditCardPurchase(transaction: Pick<Transaction, 'invoiceId' | 'isInvoicePayment'>): boolean {
  return Boolean(transaction.invoiceId) && !transaction.isInvoicePayment;
}

export function transactionAffectsBalance(
  transaction: Pick<Transaction, 'invoiceId' | 'isInvoicePayment'>,
): boolean {
  return !isHiddenCreditCardPurchase(transaction);
}

export function computeTransactionBalanceDelta(
  transaction: Pick<Transaction, 'accountId' | 'amount' | 'destinationAccountId' | 'invoiceId' | 'isInvoicePayment' | 'type'>,
  accountId: BalanceScopeAccountId,
): number {
  if (isHiddenCreditCardPurchase(transaction)) {
    return 0;
  }

  if (accountId === 'all') {
    if (transaction.type === 'income') return transaction.amount;
    if (transaction.type === 'expense') return -transaction.amount;
    return 0;
  }

  if (transaction.accountId === accountId) {
    if (transaction.type === 'income') return transaction.amount;
    if (transaction.type === 'expense') return -transaction.amount;
    if (transaction.type === 'transfer') return -transaction.amount;
  }

  if (transaction.type === 'transfer' && transaction.destinationAccountId === accountId) {
    return transaction.amount;
  }

  return 0;
}
