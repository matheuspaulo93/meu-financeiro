import { Injectable } from '@angular/core';
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';
import { stripUndefined } from '../firebase/firestore.util';
import { Tag } from '../../models';

const COLLECTION = 'tags';

@Injectable({ providedIn: 'root' })
export class TagService {
  private requireUserId(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  /** ordenado no cliente para evitar a necessidade de índice composto no Firestore */
  async list(): Promise<Tag[]> {
    const userId = this.requireUserId();
    const q = query(collection(db, COLLECTION), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const tags = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Tag, 'id'>) }) as Tag);
    return tags.sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(data: Omit<Tag, 'id' | 'userId'>): Promise<string> {
    const userId = this.requireUserId();
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({ ...data, userId }));
    return ref.id;
  }

  async update(id: string, data: Partial<Omit<Tag, 'id' | 'userId'>>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), stripUndefined(data));
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
  }
}
