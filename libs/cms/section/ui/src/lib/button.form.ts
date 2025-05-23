import { Component, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { Button, ColorIonic } from '@bk2/shared/models';
import { CategoryComponent, StringSelectComponent, TextInputComponent } from '@bk2/shared/ui';
import { ColorsIonic } from '@bk2/shared/categories';
import { SizeMask } from '@bk2/shared/config';

@Component({
  selector: 'bk-button-form',
  imports: [
    IonGrid, IonRow, IonCol,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle,
    CategoryComponent, TextInputComponent, StringSelectComponent
  ],
  template: `
    @if(button(); as button) {
      <ion-row>
        <ion-col size="12"> 
          <ion-card>
            <ion-card-header>
              <ion-card-title>Button - Konfiguration</ion-card-title>
              <ion-card-subtitle>Definiere wie der Button aussehen soll.</ion-card-subtitle>
            </ion-card-header>
            <ion-card-content>
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">                            <!-- button label -->           
                    <bk-text-input name="buttonLabel" [(value)]="label" [showHelper]=true />
                  </ion-col>
                  <ion-col size="12" size-md="6">                                <!-- color -->
                    <bk-cat name="color" [(value)]="color" [categories]="colorsIonic" />
                  </ion-col>
                  <ion-col size="12" size-md="6">                            <!-- button shape --> 
                    <bk-string-select name="buttonShape"  [selectedString]="button.shape ?? 'default'" [stringList] = "['default', 'round']" />
                  </ion-col>
                  <ion-col size="12" size-md="6">                            <!-- button fill -->
                    <bk-string-select name="buttonFill" [selectedString]="button.fill ?? 'default'" [stringList] = "['default', 'clear', 'outline', 'solid']" />
                  </ion-col>
                  <ion-col size="12" size-md="6">                            <!-- button width -->
                    <bk-text-input name="buttonWidth" [(value)]="width" [mask]="sizeMask" [maxLength]=3 [showHelper]=true />                             
                  </ion-col>
                  <ion-col size="12" size-md="6">                            <!-- button height -->           
                    <bk-text-input name="buttonHeight" [(value)]="height" [mask]="sizeMask" [maxLength]=3 [showHelper]=true />                             
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>
    }
  `
})
export class ButtonFormComponent {
  public button = model.required<Button>();
  protected label = linkedSignal(() => this.button().label ?? '');
  protected color = linkedSignal(() => this.button().color ?? ColorIonic.Primary);
  protected width = linkedSignal(() => this.button().width ?? '');
  protected height = linkedSignal(() => this.button().height ?? '');

  protected colorsIonic = ColorsIonic;
  protected sizeMask = SizeMask;
}
