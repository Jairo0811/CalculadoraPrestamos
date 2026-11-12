import { Injectable } from '@angular/core';

/** Confirmaciones accesibles con SweetAlert2 cargado solo cuando se necesita. */
@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  async ask(title: string, message: string, confirmLabel: string): Promise<boolean> {
    const { default: Swal } = await import('sweetalert2');
    const answer = await Swal.fire({
      title,
      text: message,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: confirmLabel,
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      focusCancel: true,
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn btn-danger',
        cancelButton: 'btn btn-outline-secondary'
      }
    });
    return answer.isConfirmed;
  }
}
