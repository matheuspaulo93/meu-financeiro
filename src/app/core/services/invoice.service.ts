import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';
import { stripUndefined } from '../firebase/firestore.util';
import { CreditCard, Invoice, Transaction } from '../../models';
import { CreditCardService } from './credit-card.service';
import { formatIsoDate, parseIsoDate } from '../../shared/util/date.util';

const INVOICES_COLLECTION = 'invoices';
const TRANSACTIONS_COLLECTION = 'transactions';

export interface UpcomingInvoiceOption {
  dueDate: string;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly creditCardService = inject(CreditCardService);

  private requireUserId(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  async get(id: string): Promise<Invoice | null> {
    const snapshot = await getDoc(doc(db, INVOICES_COLLECTION, id));
    if (!snapshot.exists()) {
      return null;
    }
    return { id: snapshot.id, ...(snapshot.data() as Omit<Invoice, 'id'>) } as Invoice;
  }

  async getByCardAndDueDate(creditCardId: string, dueDate: string): Promise<Invoice | null> {
    const userId = this.requireUserId();
    const q = query(
      collection(db, INVOICES_COLLECTION),
      where('userId', '==', userId),
      where('creditCardId', '==', creditCardId),
      where('dueDate', '==', dueDate),
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    const d = snapshot.docs[0];
    return { id: d.id, ...(d.data() as Omit<Invoice, 'id'>) } as Invoice;
  }

  async getOrCreate(creditCardId: string, dueDate: string): Promise<Invoice> {
    const existing = await this.getByCardAndDueDate(creditCardId, dueDate);
    if (existing) {
      return existing;
    }

    const userId = this.requireUserId();
    const newInvoice: Omit<Invoice, 'id'> = {
      userId,
      creditCardId,
      dueDate,
      status: 'open',
      total: 0,
    };
    const ref = await addDoc(collection(db, INVOICES_COLLECTION), stripUndefined(newInvoice));
    return { id: ref.id, ...newInvoice };
  }

  async listByCard(creditCardId: string): Promise<Invoice[]> {
    const userId = this.requireUserId();
    const q = query(
      collection(db, INVOICES_COLLECTION),
      where('userId', '==', userId),
      where('creditCardId', '==', creditCardId),
    );
    const snapshot = await getDocs(q);
    const invoices = snapshot.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<Invoice, 'id'>) }) as Invoice,
    );
    return invoices.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }

  /**
   * Calcula as próximas N faturas do cartão que ainda não venceram.
   */
  getUpcomingInvoices(card: CreditCard, count: number = 3): UpcomingInvoiceOption[] {
    const today = new Date();
    const todayIso = formatIsoDate(today);

    let year = today.getFullYear();
    let month = today.getMonth();

    const makeDueDate = (y: number, m: number, dueDay: number): string => {
      const lastDay = new Date(y, m + 1, 0).getDate();
      const day = Math.min(dueDay, lastDay);
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    };

    // Se o vencimento deste mês já passou de hoje, a primeira fatura não vencida é a do próximo mês
    if (makeDueDate(year, month, card.dueDay) < todayIso) {
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
    }

    const options: UpcomingInvoiceOption[] = [];
    for (let i = 0; i < count; i++) {
      const curMonth = (month + i) % 12;
      const curYear = year + Math.floor((month + i) / 12);
      const dueDate = makeDueDate(curYear, curMonth, card.dueDay);

      const dateObj = parseIsoDate(dueDate);
      const monthName = dateObj.toLocaleDateString('pt-BR', { month: 'long' });
      const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      const formattedDate = dateObj.toLocaleDateString('pt-BR');

      options.push({
        dueDate,
        label: `Vencimento ${formattedDate} (${capitalizedMonth}/${curYear})`,
      });
    }

    return options;
  }

  /**
   * Recalcula o valor total da fatura e sincroniza a transação consolidada na conta de débito.
   */
  async recalculate(invoiceId: string): Promise<void> {
    const invoice = await this.get(invoiceId);
    if (!invoice) return;

    const card = await this.creditCardService.get(invoice.creditCardId);
    if (!card) return;

    const userId = this.requireUserId();
    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where('userId', '==', userId),
      where('invoiceId', '==', invoiceId),
    );
    const snapshot = await getDocs(q);

    // Filtra apenas compras reais do cartão (exclui a própria transação consolidada de pagamento)
    const items = snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }) as Transaction)
      .filter((t) => !t.isInvoicePayment);

    const total = items.reduce((sum, item) => sum + item.amount, 0);

    // Se a fatura ainda estiver aberta, sincroniza a transação na conta
    if (invoice.status === 'open') {
      if (total > 0) {
        if (invoice.paymentTransactionId) {
          // Atualiza transação existente
          const txRef = doc(db, TRANSACTIONS_COLLECTION, invoice.paymentTransactionId);
          const txSnap = await getDoc(txRef);
          if (txSnap.exists()) {
            await updateDoc(
              txRef,
              stripUndefined({
                description: `Fatura ${card.name}`,
                amount: total,
                date: invoice.dueDate,
                accountId: card.debitAccountId,
                updatedAt: new Date().toISOString(),
              }),
            );
          } else {
            // Se foi apagada por engano, recria
            const newTxId = await this.createPaymentTransaction(card, invoice, total);
            await updateDoc(doc(db, INVOICES_COLLECTION, invoice.id), {
              paymentTransactionId: newTxId,
              total,
            });
            return;
          }
        } else {
          // Cria nova transação na conta corrente
          const newTxId = await this.createPaymentTransaction(card, invoice, total);
          await updateDoc(doc(db, INVOICES_COLLECTION, invoice.id), {
            paymentTransactionId: newTxId,
            total,
          });
          return;
        }
      } else {
        // Total zerou (todos os itens foram excluídos)
        if (invoice.paymentTransactionId) {
          await deleteDoc(doc(db, TRANSACTIONS_COLLECTION, invoice.paymentTransactionId));
          await updateDoc(doc(db, INVOICES_COLLECTION, invoice.id), {
            paymentTransactionId: deleteField(),
            total: 0,
          });
          return;
        }
      }
    }

    await updateDoc(doc(db, INVOICES_COLLECTION, invoice.id), { total });
  }

  private async createPaymentTransaction(
    card: CreditCard,
    invoice: Invoice,
    amount: number,
  ): Promise<string> {
    const userId = this.requireUserId();
    const now = new Date().toISOString();
    const txData: Omit<Transaction, 'id'> = {
      userId,
      type: 'expense',
      paymentMethod: 'debit',
      description: `Fatura ${card.name}`,
      amount,
      date: invoice.dueDate,
      accountId: card.debitAccountId,
      creditCardId: card.id,
      invoiceId: invoice.id,
      isInvoicePayment: true,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(collection(db, TRANSACTIONS_COLLECTION), stripUndefined(txData));
    return ref.id;
  }

  /**
   * Registra o pagamento da fatura com a data e valor definidos pelo usuário.
   */
  async markAsPaid(invoiceId: string, paidAmount: number, paidAt: string): Promise<void> {
    const invoice = await this.get(invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');

    const card = await this.creditCardService.get(invoice.creditCardId);
    if (!card) throw new Error('Cartão de crédito não encontrado.');

    let paymentTxId = invoice.paymentTransactionId;
    if (!paymentTxId) {
      paymentTxId = await this.createPaymentTransaction(card, invoice, paidAmount);
    }

    // Atualiza a transação consolidada para refletir a data real de pagamento e o valor pago
    await updateDoc(
      doc(db, TRANSACTIONS_COLLECTION, paymentTxId),
      stripUndefined({
        amount: paidAmount,
        date: paidAt,
        updatedAt: new Date().toISOString(),
      }),
    );

    // Atualiza o status da fatura
    await updateDoc(doc(db, INVOICES_COLLECTION, invoice.id), {
      status: 'paid',
      paidAmount,
      paidAt,
      paymentTransactionId: paymentTxId,
    });
  }

  /**
   * Reabre uma fatura paga, restaurando a data de vencimento e o valor total acumulado.
   */
  async reopen(invoiceId: string): Promise<void> {
    const invoice = await this.get(invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');

    if (invoice.paymentTransactionId) {
      await updateDoc(
        doc(db, TRANSACTIONS_COLLECTION, invoice.paymentTransactionId),
        stripUndefined({
          amount: invoice.total,
          date: invoice.dueDate,
          updatedAt: new Date().toISOString(),
        }),
      );
    }

    await updateDoc(doc(db, INVOICES_COLLECTION, invoice.id), {
      status: 'open',
      paidAmount: deleteField(),
      paidAt: deleteField(),
    });
  }
}

