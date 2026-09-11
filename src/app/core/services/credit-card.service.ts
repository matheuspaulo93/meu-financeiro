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
import { CreditCard } from '../../models';

const COLLECTION = 'creditCards';

@Injectable({ providedIn: 'root' })
export class CreditCardService {
  private requireUserId(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  /** ordenado no cliente por nome para evitar a necessidade de índice composto no Firestore */
  async list(): Promise<CreditCard[]> {
    const userId = this.requireUserId();
    const q = query(collection(db, COLLECTION), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const cards = snapshot.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<CreditCard, 'id'>) }) as CreditCard,
    );
    return cards.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<CreditCard | null> {
    const snapshot = await getDoc(doc(db, COLLECTION, id));
    if (!snapshot.exists()) {
      return null;
    }
    return { id: snapshot.id, ...(snapshot.data() as Omit<CreditCard, 'id'>) } as CreditCard;
  }

  async create(data: Omit<CreditCard, 'id' | 'userId'>): Promise<string> {
    const userId = this.requireUserId();
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({ ...data, userId }));
    return ref.id;
  }

  async update(id: string, data: Partial<Omit<CreditCard, 'id' | 'userId'>>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), stripUndefined(data));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), { active });
  }
}

