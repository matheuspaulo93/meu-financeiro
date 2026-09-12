import { Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { Account, Transaction } from '../../models';
import { auth, db } from '../firebase/firebase';
import {
  BalanceScopeAccountId,
  computeTransactionBalanceDelta,
  transactionAffectsBalance,
} from '../../shared/util/transaction-balance.util';
import { formatIsoDate, parseIsoDate } from '../../shared/util/date.util';

const BALANCES_COLLECTION = 'monthlyBalances';
const TRANSACTIONS_COLLECTION = 'transactions';

interface MonthlyBalanceSnapshot {
  userId: string;
  scopeType: 'all' | 'account';
  accountId?: string;
  month: string;
  closingBalance: number;
  updatedAt: string;
}

interface TransactionMutation {
  before?: Transaction | null;
  after?: Transaction | null;
}

@Injectable({ providedIn: 'root' })
export class MonthlyBalanceService {
  private requireUserId(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  async getPreviousMonthClosingBalance(
    monthStart: Date,
    accounts: Account[],
    accountId: BalanceScopeAccountId,
  ): Promise<number> {
    const previousMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    return this.getClosingBalance(previousMonth, accounts, accountId);
  }

  async invalidateTransactionMutation(
    before?: Transaction | null,
    after?: Transaction | null,
  ): Promise<void> {
    await this.invalidateTransactionMutations([{ before, after }]);
  }

  async invalidateTransactionMutations(changes: TransactionMutation[]): Promise<void> {
    const userId = this.requireUserId();
    const invalidations = new Map<string, { accountId: BalanceScopeAccountId; fromMonth: string }>();

    for (const change of changes) {
      this.collectInvalidations(invalidations, change.before);
      this.collectInvalidations(invalidations, change.after);
    }

    await Promise.all(
      Array.from(invalidations.values()).map(({ accountId, fromMonth }) =>
        this.deleteSnapshotsFromMonth(userId, accountId, fromMonth),
      ),
    );
  }

  async invalidateAccountMutation(
    before?: Account | null,
    after?: Account | null,
  ): Promise<void> {
    const userId = this.requireUserId();
    const invalidations = new Map<string, { accountId: BalanceScopeAccountId; fromMonth: string }>();
    const shouldInvalidateAccountScope =
      (before?.initialBalance ?? 0) !== (after?.initialBalance ?? 0) ||
      (before?.active ?? false) !== (after?.active ?? false) ||
      before?.id !== after?.id;
    const shouldInvalidateAllScope = Boolean(before?.active || after?.active) && shouldInvalidateAccountScope;

    if (shouldInvalidateAccountScope) {
      if (before?.id) {
        invalidations.set(this.scopeKey(before.id), {
          accountId: before.id,
          fromMonth: '0001-01',
        });
      }
      if (after?.id) {
        invalidations.set(this.scopeKey(after.id), {
          accountId: after.id,
          fromMonth: '0001-01',
        });
      }
    }

    if (shouldInvalidateAllScope) {
      invalidations.set(this.scopeKey('all'), { accountId: 'all', fromMonth: '0001-01' });
    }

    await Promise.all(
      Array.from(invalidations.values()).map(({ accountId, fromMonth }) =>
        this.deleteSnapshotsFromMonth(userId, accountId, fromMonth),
      ),
    );
  }

  private async getClosingBalance(
    targetMonth: Date,
    accounts: Account[],
    accountId: BalanceScopeAccountId,
  ): Promise<number> {
    const userId = this.requireUserId();
    const targetMonthKey = this.monthKey(targetMonth);
    const baseInitialBalance = this.baseInitialBalance(accounts, accountId);
    const earliestMonth = await this.getEarliestRelevantMonth(userId, accountId);

    if (!earliestMonth || targetMonthKey < earliestMonth) {
      return baseInitialBalance;
    }

    const cached = await this.getLatestSnapshot(userId, accountId, targetMonthKey);
    let currentMonth = earliestMonth;
    let runningBalance = baseInitialBalance;

    if (cached) {
      if (cached.month === targetMonthKey) {
        return cached.closingBalance;
      }
      currentMonth = this.nextMonthKey(cached.month);
      runningBalance = cached.closingBalance;
    }

    while (currentMonth <= targetMonthKey) {
      runningBalance += await this.computeMonthDelta(userId, currentMonth, accountId);
      await this.saveSnapshot(userId, accountId, currentMonth, runningBalance);
      currentMonth = this.nextMonthKey(currentMonth);
    }

    return runningBalance;
  }

  private async getEarliestRelevantMonth(
    userId: string,
    accountId: BalanceScopeAccountId,
  ): Promise<string | null> {
    const month = accountId === 'all'
      ? await this.findFirstTransactionMonth(userId)
      : await this.findFirstTransactionMonthForAccount(userId, accountId);
    return month;
  }

  private async findFirstTransactionMonth(userId: string): Promise<string | null> {
    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where('userId', '==', userId),
      orderBy('date'),
      limit(1),
    );
    const snapshot = await getDocs(q);
    const first = snapshot.docs[0]?.data()['date'] as string | undefined;
    return first ? first.slice(0, 7) : null;
  }

  private async findFirstTransactionMonthForAccount(
    userId: string,
    accountId: string,
  ): Promise<string | null> {
    const [sourceSnapshot, destinationSnapshot] = await Promise.all([
      getDocs(
        query(
          collection(db, TRANSACTIONS_COLLECTION),
          where('userId', '==', userId),
          where('accountId', '==', accountId),
          orderBy('date'),
          limit(1),
        ),
      ),
      getDocs(
        query(
          collection(db, TRANSACTIONS_COLLECTION),
          where('userId', '==', userId),
          where('destinationAccountId', '==', accountId),
          where('type', '==', 'transfer'),
          orderBy('date'),
          limit(1),
        ),
      ),
    ]);

    const sourceDate = sourceSnapshot.docs[0]?.data()['date'] as string | undefined;
    const destinationDate = destinationSnapshot.docs[0]?.data()['date'] as string | undefined;
    const firstDate = [sourceDate, destinationDate].filter(Boolean).sort()[0];
    return firstDate ? firstDate.slice(0, 7) : null;
  }

  private async getLatestSnapshot(
    userId: string,
    accountId: BalanceScopeAccountId,
    targetMonth: string,
  ): Promise<MonthlyBalanceSnapshot | null> {
    const constraints = [
      where('userId', '==', userId),
      where('scopeType', '==', accountId === 'all' ? 'all' : 'account'),
      where('month', '<=', targetMonth),
      orderBy('month', 'desc'),
      limit(1),
    ] as const;

    const q = accountId === 'all'
      ? query(collection(db, BALANCES_COLLECTION), ...constraints)
      : query(
          collection(db, BALANCES_COLLECTION),
          ...constraints,
          where('accountId', '==', accountId),
        );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as MonthlyBalanceSnapshot;
  }

  private async computeMonthDelta(
    userId: string,
    monthKey: string,
    accountId: BalanceScopeAccountId,
  ): Promise<number> {
    const monthStart = `${monthKey}-01`;
    const monthEnd = formatIsoDate(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0));
    const transactions = await this.listTransactionsByMonth(userId, monthStart, monthEnd, accountId);
    return transactions.reduce(
      (sum, transaction) => sum + computeTransactionBalanceDelta(transaction, accountId),
      0,
    );
  }

  private async listTransactionsByMonth(
    userId: string,
    monthStartIso: string,
    monthEndIso: string,
    accountId: BalanceScopeAccountId,
  ): Promise<Transaction[]> {
    if (accountId === 'all') {
      const snapshot = await getDocs(
        query(
          collection(db, TRANSACTIONS_COLLECTION),
          where('userId', '==', userId),
          where('date', '>=', monthStartIso),
          where('date', '<=', monthEndIso),
          orderBy('date'),
        ),
      );
      return snapshot.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }) as Transaction,
      );
    }

    const [sourceSnapshot, destinationSnapshot] = await Promise.all([
      getDocs(
        query(
          collection(db, TRANSACTIONS_COLLECTION),
          where('userId', '==', userId),
          where('accountId', '==', accountId),
          where('date', '>=', monthStartIso),
          where('date', '<=', monthEndIso),
          orderBy('date'),
        ),
      ),
      getDocs(
        query(
          collection(db, TRANSACTIONS_COLLECTION),
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

  private async saveSnapshot(
    userId: string,
    accountId: BalanceScopeAccountId,
    month: string,
    closingBalance: number,
  ): Promise<void> {
    const scopeType = accountId === 'all' ? 'all' : 'account';
    const snapshot: MonthlyBalanceSnapshot = {
      userId,
      scopeType,
      month,
      closingBalance,
      updatedAt: new Date().toISOString(),
    };

    if (accountId !== 'all') {
      snapshot.accountId = accountId;
    }

    await setDoc(
      doc(db, BALANCES_COLLECTION, this.snapshotId(userId, accountId, month)),
      snapshot,
    );
  }

  private collectInvalidations(
    invalidations: Map<string, { accountId: BalanceScopeAccountId; fromMonth: string }>,
    transaction?: Transaction | null,
  ): void {
    if (!transaction || !transactionAffectsBalance(transaction)) {
      return;
    }

    const fromMonth = transaction.date.slice(0, 7);
    const update = (accountId: BalanceScopeAccountId) => {
      const key = this.scopeKey(accountId);
      const existing = invalidations.get(key);
      if (!existing || fromMonth < existing.fromMonth) {
        invalidations.set(key, { accountId, fromMonth });
      }
    };

    if (transaction.type !== 'transfer') {
      update('all');
    }

    update(transaction.accountId);

    if (transaction.type === 'transfer' && transaction.destinationAccountId) {
      update(transaction.destinationAccountId);
    }
  }

  private async deleteSnapshotsFromMonth(
    userId: string,
    accountId: BalanceScopeAccountId,
    fromMonth: string,
  ): Promise<void> {
    const constraints = [
      where('userId', '==', userId),
      where('scopeType', '==', accountId === 'all' ? 'all' : 'account'),
      where('month', '>=', fromMonth),
      orderBy('month', 'desc'),
    ] as const;

    const q = accountId === 'all'
      ? query(collection(db, BALANCES_COLLECTION), ...constraints)
      : query(
          collection(db, BALANCES_COLLECTION),
          ...constraints,
          where('accountId', '==', accountId),
        );

    const snapshot = await getDocs(q);
    await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
  }

  private baseInitialBalance(accounts: Account[], accountId: BalanceScopeAccountId): number {
    if (accountId === 'all') {
      return accounts.filter((account) => account.active).reduce((sum, account) => sum + account.initialBalance, 0);
    }

    return accounts.find((account) => account.id === accountId)?.initialBalance ?? 0;
  }

  private monthKey(date: Date): string {
    return formatIsoDate(date).slice(0, 7);
  }

  private nextMonthKey(month: string): string {
    const date = parseIsoDate(`${month}-01`);
    return formatIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 1)).slice(0, 7);
  }

  private scopeKey(accountId: BalanceScopeAccountId): string {
    return accountId === 'all' ? 'all' : `account:${accountId}`;
  }

  private snapshotId(userId: string, accountId: BalanceScopeAccountId, month: string): string {
    return `${userId}_${this.scopeKey(accountId)}_${month}`;
  }
}
