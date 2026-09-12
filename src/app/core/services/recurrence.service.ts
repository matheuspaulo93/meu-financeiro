import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';
import { stripUndefined } from '../firebase/firestore.util';
import { Recurrence, Transaction } from '../../models';
import { addFrequencyStep, formatIsoDate, parseIsoDate } from '../../shared/util/date.util';
import { MonthlyBalanceService } from './monthly-balance.service';

const RECURRENCES_COLLECTION = 'recurrences';
const TRANSACTIONS_COLLECTION = 'transactions';

export type RecurrenceScope = 'only' | 'future';

@Injectable({ providedIn: 'root' })
export class RecurrenceService {
  private readonly monthlyBalanceService = inject(MonthlyBalanceService);

  private requireUserId(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  async get(id: string): Promise<Recurrence | null> {
    const snapshot = await getDoc(doc(db, RECURRENCES_COLLECTION, id));
    if (!snapshot.exists()) {
      return null;
    }
    return { id: snapshot.id, ...(snapshot.data() as Omit<Recurrence, 'id'>) } as Recurrence;
  }

  /** cria o "template" da recorrência e já gera as ocorrências iniciais (idempotente) */
  async create(
    data: Omit<Recurrence, 'id' | 'userId' | 'active' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    const userId = this.requireUserId();
    const now = new Date().toISOString();
    const payload = { ...data, userId, active: true, createdAt: now, updatedAt: now };
    const ref = await addDoc(collection(db, RECURRENCES_COLLECTION), stripUndefined(payload));
    await this.generateOccurrences({ id: ref.id, ...payload } as Recurrence);
    return ref.id;
  }

  async update(
    id: string,
    data: Partial<Omit<Recurrence, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void> {
    await updateDoc(
      doc(db, RECURRENCES_COLLECTION, id),
      stripUndefined({ ...data, updatedAt: new Date().toISOString() }),
    );
  }

  /** gera as transações faltantes de uma recorrência (id determinístico evita duplicidade) */
  async generateOccurrences(recurrence: Recurrence): Promise<void> {
    await this.persistOccurrences(recurrence, this.computeOccurrenceDates(recurrence));
  }

  async generateOccurrencesInRange(
    recurrence: Recurrence,
    fromDate: string,
    toDate: string,
  ): Promise<void> {
    await this.persistOccurrences(
      recurrence,
      this.computeOccurrenceDates(recurrence, { fromDate, toDate }),
    );
  }

  /** roda a geração para todas as recorrências ativas do usuário; chamar ao abrir a tela de Transações */
  async runGenerationForAllActive(): Promise<void> {
    const userId = this.requireUserId();
    const q = query(
      collection(db, RECURRENCES_COLLECTION),
      where('userId', '==', userId),
      where('active', '==', true),
    );
    const snapshot = await getDocs(q);
    const recurrences = snapshot.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<Recurrence, 'id'>) }) as Recurrence,
    );
    for (const recurrence of recurrences) {
      await this.generateOccurrences(recurrence);
    }
  }

  async runGenerationForRange(fromDate: string, toDate: string): Promise<void> {
    const userId = this.requireUserId();
    const q = query(
      collection(db, RECURRENCES_COLLECTION),
      where('userId', '==', userId),
      where('active', '==', true),
    );
    const snapshot = await getDocs(q);
    const recurrences = snapshot.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<Recurrence, 'id'>) }) as Recurrence,
    );
    for (const recurrence of recurrences) {
      await this.generateOccurrencesInRange(recurrence, fromDate, toDate);
    }
  }

  private async persistOccurrences(recurrence: Recurrence, dates: string[]): Promise<void> {
    const createdTransactions: Transaction[] = [];
    for (const date of dates) {
      const ref = doc(db, TRANSACTIONS_COLLECTION, `${recurrence.id}_${date}`);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        continue;
      }
      const now = new Date().toISOString();
      const transactionData: Omit<Transaction, 'id'> = {
        userId: recurrence.userId,
        type: recurrence.type,
        description: recurrence.description,
        amount: recurrence.amount,
        date,
        accountId: recurrence.accountId,
        destinationAccountId: recurrence.destinationAccountId,
        categoryId: recurrence.categoryId,
        subcategoryId: recurrence.subcategoryId,
        tagIds: recurrence.tagIds,
        note: recurrence.note,
        recurrenceId: recurrence.id,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(ref, stripUndefined(transactionData));
      createdTransactions.push({ id: ref.id, ...transactionData });
    }

    if (createdTransactions.length > 0) {
      await this.monthlyBalanceService.invalidateTransactionMutations(
        createdTransactions.map((transaction) => ({ after: transaction })),
      );
    }
  }

  /**
   * Aplica edição em uma transação que pertence a uma recorrência.
   * 'only': altera somente esta ocorrência.
   * 'future': encerra a recorrência atual nesta data e recria a partir daqui com os novos valores.
   */
  async applyEdit(
    transaction: Transaction,
    data: Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'recurrenceId'>,
    scope: RecurrenceScope,
  ): Promise<void> {
    if (scope === 'only' || !transaction.recurrenceId) {
      const before = transaction;
      const now = new Date().toISOString();
      await updateDoc(
        doc(db, TRANSACTIONS_COLLECTION, transaction.id),
        stripUndefined({ ...data, updatedAt: now }),
      );
      await this.monthlyBalanceService.invalidateTransactionMutation(before, {
        ...transaction,
        ...data,
        updatedAt: now,
      });
      return;
    }

    const oldRecurrence = await this.get(transaction.recurrenceId);
    if (!oldRecurrence) {
      const now = new Date().toISOString();
      await updateDoc(
        doc(db, TRANSACTIONS_COLLECTION, transaction.id),
        stripUndefined({ ...data, updatedAt: now }),
      );
      await this.monthlyBalanceService.invalidateTransactionMutation(transaction, {
        ...transaction,
        ...data,
        updatedAt: now,
      });
      return;
    }

    await this.update(oldRecurrence.id, { canceledFrom: transaction.date });
    await this.deleteGeneratedFrom(oldRecurrence.id, transaction.date);

    let occurrenceCount: number | undefined;
    if (oldRecurrence.endType === 'count') {
      const occurredBefore = this.computeOccurrenceDates(oldRecurrence).filter(
        (d) => d < transaction.date,
      ).length;
      occurrenceCount = Math.max(1, (oldRecurrence.occurrenceCount ?? 1) - occurredBefore);
    }

    await this.create({
      type: data.type,
      description: data.description,
      amount: data.amount,
      accountId: data.accountId,
      destinationAccountId: data.destinationAccountId,
      categoryId: data.categoryId,
      subcategoryId: data.subcategoryId,
      tagIds: data.tagIds,
      note: data.note,
      frequency: oldRecurrence.frequency,
      startDate: transaction.date,
      endType: oldRecurrence.endType,
      occurrenceCount,
    });
  }

  /**
   * Aplica exclusão em uma transação que pertence a uma recorrência.
   * 'only': apaga somente esta ocorrência (marcada como pulada, não é regerada).
   * 'future': apaga esta e todas as ocorrências futuras já geradas, e encerra a recorrência a partir daqui.
   */
  async applyDelete(transaction: Transaction, scope: RecurrenceScope): Promise<void> {
    if (scope === 'only' || !transaction.recurrenceId) {
      await deleteDoc(doc(db, TRANSACTIONS_COLLECTION, transaction.id));
      if (transaction.recurrenceId) {
        await this.addExcludedDate(transaction.recurrenceId, transaction.date);
      }
      await this.monthlyBalanceService.invalidateTransactionMutation(transaction, null);
      return;
    }

    await this.update(transaction.recurrenceId, { canceledFrom: transaction.date });
    await this.deleteGeneratedFrom(transaction.recurrenceId, transaction.date);
  }

  private async addExcludedDate(recurrenceId: string, date: string): Promise<void> {
    const recurrence = await this.get(recurrenceId);
    if (!recurrence) {
      return;
    }
    const excludedDates = [...(recurrence.excludedDates ?? []), date];
    await this.update(recurrenceId, { excludedDates });
  }

  private async deleteGeneratedFrom(recurrenceId: string, fromDate: string): Promise<void> {
    const userId = this.requireUserId();
    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where('userId', '==', userId),
      where('recurrenceId', '==', recurrenceId),
    );
    const snapshot = await getDocs(q);
    const removedTransactions = snapshot.docs
      .filter((d) => (d.data()['date'] as string) >= fromDate)
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }) as Transaction);
    const deletions = removedTransactions.map((transaction) =>
      deleteDoc(doc(db, TRANSACTIONS_COLLECTION, transaction.id)),
    );
    await Promise.all(deletions);
    if (removedTransactions.length > 0) {
      await this.monthlyBalanceService.invalidateTransactionMutations(
        removedTransactions.map((transaction) => ({ before: transaction })),
      );
    }
  }

  /** calcula as datas ISO de ocorrência: limitada por count, ou por uma janela móvel quando indeterminada */
  private computeOccurrenceDates(
    recurrence: Recurrence,
    options?: { fromDate?: string; toDate?: string },
  ): string[] {
    const dates: string[] = [];
    const startDate = parseIsoDate(recurrence.startDate);
    const fromDate = options?.fromDate ? parseIsoDate(options.fromDate) : startDate;
    const toDate = options?.toDate ? parseIsoDate(options.toDate) : null;
    const horizon = recurrence.endType === 'indeterminate' ? this.indeterminateHorizon() : null;
    const maxCount = recurrence.endType === 'count' ? (recurrence.occurrenceCount ?? 0) : Infinity;
    const upperBound = toDate && horizon ? (toDate < horizon ? toDate : horizon) : (toDate ?? horizon);

    if (upperBound && startDate > upperBound) {
      return dates;
    }

    const { date: firstDate, stepsAdvanced } = this.advanceToRangeStart(
      startDate,
      recurrence.frequency,
      fromDate,
    );

    let current = firstDate;
    let count = stepsAdvanced;
    while (count < maxCount) {
      if (upperBound && current > upperBound) {
        break;
      }
      const iso = formatIsoDate(current);
      if (recurrence.canceledFrom && iso >= recurrence.canceledFrom) {
        break;
      }
      if (!recurrence.excludedDates?.includes(iso)) {
        dates.push(iso);
      }
      count++;
      current = addFrequencyStep(current, recurrence.frequency, 1);
    }
    return dates;
  }

  /** horizonte de geração para recorrências indeterminadas: fim do próximo ano */
  private indeterminateHorizon(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 12, 0);
  }

  private advanceToRangeStart(
    startDate: Date,
    frequency: Recurrence['frequency'],
    targetDate: Date,
  ): { date: Date; stepsAdvanced: number } {
    if (startDate >= targetDate) {
      return { date: startDate, stepsAdvanced: 0 };
    }

    let stepsAdvanced = 0;

    switch (frequency) {
      case 'daily':
        stepsAdvanced = this.diffInDays(startDate, targetDate);
        break;
      case 'weekly':
        stepsAdvanced = Math.floor(this.diffInDays(startDate, targetDate) / 7);
        break;
      case 'monthly':
        stepsAdvanced =
          (targetDate.getFullYear() - startDate.getFullYear()) * 12 +
          (targetDate.getMonth() - startDate.getMonth());
        break;
    }

    let current = addFrequencyStep(startDate, frequency, stepsAdvanced);
    while (current < targetDate) {
      stepsAdvanced++;
      current = addFrequencyStep(startDate, frequency, stepsAdvanced);
    }

    return { date: current, stepsAdvanced };
  }

  private diffInDays(startDate: Date, endDate: Date): number {
    const startUtc = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const endUtc = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24));
  }
}
