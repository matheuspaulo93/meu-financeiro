import { Injectable, signal } from '@angular/core';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../firebase/firebase';

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** usuário autenticado atual, ou null enquanto não resolvido/deslogado */
  readonly currentUser = signal<User | null>(null);
  /** true até o Firebase resolver o estado inicial de autenticação */
  readonly loading = signal(true);

  constructor() {
    onAuthStateChanged(auth, (user) => {
      this.currentUser.set(user);
      this.loading.set(false);
    });
  }

  login(email: string, password: string): Promise<void> {
    return signInWithEmailAndPassword(auth, email, password).then(() => undefined);
  }

  register(email: string, password: string): Promise<void> {
    return createUserWithEmailAndPassword(auth, email, password).then(() => undefined);
  }

  logout(): Promise<void> {
    return signOut(auth);
  }

  /** resolve assim que o Firebase souber se há usuário logado ou não */
  waitUntilReady(): Promise<void> {
    return auth.authStateReady();
  }
}
