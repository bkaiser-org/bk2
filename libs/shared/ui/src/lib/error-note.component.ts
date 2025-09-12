import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonItem, IonNote } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';

@Component({
  selector: 'bk-error-note',
  standalone: true,
  imports: [
    IonNote, IonItem
  ],
  template: `
    @if(hasErrors()) {
      <ion-item lines="none">
        <ion-note color="danger">{{error()}}</ion-note>
      </ion-item>
    }
  `
})
export class ErrorNoteComponent {
  private readonly translocoService = inject(TranslocoService);

  public errors = input.required<string[]>();
  public color = input<ColorIonic>(ColorIonic.Danger);

  protected hasErrors = computed(() => this.errors().length > 0);
  private readonly errorRef = rxResource({
    params: () => ({
      errors: this.errors()
    }),
    stream: ({params}) => this.translate(params.errors) });
  protected error = computed (() => this.errorRef.value() as string);
  
  protected colorsIonic = ColorsIonic;

  private translate(keys: string[]): Observable<string> {
    if (!keys || keys.length === 0) return of('');
    const _key = keys[0];
    if (_key.startsWith('@')) {
      return this.translocoService.selectTranslate(_key.substring(1));
    } else {  
      return of(_key);
    } 
  }
}
