import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';
import { stripUndefined } from '../firebase/firestore.util';
import { Account } from '../../models';

const COLLECTION = 'accounts';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private requireUserId(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  /** ordenado no cliente para evitar a necessidade de índice composto no Firestore */
  async list(): Promise<Account[]> {
    const userId = this.requireUserId();
    const q = query(collection(db, COLLECTION), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const accounts = snapshot.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<Account, 'id'>) }) as Account,
    );
    return accounts.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Account | null> {
    const snapshot = await getDoc(doc(db, COLLECTION, id));
    if (!snapshot.exists()) {
      return null;
    }
    return { id: snapshot.id, ...(snapshot.data() as Omit<Account, 'id'>) } as Account;
  }

  async create(data: Omit<Account, 'id' | 'userId'>): Promise<string> {
    const userId = this.requireUserId();
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({ ...data, userId }));
    return ref.id;
  }

  async update(id: string, data: Partial<Omit<Account, 'id' | 'userId'>>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), stripUndefined(data));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), { active });
  }
}
