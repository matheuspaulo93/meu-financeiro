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
import { Subcategory } from '../../models';

const COLLECTION = 'subcategories';

@Injectable({ providedIn: 'root' })
export class SubcategoryService {
  private requireUserId(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  /** todas as subcategorias do usuário; agrupe por categoryId no cliente conforme necessário */
  async list(): Promise<Subcategory[]> {
    const userId = this.requireUserId();
    const q = query(collection(db, COLLECTION), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const subcategories = snapshot.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<Subcategory, 'id'>) }) as Subcategory,
    );
    return subcategories.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Subcategory | null> {
    const snapshot = await getDoc(doc(db, COLLECTION, id));
    if (!snapshot.exists()) {
      return null;
    }
    return { id: snapshot.id, ...(snapshot.data() as Omit<Subcategory, 'id'>) } as Subcategory;
  }

  async create(data: Omit<Subcategory, 'id' | 'userId'>): Promise<string> {
    const userId = this.requireUserId();
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({ ...data, userId }));
    return ref.id;
  }

  async update(id: string, data: Partial<Omit<Subcategory, 'id' | 'userId'>>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), stripUndefined(data));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), { active });
  }
}
