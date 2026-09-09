import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';
import { stripUndefined } from '../firebase/firestore.util';
import { Transaction } from '../../models';

const COLLECTION = 'transactions';

@Injectable({ providedIn: 'root' })
export class TransactionService {
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
    return ref.id;
  }

  async update(
    id: string,
    data: Partial<Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void> {
    await updateDoc(
      doc(db, COLLECTION, id),
      stripUndefined({ ...data, updatedAt: new Date().toISOString() }),
    );
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
  }
}
