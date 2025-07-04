import { Component, input } from '@angular/core';
import { IonItem, IonLabel } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared/categories';
import { CategoryPlainNamePipe } from '@bk2/shared/pipes';
import { ColorIonic } from '@bk2/shared/models';

@Component({
  selector: 'bk-label',
  imports: [
    CategoryPlainNamePipe,
    IonItem, IonLabel
  ],
  template: `
    <ion-item [lines]="lines()" [slot]="slot()" [color]="color() | categoryPlainName:colorsIonic">
      <ion-label>{{ label() }}</ion-label>
    </ion-item>
  `
})
export class LabelComponent {
  public lines = input<'none' | 'full' | 'inset'>('inset');
  public label = input<string>();
  public color = input<ColorIonic>(ColorIonic.Primary);
  public slot = input<'start' | 'end' | 'icon-only'>('start');

  protected colorsIonic = ColorsIonic;
}
