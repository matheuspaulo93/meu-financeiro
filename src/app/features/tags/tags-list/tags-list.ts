import { Component, inject, signal } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TagService } from '../../../core/services/tag.service';
import { Tag } from '../../../models';
import { TagDialog } from '../tag-dialog/tag-dialog';

@Component({
  selector: 'app-tags-list',
  standalone: true,
  imports: [
    MatDialogModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './tags-list.html',
  styleUrl: './tags-list.scss',
})
export class TagsList {
  private readonly tagService = inject(TagService);
  private readonly dialog = inject(MatDialog);

  readonly tags = signal<Tag[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  openTagDialog(tag?: Tag): void {
    const ref = this.dialog.open(TagDialog, { data: { tag: tag ?? null }, width: '360px' });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.reload();
    });
  }

  async remove(tag: Tag): Promise<void> {
    if (!confirm(`Excluir a tag "${tag.name}"?`)) {
      return;
    }
    try {
      await this.tagService.remove(tag.id);
      await this.reload();
    } catch (error) {
      console.error('Erro ao excluir tag', error);
      this.errorMessage.set('Não foi possível excluir a tag.');
    }
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.tags.set(await this.tagService.list());
    } catch (error) {
      console.error('Erro ao carregar tags', error);
      this.errorMessage.set('Não foi possível carregar as tags.');
    } finally {
      this.loading.set(false);
    }
  }
}
