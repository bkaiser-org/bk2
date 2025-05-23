import { Component, linkedSignal, model } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { CategoryComponent, CheckboxComponent, NumberInputComponent, StringSelectComponent, TextInputComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ImageAction, Slot } from '@bk2/shared/models';
import { ImageActions } from '@bk2/shared/categories';
import { newDefaultImageConfig, SectionFormModel } from '@bk2/cms/section/util';

@Component({
  selector: 'bk-image-config-form',
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid,
    CheckboxComponent, TextInputComponent, NumberInputComponent, StringSelectComponent, CategoryComponent
  ],
  template: `
    <ion-row>
      <ion-col size="12">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ '@content.section.forms.imageConfig.title' | translate | async }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">  
                  <bk-text-input name="imgIxParams" [(value)]="imgIxParams" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="width" [(value)]="width" />
                </ion-col>  
                <ion-col size="12" size-md="6"> 
                  <bk-number-input name="height" [(value)]="height" />
                </ion-col>  
                <ion-col size="12" size-md="6">
                  <bk-number-input name="borderRadius" [(value)]="borderRadius" [showHelper]=true />
                </ion-col>  
                <ion-col size="12" size-md="6">
                    <bk-cat name="imageAction" [(value)]="imageAction" [categories]="imageActions" />
                </ion-col>  
                <ion-col size="12" size-md="6">
                  <bk-number-input name="zoomFactor" [(value)]="zoomFactor" [showHelper]=true />
                </ion-col>  
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="isThumbnail" [isChecked]="isThumbnail()" />
                </ion-col>  
                <ion-col size="12" size-md="6">
                  <bk-string-select name="slot"  [selectedString]="slot()" [stringList] = "['start', 'end', 'icon-only']" (changed)="onSlotChanged($event)" />           
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </ion-col>
    </ion-row>
  `
})
export class ImageConfigFormComponent {
  public vm = model.required<SectionFormModel>();
  protected defaultImageConfig = newDefaultImageConfig();

  protected imgIxParams = linkedSignal(() => this.vm().properties?.defaultImageConfig?.imgIxParams ?? this.defaultImageConfig.imgIxParams ?? '');
  protected width =       linkedSignal(() => this.vm().properties?.defaultImageConfig?.width ?? this.defaultImageConfig.width ?? 160);
  protected height =      linkedSignal(() => this.vm().properties?.defaultImageConfig?.height ?? this.defaultImageConfig.height ?? 90);
  protected borderRadius =linkedSignal(() => this.vm().properties?.defaultImageConfig?.borderRadius ?? this.defaultImageConfig.borderRadius ?? 0);
  protected imageAction = linkedSignal(() => this.vm().properties?.defaultImageConfig?.imageAction ?? this.defaultImageConfig.imageAction ?? ImageAction.None);
  protected zoomFactor =  linkedSignal(() => this.vm().properties?.defaultImageConfig?.zoomFactor ?? this.defaultImageConfig.zoomFactor ?? 2);
  protected isThumbnail = linkedSignal(() => this.vm().properties?.defaultImageConfig?.isThumbnail ?? this.defaultImageConfig.isThumbnail ?? false);
  protected slot =        linkedSignal(() => this.vm().properties?.defaultImageConfig?.slot ?? this.defaultImageConfig.slot ?? 'none');

  protected IA = ImageAction; 
  protected imageActions = ImageActions;

  onSlotChanged(slot: string) {
    this.slot.set(slot as Slot);
  }
}
