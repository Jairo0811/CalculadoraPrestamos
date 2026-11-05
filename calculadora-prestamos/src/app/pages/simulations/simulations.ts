import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { RdCurrencyPipe } from '../../core/formatting/rd-currency';
import { AuthService } from '../../core/services/auth';
import { LoanApiService, PersistedLoanSimulation, toCreatePayload } from '../../core/services/loan-api';
import { LoanCalculatorService } from '../../core/services/loan-calculator';
import { loanTypeLabel, simulationFingerprint, toAnonymousLoanRequest } from '../../core/services/cloud-simulation';

type Filter = 'all' | 'favorites';
type Order = 'recent' | 'oldest' | 'amount' | 'rate';

/** Área privada. No guarda simulaciones en el navegador ni envía datos del solicitante. */
@Component({
  selector: 'app-simulations',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, RdCurrencyPipe, RouterLink],
  templateUrl: './simulations.html',
  styleUrl: './simulations.css'
})
export class Simulations implements OnInit {
  private readonly api = inject(LoanApiService);
  private readonly loanCalculator = inject(LoanCalculatorService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly busy = signal<string | null>(null);
  readonly items = signal<PersistedLoanSimulation[]>([]);
  readonly filter = signal<Filter>('all');
  readonly order = signal<Order>('recent');
  readonly search = signal('');
  readonly selected = signal<string[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  editName = '';

  readonly total = computed(() => this.items().length);
  readonly favorites = computed(() => this.items().filter(item => item.isFavorite).length);
  readonly totalSimulated = computed(() => this.items().reduce((sum, item) => sum + Number(item.amount), 0));
  readonly averageRate = computed(() => this.total()
    ? this.items().reduce((sum, item) => sum + Number(item.annualRate), 0) / this.total()
    : 0);

  readonly visible = computed(() => {
    const search = this.search().trim().toLocaleLowerCase('es-DO');
    const list = this.items().filter(item =>
      (this.filter() !== 'favorites' || item.isFavorite) &&
      (!search || item.name.toLocaleLowerCase('es-DO').includes(search) ||
        loanTypeLabel(item.loanType).toLocaleLowerCase('es-DO').includes(search))
    );
    return [...list].sort((a, b) => {
      switch (this.order()) {
        case 'oldest': return Date.parse(a.createdAtUtc) - Date.parse(b.createdAtUtc);
        case 'amount': return Number(b.amount) - Number(a.amount);
        case 'rate': return Number(a.annualRate) - Number(b.annualRate);
        default: return Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc);
      }
    });
  });

  readonly comparisons = computed(() => this.selected()
    .map(id => this.items().find(item => item.id === id))
    .filter((item): item is PersistedLoanSimulation => !!item)
    .map(item => {
      const result = this.loanCalculator.calculate(toAnonymousLoanRequest(item));
      return {
        id: item.id,
        name: item.name,
        monthlyPayment: result.monthlyPayment,
        totalInterest: result.totalInterest,
        totalPayment: result.totalPayment,
        termMonths: item.termMonths
      };
    })
  );

  ngOnInit(): void {
    this.reload();
  }

  loanType(value: number): string {
    return loanTypeLabel(value);
  }

  monthlyPayment(item: PersistedLoanSimulation): number {
    const amount = Number(item.amount);
    const monthlyRate = Number(item.annualRate) / 1200;
    const term = Number(item.termMonths);
    if (!Number.isFinite(amount) || !Number.isFinite(monthlyRate) || !Number.isInteger(term) || term <= 0) return 0;
    if (monthlyRate === 0) return amount / term;
    return amount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -term));
  }

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => {
        this.items.set(items);
        this.selected.update(ids => ids.filter(id => items.some(item => item.id === id)));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No pudimos cargar tus simulaciones. Comprueba tu conexión o vuelve a iniciar sesión.');
        this.loading.set(false);
      }
    });
  }

  toggleFavorite(item: PersistedLoanSimulation): void {
    if (this.busy()) return;
    this.busy.set(item.id);
    this.error.set('');
    this.api.setFavorite(item.id, !item.isFavorite).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        this.replace(updated);
        this.busy.set(null);
        this.notice.set(updated.isFavorite ? 'Simulación añadida a favoritos.' : 'Simulación retirada de favoritos.');
      },
      error: () => {
        this.error.set('No pudimos modificar el favorito. Inténtalo nuevamente.');
        this.busy.set(null);
      }
    });
  }

  beginRename(item: PersistedLoanSimulation): void {
    this.editingId.set(item.id);
    this.editName = item.name;
    this.error.set('');
  }

  cancelRename(): void {
    this.editingId.set(null);
    this.editName = '';
  }

  rename(item: PersistedLoanSimulation): void {
    const name = this.editName.trim();
    if (!name || name.length > 120) {
      this.error.set('El nombre debe tener entre 1 y 120 caracteres.');
      return;
    }
    if (name === item.name) {
      this.cancelRename();
      return;
    }
    if (this.busy()) return;
    this.busy.set(item.id);
    this.error.set('');
    this.api.rename(item.id, name).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        this.replace(updated);
        this.busy.set(null);
        this.cancelRename();
        this.notice.set('Nombre actualizado.');
      },
      error: () => {
        this.error.set('No pudimos cambiar el nombre.');
        this.busy.set(null);
      }
    });
  }

  delete(item: PersistedLoanSimulation): void {
    if (this.busy() || typeof window === 'undefined' ||
        !window.confirm(`¿Eliminar definitivamente “${item.name}” de tu cuenta?`)) return;
    this.busy.set(item.id);
    this.error.set('');
    this.api.delete(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.items.update(items => items.filter(existing => existing.id !== item.id));
        this.selected.update(ids => ids.filter(id => id !== item.id));
        this.busy.set(null);
        this.notice.set('Simulación eliminada de tu cuenta.');
      },
      error: () => {
        this.error.set('No pudimos eliminar esta simulación. Inténtalo de nuevo.');
        this.busy.set(null);
      }
    });
  }

  open(item: PersistedLoanSimulation): void {
    try {
      // Reconstruye la amortización localmente: la API solo conserva términos financieros.
      // Esta operación nunca reintroduce datos personales de otro resultado local.
      const result = this.loanCalculator.calculate(toAnonymousLoanRequest(item));
      this.loanCalculator.saveResult(result);
      void this.router.navigate(['/results']);
    } catch {
      this.error.set('No fue posible abrir esta simulación. Comprueba sus condiciones.');
    }
  }

  toggleCompare(item: PersistedLoanSimulation): void {
    const ids = this.selected();
    if (ids.includes(item.id)) {
      this.selected.set(ids.filter(id => id !== item.id));
    } else if (ids.length < 2) {
      this.selected.set([...ids, item.id]);
    } else {
      this.notice.set('Puedes comparar hasta dos simulaciones a la vez.');
    }
  }

  clearComparison(): void {
    this.selected.set([]);
  }

  /** Importación voluntaria: no se sincroniza información local sin consentimiento explícito. */
  async importLocal(): Promise<void> {
    if (this.busy() || typeof window === 'undefined') return;
    const history = this.loanCalculator.getHistory();
    const known = new Set(this.items().map(simulationFingerprint));
    const pending = history.map(item => ({ request: item.request, payload: toCreatePayload(item.request) }))
      .filter(item => !known.has(simulationFingerprint(item.payload)));
    const unique = pending.filter((item, index, all) =>
      all.findIndex(other => simulationFingerprint(other.payload) === simulationFingerprint(item.payload)) === index
    );
    if (unique.length === 0) {
      this.notice.set('No hay simulaciones locales nuevas para importar.');
      return;
    }
    if (!window.confirm(`¿Importar ${unique.length} simulación(es) locales a tu cuenta? Solo se enviarán tipo, monto, tasa y plazo; nunca nombre, cédula ni fecha de nacimiento.`)) return;

    this.busy.set('import');
    this.notice.set('');
    this.error.set('');
    let completed = 0;
    try {
      for (const item of unique) {
        const saved = await firstValueFrom(this.api.saveSimulation(item.request));
        known.add(simulationFingerprint(item.payload));
        this.items.update(items => [saved, ...items]);
        completed++;
      }
      this.notice.set(`Se importaron ${completed} simulaciones. El historial local permanece intacto.`);
    } catch {
      this.error.set(`Se importaron ${completed} de ${unique.length} simulaciones. No se eliminó el historial local; puedes reintentar.`);
    } finally {
      this.busy.set(null);
    }
  }

  private replace(updated: PersistedLoanSimulation): void {
    this.items.update(items => items.map(item => item.id === updated.id ? updated : item));
  }
}
