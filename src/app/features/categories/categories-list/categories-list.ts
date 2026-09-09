import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CategoryService } from '../../../core/services/category.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { Category, Subcategory } from '../../../models';
import { CategoryDialog } from '../category-dialog/category-dialog';
import { SubcategoryDialog } from '../subcategory-dialog/subcategory-dialog';

@Component({
  selector: 'app-categories-list',
  standalone: true,
  imports: [
    MatDialogModule,
    MatExpansionModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './categories-list.html',
  styleUrl: './categories-list.scss',
})
export class CategoriesList {
  private readonly categoryService = inject(CategoryService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly dialog = inject(MatDialog);

  readonly categories = signal<Category[]>([]);
  readonly subcategories = signal<Subcategory[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly groups = computed(() => [
    { label: 'Receitas', categories: this.categories().filter((c) => c.type === 'income') },
    { label: 'Despesas', categories: this.categories().filter((c) => c.type === 'expense') },
  ]);

  constructor() {
    this.reload();
  }

  subcategoriesFor(categoryId: string): Subcategory[] {
    return this.subcategories().filter((s) => s.categoryId === categoryId);
  }

  openCategoryDialog(category?: Category): void {
    const ref = this.dialog.open(CategoryDialog, {
      data: { category: category ?? null },
      width: '400px',
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.reload();
    });
  }

  openSubcategoryDialog(categoryId: string, subcategory?: Subcategory): void {
    const ref = this.dialog.open(SubcategoryDialog, {
      data: { categoryId, subcategory: subcategory ?? null },
      width: '400px',
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.reload();
    });
  }

  async toggleCategoryActive(category: Category): Promise<void> {
    await this.categoryService.setActive(category.id, !category.active);
    await this.reload();
  }

  async toggleSubcategoryActive(subcategory: Subcategory): Promise<void> {
    await this.subcategoryService.setActive(subcategory.id, !subcategory.active);
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [categories, subcategories] = await Promise.all([
        this.categoryService.list(),
        this.subcategoryService.list(),
      ]);
      this.categories.set(categories);
      this.subcategories.set(subcategories);
    } catch (error) {
      console.error('Erro ao carregar categorias', error);
      this.errorMessage.set('Não foi possível carregar as categorias.');
    } finally {
      this.loading.set(false);
    }
  }
}
