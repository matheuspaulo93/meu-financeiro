/** converte uma data ISO (yyyy-MM-dd) em Date local, evitando shift de fuso horário */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** formata um Date local em string ISO (yyyy-MM-dd) */
export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** soma meses a uma data, ajustando o dia se o mês de destino for mais curto (ex.: 31/jan + 1 mês = 28/fev) */
export function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate();
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDayOfTargetMonth));
  return result;
}

/** avança uma data pela frequência informada, um passo por vez */
export function addFrequencyStep(
  date: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  steps = 1,
): Date {
  switch (frequency) {
    case 'daily':
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + steps);
    case 'weekly':
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + steps * 7);
    case 'monthly':
      return addMonthsClamped(date, steps);
  }
}
