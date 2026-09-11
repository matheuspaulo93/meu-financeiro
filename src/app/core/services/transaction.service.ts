import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';
import { stripUndefined } from '../firebase/firestore.util';
import { Transaction } from '../../models';
import { MonthlyBalanceService } from './monthly-balance.service';

const COLLECTION = 'transactions';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly monthlyBalanceService = inject(MonthlyBalanceService);

  private requireUserId(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  /** ordenado no cliente por data desc, mais recente primeiro */
  async list(): Promise<Transaction[]> {
    const userId = this.requireUserId();
    const q = query(collection(db, COLLECTION), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const transactions = snapshot.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }) as Transaction,
    );
    return transactions.sort((a, b) => a.date.localeCompare(b.date));
  }

  async listByMonth(monthStartIso: string, monthEndIso: string): Promise<Transaction[]> {
    const userId = this.requireUserId();
    const q = query(
      collection(db, COLLECTION),
      where('userId', '==', userId),
      where('date', '>=', monthStartIso),
      where('date', '<=', monthEndIso),
      orderBy('date'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }) as Transaction)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async listByMonthForAccount(
    monthStartIso: string,
    monthEndIso: string,
    accountId: string,
  ): Promise<Transaction[]> {
    const userId = this.requireUserId();
    const [sourceSnapshot, destinationSnapshot] = await Promise.all([
      getDocs(
        query(
          collection(db, COLLECTION),
          where('userId', '==', userId),
          where('accountId', '==', accountId),
          where('date', '>=', monthStartIso),
          where('date', '<=', monthEndIso),
          orderBy('date'),
        ),
      ),
      getDocs(
        query(
          collection(db, COLLECTION),
          where('userId', '==', userId),
          where('destinationAccountId', '==', accountId),
          where('type', '==', 'transfer'),
          where('date', '>=', monthStartIso),
          where('date', '<=', monthEndIso),
          orderBy('date'),
        ),
      ),
    ]);

    const items = new Map<string, Transaction>();
    for (const snapshot of [sourceSnapshot, destinationSnapshot]) {
      for (const item of snapshot.docs) {
        items.set(item.id, {
          id: item.id,
          ...(item.data() as Omit<Transaction, 'id'>),
        } as Transaction);
      }
    }

    return Array.from(items.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async get(id: string): Promise<Transaction | null> {
    const snapshot = await getDoc(doc(db, COLLECTION, id));
    if (!snapshot.exists()) {
      return null;
    }
    return { id: snapshot.id, ...(snapshot.data() as Omit<Transaction, 'id'>) } as Transaction;
  }

  async create(
    data: Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    const userId = this.requireUserId();
    const now = new Date().toISOString();
    const ref = await addDoc(
      collection(db, COLLECTION),
      stripUndefined({ ...data, userId, createdAt: now, updatedAt: now }),
    );
    await this.monthlyBalanceService.invalidateTransactionMutation(null, {
      id: ref.id,
      userId,
      ...data,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  async update(
    id: string,
    data: Partial<Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void> {
    const current = await this.get(id);
    const now = new Date().toISOString();
    await updateDoc(
      doc(db, COLLECTION, id),
      stripUndefined({ ...data, updatedAt: now }),
    );
    if (current) {
      await this.monthlyBalanceService.invalidateTransactionMutation(current, {
        ...current,
        ...data,
        updatedAt: now,
      });
    }
  }

  async remove(id: string): Promise<void> {
    const current = await this.get(id);
    await deleteDoc(doc(db, COLLECTION, id));
    if (current) {
      await this.monthlyBalanceService.invalidateTransactionMutation(current, null);
    }
  }

  async listByInvoice(invoiceId: string): Promise<Transaction[]> {
    const userId = this.requireUserId();
    const q = query(
      collection(db, COLLECTION),
      where('userId', '==', userId),
      where('invoiceId', '==', invoiceId),
    );
    const snapshot = await getDocs(q);
    const transactions = snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }) as Transaction)
      .filter((t) => !t.isInvoicePayment);
    return transactions.sort((a, b) => b.date.localeCompare(a.date));
  }

  async listByInstallmentGroup(installmentGroupId: string): Promise<Transaction[]> {
    const userId = this.requireUserId();
    const q = query(
      collection(db, COLLECTION),
      where('userId', '==', userId),
      where('installmentGroupId', '==', installmentGroupId),
    );
    const snapshot = await getDocs(q);
    const transactions = snapshot.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }) as Transaction,
    );
    return transactions.sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
  }
}
